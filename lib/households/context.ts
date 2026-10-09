import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser, type SessionUser } from "@/lib/auth/session";
import type { Household, MemberRole, Membership } from "@/lib/db/types";
import { createClient } from "@/lib/supabase/server";

export const HOUSEHOLD_COOKIE = "baptista_household";

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

export type UserContext = {
  user: SessionUser;
  supabase: SupabaseServerClient;
  displayName: string;
  memberships: Membership[];
  pendingInvites: Membership[];
};

/**
 * Server-side execution context for every household-scoped operation. The household comes from
 * a cookie *hint* that is always re-validated against active memberships in the database.
 */
export type ExecutionContext = UserContext & {
  household: Household;
  role: MemberRole;
};

function defaultDisplayName(email: string | null) {
  const local = email?.split("@")[0]?.replace(/[._-]+/g, " ").trim();
  if (!local) return "Io";
  return local.charAt(0).toUpperCase() + local.slice(1, 60);
}

export const getUserContext = cache(async (): Promise<UserContext> => {
  const user = await requireUser();
  const supabase = await createClient();

  // Idempotent Baptista profile provisioning (never copies GuideApp data or edits auth.users).
  let { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile) {
    await supabase
      .from("profiles")
      .upsert({ user_id: user.id, display_name: defaultDisplayName(user.email) }, { onConflict: "user_id", ignoreDuplicates: true });
    ({ data: profile } = await supabase.from("profiles").select("display_name").eq("user_id", user.id).maybeSingle());
  }

  const { data: rows } = await supabase
    .from("household_members")
    .select("household_id, role, state, household:households(id, name, timezone, version)")
    .eq("user_id", user.id)
    .in("state", ["active", "pending"])
    .order("created_at", { ascending: true });

  const all = ((rows ?? []) as unknown as Membership[]).filter((m) => m.household);
  return {
    user,
    supabase,
    displayName: profile?.display_name ?? defaultDisplayName(user.email),
    memberships: all.filter((m) => m.state === "active"),
    pendingInvites: all.filter((m) => m.state === "pending"),
  };
});

export const getExecutionContext = cache(async (): Promise<ExecutionContext | null> => {
  const ctx = await getUserContext();
  if (!ctx.memberships.length) return null;
  const hint = (await cookies()).get(HOUSEHOLD_COOKIE)?.value;
  // Revoked or forged hint: fall back explicitly to the first active membership.
  const current = ctx.memberships.find((m) => m.household_id === hint) ?? ctx.memberships[0];
  return { ...ctx, household: current.household, role: current.role };
});

/** For pages and actions that need a household: redirects to onboarding when there is none. */
export async function requireExecutionContext(): Promise<ExecutionContext> {
  const ctx = await getExecutionContext();
  if (!ctx) redirect("/benvenuto");
  return ctx;
}
