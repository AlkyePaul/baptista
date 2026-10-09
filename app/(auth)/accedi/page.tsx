import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { signIn } from "@/app/actions/auth";
import { ActionForm, Field, SubmitButton } from "@/components/forms";
import { TextLink } from "@/components/ui";
import { getSessionUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Accedi" };

export default async function SignInPage({ searchParams }: PageProps<"/accedi">) {
  if (await getSessionUser()) redirect("/");
  const { errore } = await searchParams;
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-semibold tracking-tight">Accedi</h1>
      {errore ? (
        <p role="alert" className="text-sm text-danger">
          Il link non è valido o è scaduto. Accedi di nuovo.
        </p>
      ) : null}
      <ActionForm action={signIn} resetOnSuccess={false}>
        <Field label="Email" name="email" type="email" autoComplete="email" inputMode="email" required />
        <Field label="Password" name="password" type="password" autoComplete="current-password" required />
        <SubmitButton pendingLabel="Accesso…">Accedi</SubmitButton>
      </ActionForm>
      <p className="text-sm text-muted">
        Non hai un account? <TextLink href="/registrati">Registrati</TextLink>
      </p>
    </div>
  );
}
