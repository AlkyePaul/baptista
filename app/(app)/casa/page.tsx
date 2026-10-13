import type { Metadata } from "next";
import { signOut } from "@/app/actions/auth";
import { updateHouseholdAction, updateProfileAction } from "@/app/actions/households";
import { ActionForm, Field, SubmitButton } from "@/components/forms";
import { Avatar, buttonClass, Card, PageHeader, Section } from "@/components/ui";
import { requireExecutionContext } from "@/lib/households/context";
import { getDirectory } from "@/services/households";

export const metadata: Metadata = { title: "Casa" };

export default async function HouseholdPage() {
  const ctx = await requireExecutionContext();
  const isOwner = ctx.role === "owner";
  const active = (await getDirectory(ctx)).filter((m) => m.state === "active");

  return (
    <>
      <PageHeader title={ctx.household.name} subtitle={isOwner ? "Sei proprietario di questa casa" : "Sei membro di questa casa"} />

      <Section title="Membri">
        <Card>
          <ul className="divide-y divide-border">
            {active.map((m) => (
              <li key={m.user_id} className="flex items-center gap-3 px-4 py-3">
                <Avatar name={m.display_name} />
                <span className="flex flex-1 flex-col">
                  <span className="font-medium">
                    {m.display_name}
                    {m.user_id === ctx.user.id ? " (tu)" : ""}
                  </span>
                  <span className="text-sm text-muted">{m.role === "owner" ? "Proprietario" : "Membro"}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </Section>

      {isOwner ? (
        <Section title="Impostazioni della casa">
          <Card className="p-4">
            <ActionForm action={updateHouseholdAction} resetOnSuccess={false} successMessage>
              <input type="hidden" name="version" value={ctx.household.version} />
              <Field label="Nome" name="name" defaultValue={ctx.household.name} required />
              <Field label="Fuso orario" name="timezone" defaultValue={ctx.household.timezone} />
              <SubmitButton>Salva</SubmitButton>
            </ActionForm>
          </Card>
        </Section>
      ) : null}

      <Section title="Il tuo profilo">
        <Card className="p-4">
          <ActionForm action={updateProfileAction} resetOnSuccess={false} successMessage>
            <Field label="Nome visualizzato" name="display_name" defaultValue={ctx.displayName} required />
            <SubmitButton>Salva</SubmitButton>
          </ActionForm>
        </Card>
      </Section>

      <form action={signOut}>
        <button type="submit" className={buttonClass.secondary}>
          Esci dall&apos;account
        </button>
      </form>
    </>
  );
}
