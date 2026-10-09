import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { signOut } from "@/app/actions/auth";
import { createHouseholdAction, respondToInviteAction } from "@/app/actions/households";
import { ActionButton, ActionForm, Field, SubmitButton } from "@/components/forms";
import { buttonClass, Card, Section } from "@/components/ui";
import { getUserContext } from "@/lib/households/context";

export const metadata: Metadata = { title: "Benvenuto" };

export default async function WelcomePage({ searchParams }: PageProps<"/benvenuto">) {
  const ctx = await getUserContext();
  const { nuova } = await searchParams;
  if (ctx.memberships.length && nuova !== "1") redirect("/");

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-8 px-5 pt-[max(env(safe-area-inset-top),2rem)] pb-[max(env(safe-area-inset-bottom),2rem)]">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium tracking-wide text-muted uppercase">Baptista</p>
        <h1 className="text-3xl font-semibold tracking-tight">Ciao {ctx.displayName}!</h1>
        <p className="text-muted">
          Per iniziare crea la tua casa, oppure accetta l&apos;invito di qualcuno della tua famiglia.
        </p>
      </header>

      {ctx.pendingInvites.length ? (
        <Section title="Inviti ricevuti">
          <ul className="flex flex-col gap-2">
            {ctx.pendingInvites.map((invite) => (
              <li key={invite.household_id}>
                <Card className="flex items-center justify-between gap-3 p-4">
                  <span className="font-medium">{invite.household.name}</span>
                  <div className="flex gap-1">
                    <ActionButton action={respondToInviteAction.bind(null, invite.household_id, false)} variant="ghost">
                      Rifiuta
                    </ActionButton>
                    <ActionButton action={respondToInviteAction.bind(null, invite.household_id, true)} variant="primary">
                      Accetta
                    </ActionButton>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="Crea una casa">
        <Card className="p-4">
          <ActionForm action={createHouseholdAction} resetOnSuccess={false}>
            <Field label="Nome della casa" name="name" placeholder="Casa Rossi" required />
            <Field
              label="Fuso orario"
              name="timezone"
              defaultValue="Europe/Rome"
              hint="Serve per calcolare correttamente giorni, settimane e scadenze."
            />
            <SubmitButton pendingLabel="Creazione…">Crea la casa</SubmitButton>
          </ActionForm>
        </Card>
      </Section>

      <form action={signOut}>
        <button type="submit" className={buttonClass.ghost}>
          Esci
        </button>
      </form>
    </main>
  );
}
