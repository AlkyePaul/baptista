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

export const profileSchema = z.object({
  display_name: requiredText(60, "Inserisci il nome da mostrare."),
});

export async function updateHousehold(ctx: ExecutionContext, input: z.infer<typeof updateHouseholdSchema>) {
  const { error } = await ctx.supabase.rpc("update_household", {
    p_household_id: ctx.household.id,
    p_name: input.name,
    p_timezone: input.timezone,
    p_expected_version: input.version,
  });
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

export async function getDirectory(ctx: ExecutionContext): Promise<DirectoryEntry[]> {
  const { data, error } = await ctx.supabase.rpc("household_directory", { p_household_id: ctx.household.id });
  throwIfDbError(error);
  return (data ?? []) as DirectoryEntry[];
}

export async function updateProfile(ctx: UserContext, displayName: string) {
  const { error } = await ctx.supabase.from("profiles").update({ display_name: displayName }).eq("user_id", ctx.user.id);
  throwIfDbError(error);
}
