import "server-only";

import { throwIfDbError } from "@/lib/errors";
import type { ExecutionContext } from "@/lib/households/context";

/**
 * On-demand detector refresh (server-side, per household, throttled and serialized in the
 * database). Detectors and ranking are deterministic SQL; no model is involved.
 */
export async function refreshObservations(ctx: ExecutionContext) {
  const { error } = await ctx.supabase.rpc("refresh_observations", { p_household_id: ctx.household.id });
  throwIfDbError(error);
}
