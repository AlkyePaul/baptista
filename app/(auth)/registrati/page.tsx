import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { signUp } from "@/app/actions/auth";
import { ActionForm, Field, SubmitButton } from "@/components/forms";
import { TextLink } from "@/components/ui";
import { getSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Registrati" };

export default async function SignUpPage() {
  if (await getSessionUser()) redirect("/");
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Crea un account</h1>
        <p className="text-muted">Baptista è solo su invito: usa l&apos;email a cui è arrivato l&apos;invito e il codice ricevuto.</p>
      </div>
      <ActionForm action={signUp} successMessage>
        <Field label="Email" name="email" type="email" autoComplete="email" inputMode="email" required />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          hint="Almeno 8 caratteri."
          required
        />
        <Field label="Codice invito" name="code" autoComplete="one-time-code" placeholder="ABCD-EFGH" required />
        <SubmitButton pendingLabel="Registrazione…">Registrati</SubmitButton>
      </ActionForm>
      <p className="text-sm text-muted">
        Hai già un account? <TextLink href="/accedi">Accedi</TextLink>
      </p>
    </div>
  );
}
