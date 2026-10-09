import "server-only";

import { z } from "zod";
import { throwIfDbError } from "@/lib/errors";
import type { ExecutionContext, UserContext } from "@/lib/households/context";
import type { DirectoryEntry } from "@/lib/db/types";
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

export async function inviteMember(ctx: ExecutionContext, email: string) {
  const { error } = await ctx.supabase.rpc("invite_member", { p_household_id: ctx.household.id, p_email: email });
  throwIfDbError(error);
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
