import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { requireUser, type SessionUser } from "@/lib/auth/session";
import type { Household, MemberRole, Membership } from "@/lib/db/types";
import { createClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type UserContext = {
  user: SessionUser;
  supabase: SupabaseServerClient;
  displayName: string;
  memberships: Membership[];
};

/**
 * Server-side execution context for every household-scoped operation. The household is the
 * caller's active membership, which `baptista.app_users` assigns (D33); never taken from the client.
 */
export type ExecutionContext = UserContext & {
  household: Household;
  role: MemberRole;
};

export const getUserContext = cache(async (): Promise<UserContext> => {
  const user = await requireUser();
  const supabase = await createClient();

  // Only accounts listed in baptista.app_users get a profile (D33). A shared-Auth session
  // (e.g. a GuideApp account) alone grants nothing.
  const { data: profile } = await supabase.from("profiles").select("display_name").eq("user_id", user.id).maybeSingle();
  if (!profile) redirect("/accesso-negato");

  const { data: rows } = await supabase
    .from("household_members")
    .select("household_id, role, state, household:households(id, name, timezone, version)")
    .eq("user_id", user.id)
    .eq("state", "active")
    .order("created_at", { ascending: true });

  return {
    user,
    supabase,
    displayName: profile.display_name,
    memberships: ((rows ?? []) as unknown as Membership[]).filter((m) => m.household),
  };
});

export const getExecutionContext = cache(async (): Promise<ExecutionContext | null> => {
  const ctx = await getUserContext();
  const current = ctx.memberships[0];
  if (!current) return null;
  return { ...ctx, household: current.household, role: current.role };
});

/** For pages and actions that need a household: none means the account is not (or no longer) allowed. */
export async function requireExecutionContext(): Promise<ExecutionContext> {
  const ctx = await getExecutionContext();
  if (!ctx) redirect("/accesso-negato");
  return ctx;
}
