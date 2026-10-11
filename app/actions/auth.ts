"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/lib/errors";
import { defaultDisplayName, HOUSEHOLD_COOKIE } from "@/lib/households/context";
import { createClient } from "@/lib/supabase/server";
import { claimInvitation, inviteCodeSchema } from "@/services/households";
import { parseForm } from "@/services/shared";

const credentials = z.object({
  email: z.email("Inserisci un indirizzo email valido.").trim(),
  password: z.string({ error: "Inserisci la password." }).min(1, "Inserisci la password."),
});

// Baptista is invite-only: the code is checked for shape before creating the shared Auth account,
// then redeemed (bound to the email) as soon as there is a session.
const signUpSchema = z
  .object({
    email: z.email("Inserisci un indirizzo email valido.").trim(),
    password: z.string({ error: "Scegli una password." }).min(8, "Almeno 8 caratteri."),
  })
  .extend(inviteCodeSchema.shape);

async function origin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function signIn(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(credentials, formData);
  if (!parsed.ok) return parsed.state;
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  // Neutral message: never reveal whether the address exists.
  if (error) return { ok: false, message: "Email o password non corretti." };
  redirect("/");
}

export async function signUp(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(signUpSchema, formData);
  if (!parsed.ok) return parsed.state;
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { emailRedirectTo: `${await origin()}/auth/conferma` },
  });
  if (error) {
    return { ok: false, message: "Non è stato possibile completare la registrazione. Riprova più tardi." };
  }
  if (data.session) {
    let householdId: string | null = null;
    try {
      householdId = await claimInvitation({ supabase }, parsed.data.code, defaultDisplayName(parsed.data.email));
    } catch {
      // Falls through to /invito, where the code can be entered again.
    }
    // No household cookie needed: a new account has exactly one household.
    redirect(householdId ? "/" : "/invito");
  }
  return {
    ok: true,
    message: "Se l'indirizzo è valido riceverai un'email per confermare l'account; poi accedi e inserisci il codice invito. Se hai già un account con questa email, accedi direttamente con la tua password.",
  };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // Clear the household hint so nothing of the previous session survives.
  (await cookies()).delete(HOUSEHOLD_COOKIE);
  redirect("/accedi");
}
