import "server-only";

import { z } from "zod";
import { throwIfDbError } from "@/lib/errors";
import type { ExecutionContext, UserContext } from "@/lib/households/context";
import type { DirectoryEntry } from "@/lib/db/types";
import { BAPTISTA_BUCKETS } from "@/lib/supabase/schema";
import { requiredText, versionField } from "@/services/shared";

const timezoneSchema = z
  .string()
  .trim()
  .refine((tz) => {
    try {
      new Intl.DateTimeFormat("it-IT", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Fuso orario non valido.");

export const householdSchema = z.object({
  name: requiredText(80, "Dai un nome alla casa."),
  timezone: timezoneSchema.default("Europe/Rome"),
});

export const updateHouseholdSchema = householdSchema.extend({ version: versionField });

export const inviteSchema = z.object({
  email: z.email("Inserisci un indirizzo email valido.").trim(),
});

export const inviteCodeSchema = z.object({
  code: z
    .string({ error: "Inserisci il codice invito." })
    .trim()
    .transform((code) => code.toUpperCase().replace(/[^A-Z0-9]/g, ""))
    .refine((code) => code.length === 8, "Il codice invito ha 8 caratteri."),
});

export type Invitation = { email: string; expires_at: string; locked: boolean };

export const profileSchema = z.object({
  display_name: requiredText(60, "Inserisci il nome da mostrare."),
});

export async function createHousehold(ctx: UserContext, input: z.infer<typeof householdSchema>) {
  const { data, error } = await ctx.supabase.rpc("create_household", { p_name: input.name, p_timezone: input.timezone });
  throwIfDbError(error);
  return data as string;
}

export async function updateHousehold(ctx: ExecutionContext, input: z.infer<typeof updateHouseholdSchema>) {
  const { error } = await ctx.supabase.rpc("update_household", {
    p_household_id: ctx.household.id,
    p_name: input.name,
    p_timezone: input.timezone,
    p_expected_version: input.version,
  });
  throwIfDbError(error);
}

/** Returns the one-time code to share, or null when the person already uses Baptista. */
export async function inviteMember(ctx: ExecutionContext, email: string): Promise<string | null> {
  const { data, error } = await ctx.supabase.rpc("invite_member", { p_household_id: ctx.household.id, p_email: email });
  throwIfDbError(error);
  return (data as string | null) ?? null;
}

/** Redeems an invite code for the signed-in address; returns the household id, or null if invalid. */
export async function claimInvitation(ctx: Pick<UserContext, "supabase">, code: string, displayName: string) {
  const { data, error } = await ctx.supabase.rpc("claim_invitation", { p_code: code, p_display_name: displayName });
  throwIfDbError(error);
  return (data as string | null) ?? null;
}

export async function listInvitations(ctx: ExecutionContext): Promise<Invitation[]> {
  if (ctx.role !== "owner") return [];
  const { data, error } = await ctx.supabase.rpc("list_invitations", { p_household_id: ctx.household.id });
  throwIfDbError(error);
  return (data ?? []) as Invitation[];
}

export async function cancelInvitation(ctx: ExecutionContext, email: string) {
  const { error } = await ctx.supabase.rpc("cancel_invitation", { p_household_id: ctx.household.id, p_email: email });
  throwIfDbError(error);
}

/**
 * Lazy 30-day cleanup of private data left by former members (throttled to once a day in the
 * database). The rows go first; the orphaned wardrobe photos are then removed from storage.
 */
export async function purgeDepartedData(ctx: ExecutionContext) {
  const { data, error } = await ctx.supabase.rpc("purge_departed_data", { p_household_id: ctx.household.id });
  if (error) {
    console.error("[baptista] purge failed", error.code ?? "no-code");
    return;
  }
  const paths = [...new Set((data ?? []) as string[])];
  if (!paths.length) return;
  const { error: storageError } = await ctx.supabase.storage.from(BAPTISTA_BUCKETS.wardrobe).remove(paths);
  if (storageError) console.error("[baptista] purge storage cleanup failed");
}

export async function respondToInvite(ctx: UserContext, householdId: string, accept: boolean) {
  const { error } = await ctx.supabase.rpc("respond_to_invite", { p_household_id: householdId, p_accept: accept });
  throwIfDbError(error);
}

export async function removeMember(ctx: ExecutionContext, userId: string) {
  const { error } = await ctx.supabase.rpc("remove_member", { p_household_id: ctx.household.id, p_user_id: userId });
  throwIfDbError(error);
}

export async function transferOwnership(ctx: ExecutionContext, userId: string) {
  const { error } = await ctx.supabase.rpc("transfer_ownership", { p_household_id: ctx.household.id, p_new_owner: userId });
  throwIfDbError(error);
}

export async function getDirectory(ctx: ExecutionContext): Promise<DirectoryEntry[]> {
  const { data, error } = await ctx.supabase.rpc("household_directory", { p_household_id: ctx.household.id });
  throwIfDbError(error);
  return (data ?? []) as DirectoryEntry[];
}

export async function updateProfile(ctx: UserContext, displayName: string) {
  const { error } = await ctx.supabase.from("profiles").update({ display_name: displayName }).eq("user_id", ctx.user.id);
  throwIfDbError(error);
}
