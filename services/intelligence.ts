import "server-only";

import { throwIfDbError } from "@/lib/errors";
import type { Observation } from "@/lib/db/types";
import type { ExecutionContext } from "@/lib/households/context";
import { BRIEFING_CANDIDATES } from "@/lib/intelligence/briefing";

/**
 * On-demand detector refresh (server-side, per household, throttled and serialized in the
 * database). Detectors and ranking are deterministic SQL; no model is involved.
 */
export async function refreshObservations(ctx: ExecutionContext) {
  const { error } = await ctx.supabase.rpc("refresh_observations", { p_household_id: ctx.household.id });
  throwIfDbError(error);
}

/** Active observations readable by the caller (RLS), ranked: score desc, created_at, id. */
export async function listActiveObservations(ctx: ExecutionContext, limit = BRIEFING_CANDIDATES): Promise<Observation[]> {
  const { data, error } = await ctx.supabase
    .from("observations")
    .select("id, type, title, description, source_type, source_id, visibility, priority_score, confidence, data, created_at, valid_until")
    .eq("household_id", ctx.household.id)
    .eq("state", "active")
    .order("priority_score", { ascending: false })
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(limit);
  throwIfDbError(error);
  return (data ?? []) as Observation[];
}

export async function dismissObservation(ctx: ExecutionContext, id: string) {
  const { error } = await ctx.supabase.rpc("dismiss_observation", { p_observation_id: id });
  throwIfDbError(error);
}
