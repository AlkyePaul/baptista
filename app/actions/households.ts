"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { run } from "@/lib/actions";
import { DomainError, type ActionState } from "@/lib/errors";
import { requireUser } from "@/lib/auth/session";
import { defaultDisplayName, getUserContext, HOUSEHOLD_COOKIE, requireExecutionContext } from "@/lib/households/context";
import { uuidSchema } from "@/lib/households/permissions";
import * as households from "@/services/households";
import { parseForm } from "@/services/shared";
import { createClient } from "@/lib/supabase/server";

const COOKIE_OPTIONS = { httpOnly: true, sameSite: "lax" as const, path: "/", maxAge: 60 * 60 * 24 * 365 };

export async function createHouseholdAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(households.householdSchema, formData);
  if (!parsed.ok) return parsed.state;
  const ctx = await getUserContext();
  let id = "";
  const state = await run(async () => {
    id = await households.createHousehold(ctx, parsed.data);
  });
  if (!state.ok) return state;
  (await cookies()).set(HOUSEHOLD_COOKIE, id, COOKIE_OPTIONS);
  redirect("/");
}

export async function selectHouseholdAction(householdId: string) {
  const ctx = await getUserContext();
  // The cookie is only a hint, but never store a household the user is not active in.
  if (ctx.memberships.some((m) => m.household_id === householdId)) {
    (await cookies()).set(HOUSEHOLD_COOKIE, householdId, COOKIE_OPTIONS);
  }
  redirect("/");
}

export async function respondToInviteAction(householdId: string, accept: boolean): Promise<ActionState> {
  const ctx = await getUserContext();
  const state = await run(() => households.respondToInvite(ctx, uuidSchema.parse(householdId), accept));
  if (state.ok && accept) {
    (await cookies()).set(HOUSEHOLD_COOKIE, householdId, COOKIE_OPTIONS);
    redirect("/");
  }
  return state;
}

export async function updateHouseholdAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(households.updateHouseholdSchema, formData);
  if (!parsed.ok) return parsed.state;
  const ctx = await requireExecutionContext();
  return run(() => households.updateHousehold(ctx, parsed.data), "Casa aggiornata.");
}

export async function inviteMemberAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(households.inviteSchema, formData);
  if (!parsed.ok) return parsed.state;
  const ctx = await requireExecutionContext();
  let code: string | null = null;
  const state = await run(async () => {
    code = await households.inviteMember(ctx, parsed.data.email);
  });
  if (!state.ok) return state;
  if (!code) return { ok: true, message: "Invito inviato. La persona lo vedrà al prossimo accesso." };
  const shown = `${String(code).slice(0, 4)}-${String(code).slice(4)}`;
  return {
    ok: true,
    message: `Codice invito per ${parsed.data.email}: ${shown}. Mandalo tu alla persona: le servirà per entrare in Baptista. Vale 14 giorni e si può usare una sola volta.`,
  };
}

export async function cancelInvitationAction(email: string): Promise<ActionState> {
  const ctx = await requireExecutionContext();
  return run(() => households.cancelInvitation(ctx, email), "Invito annullato.");
}

/** Redeems an invite code: works with or without a Baptista profile (see /invito). */
export async function claimInvitationAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(households.inviteCodeSchema, formData);
  if (!parsed.ok) return parsed.state;
  const user = await requireUser();
  const supabase = await createClient();
  let householdId: string | null = null;
  const state = await run(async () => {
    householdId = await households.claimInvitation({ supabase }, parsed.data.code, defaultDisplayName(user.email));
  });
  if (!state.ok) return state;
  if (!householdId) {
    return {
      ok: false,
      message: `Codice non valido o scaduto per ${user.email ?? "questo account"}. Controlla di aver usato l'email invitata, oppure chiedi un nuovo invito.`,
    };
  }
  (await cookies()).set(HOUSEHOLD_COOKIE, householdId, COOKIE_OPTIONS);
  redirect("/");
}

export async function removeMemberAction(userId: string): Promise<ActionState> {
  const ctx = await requireExecutionContext();
  const leaving = userId === ctx.user.id;
  const state = await run(() => households.removeMember(ctx, uuidSchema.parse(userId)));
  if (state.ok && leaving) {
    (await cookies()).delete(HOUSEHOLD_COOKIE);
    redirect("/");
  }
  return state;
}

export async function transferOwnershipAction(userId: string): Promise<ActionState> {
  const ctx = await requireExecutionContext();
  return run(async () => {
    if (ctx.role !== "owner") throw new DomainError("forbidden");
    await households.transferOwnership(ctx, uuidSchema.parse(userId));
  }, "Proprietà trasferita.");
}

export async function updateProfileAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(households.profileSchema, formData);
  if (!parsed.ok) return parsed.state;
  const ctx = await getUserContext();
  return run(() => households.updateProfile(ctx, parsed.data.display_name), "Profilo aggiornato.");
}
