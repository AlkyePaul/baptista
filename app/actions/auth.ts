"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/lib/errors";
import { createClient } from "@/lib/supabase/server";
import { parseForm } from "@/services/shared";

const credentials = z.object({
  email: z.email("Inserisci un indirizzo email valido.").trim(),
  password: z.string({ error: "Inserisci la password." }).min(1, "Inserisci la password."),
});

export async function signIn(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(credentials, formData);
  if (!parsed.ok) return parsed.state;
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  // Neutral message: never reveal whether the address exists.
  if (error) return { ok: false, message: "Email o password non corretti." };

  // Auth is shared with GuideApp: only accounts listed in baptista.app_users may enter (D33).
  // Applying the row here also covers accounts created after the row was added.
  const { data: householdId, error: claimError } = await supabase.rpc("claim_app_user");
  if (claimError || !householdId) {
    await supabase.auth.signOut();
    return { ok: false, message: "Questo account non è abilitato a Baptista." };
  }
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/accedi");
}
