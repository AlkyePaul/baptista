import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";
import { requireUser, type SessionUser } from "@/lib/auth/session";
import type { Household, MemberRole, Membership } from "@/lib/db/types";
import { createAuthenticatedClient } from "@/lib/supabase/server";

type SupabaseServerClient = Awaited<ReturnType<typeof createAuthenticatedClient>>;

export type UserContext = {
  user: SessionUser;
  supabase: SupabaseServerClient;
  displayName: string;
  memberships: Membership[];
};

/**
 * Server-side execution context for every household-scoped operation. The household is the
 * caller's active membership, which `baptista.users` assigns; never taken from the client.
 */
export type ExecutionContext = UserContext & {
  household: Household;
  role: MemberRole;
};

export const getUserContext = cache(async (): Promise<UserContext> => {
  const user = await requireUser();
  const supabase = await createAuthenticatedClient(user.id);

  // Query baptista.users for display name and household info.
  const { data: bu } = await supabase
    .from("users")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();
  if (!bu) redirect("/accesso-negato");

  const { data: rows } = await supabase
    .from("household_members")
    .select("household_id, role, state, household:households(id, name, timezone, version)")
    .eq("user_id", user.id)
    .eq("state", "active")
    .order("created_at", { ascending: true });

  return {
    user,
    supabase,
    displayName: bu.display_name,
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
