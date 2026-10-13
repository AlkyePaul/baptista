"use server";

import { run } from "@/lib/actions";
import type { ActionState } from "@/lib/errors";
import { getUserContext, requireExecutionContext } from "@/lib/households/context";
import * as households from "@/services/households";
import { parseForm } from "@/services/shared";

// Who belongs to the household is managed in baptista.app_users (D33), not from the app.

export async function updateHouseholdAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(households.updateHouseholdSchema, formData);
  if (!parsed.ok) return parsed.state;
  const ctx = await requireExecutionContext();
  return run(() => households.updateHousehold(ctx, parsed.data), "Casa aggiornata.");
}

export async function updateProfileAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(households.profileSchema, formData);
  if (!parsed.ok) return parsed.state;
  const ctx = await getUserContext();
  return run(() => households.updateProfile(ctx, parsed.data.display_name), "Profilo aggiornato.");
}
