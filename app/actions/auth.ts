"use server";

import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { z } from "zod";
import type { ActionState } from "@/lib/errors";
import { signIn as nextAuthSignIn, signOut as nextAuthSignOut } from "@/auth";
import { parseForm } from "@/services/shared";

const credentials = z.object({
  email: z.email("Inserisci un indirizzo email valido.").trim(),
});

export async function signIn(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(credentials, formData);
  if (!parsed.ok) return parsed.state;

  try {
    await nextAuthSignIn("credentials", {
      email: parsed.data.email,
      redirect: false,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { ok: false, message: "Email non riconosciuta." };
    }
    throw error;
  }

  redirect("/");
}

export async function signOut() {
  await nextAuthSignOut({ redirectTo: "/accedi" });
}
