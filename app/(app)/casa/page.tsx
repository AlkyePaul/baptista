import type { Metadata } from "next";
import { signOut } from "@/app/actions/auth";
import {
  cancelInvitationAction,
  claimInvitationAction,
  inviteMemberAction,
  removeMemberAction,
  respondToInviteAction,
  selectHouseholdAction,
  transferOwnershipAction,
  updateHouseholdAction,
  updateProfileAction,
} from "@/app/actions/households";
import { ActionButton, ActionForm, Field, SubmitButton } from "@/components/forms";
import { Avatar, Badge, buttonClass, Card, PageHeader, Section, TextLink } from "@/components/ui";
import { requireExecutionContext } from "@/lib/households/context";
import { getDirectory, listInvitations } from "@/services/households";

const dateFormat = new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long" });

export const metadata: Metadata = { title: "Casa" };

export default async function HouseholdPage() {
  const ctx = await requireExecutionContext();
  const isOwner = ctx.role === "owner";
  const [directory, emailInvites] = await Promise.all([getDirectory(ctx), listInvitations(ctx)]);
  const active = directory.filter((m) => m.state === "active");
  const invited = directory.filter((m) => m.state === "pending");
  const alone = active.length === 1;

  return (
    <>
      <PageHeader title={ctx.household.name} subtitle={isOwner ? "Sei proprietario di questa casa" : "Sei membro di questa casa"} />

      {ctx.memberships.length > 1 ? (
        <Section title="Le tue case">
          <Card>
            <ul className="divide-y divide-border">
              {ctx.memberships.map((m) => {
                const current = m.household_id === ctx.household.id;
                return (
                  <li key={m.household_id}>
                    <form action={selectHouseholdAction.bind(null, m.household_id)}>
                      <button
                        type="submit"
                        disabled={current}
                        aria-current={current ? "true" : undefined}
                        className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-3 text-left aria-[current]:font-semibold"
                      >
                        {m.household.name}
                        {current ? <Badge tone="accent">Attuale</Badge> : <span className="text-sm text-accent">Passa a questa</span>}
                      </button>
                    </form>
                  </li>
                );
              })}
            </ul>
          </Card>
        </Section>
      ) : null}

      <Section title="Membri">
        <Card>
          <ul className="divide-y divide-border">
            {active.map((m) => {
              const me = m.user_id === ctx.user.id;
              return (
                <li key={m.user_id} className="flex items-center gap-3 px-4 py-3">
                  <Avatar name={m.display_name} />
                  <span className="flex flex-1 flex-col">
                    <span className="font-medium">
                      {m.display_name}
                      {me ? " (tu)" : ""}
                    </span>
                    <span className="text-sm text-muted">{m.role === "owner" ? "Proprietario" : "Membro"}</span>
                  </span>
                  {isOwner && !me ? (
                    <div className="flex flex-col items-end">
                      {m.role === "member" ? (
                        <ActionButton
                          action={transferOwnershipAction.bind(null, m.user_id)}
                          confirmLabel="Confermi?"
                          label={`Rendi ${m.display_name} proprietario`}
                        >
                          Rendi proprietario
                        </ActionButton>
                      ) : null}
                      <ActionButton
                        action={removeMemberAction.bind(null, m.user_id)}
                        variant="danger"
                        confirmLabel="Confermi rimozione?"
                        label={`Rimuovi ${m.display_name}`}
                      >
                        Rimuovi
                      </ActionButton>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Card>
        {isOwner && active.length > 1 ? (
          <p className="px-1 text-sm text-muted">
            Chi viene rimosso o esce perde subito l&apos;accesso. I suoi elementi privati vengono eliminati dopo 30 giorni,
            a meno che non rientri prima; quelli condivisi restano alla casa.
          </p>
        ) : null}
        {invited.length || emailInvites.length ? (
          <Card>
            <ul className="divide-y divide-border">
              {invited.map((m) => (
                <li key={m.user_id} className="flex items-center gap-3 px-4 py-3">
                  <Avatar name={m.display_name} size="sm" />
                  <span className="flex-1">{m.display_name}</span>
                  <Badge>Invito in attesa</Badge>
                  {isOwner ? (
                    <ActionButton action={removeMemberAction.bind(null, m.user_id)} variant="danger" label={`Annulla invito a ${m.display_name}`}>
                      Annulla
                    </ActionButton>
                  ) : null}
                </li>
              ))}
              {emailInvites.map((invite) => (
                <li key={invite.email} className="flex items-center gap-3 px-4 py-3">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">{invite.email}</span>
                    <span className="text-sm text-muted">
                      {invite.locked
                        ? "Bloccato dopo troppi tentativi: invita di nuovo per un nuovo codice"
                        : new Date(invite.expires_at) < new Date()
                          ? "Scaduto: invita di nuovo per un nuovo codice"
                          : `Codice valido fino al ${dateFormat.format(new Date(invite.expires_at))}`}
                    </span>
                  </span>
                  <ActionButton
                    action={cancelInvitationAction.bind(null, invite.email)}
                    variant="danger"
                    label={`Annulla invito a ${invite.email}`}
                  >
                    Annulla
                  </ActionButton>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
        {isOwner ? (
          <Card id="invita" className="scroll-mt-24 p-4">
            <ActionForm action={inviteMemberAction} successMessage>
              <Field
                label="Invita un familiare"
                name="email"
                type="email"
                inputMode="email"
                hint="Se la persona non usa ancora Baptista riceverai un codice da mandarle: le servirà per entrare. Invitando di nuovo la stessa email ottieni un codice nuovo."
              />
              <SubmitButton variant="secondary">Invita</SubmitButton>
            </ActionForm>
          </Card>
        ) : null}
      </Section>

      {ctx.pendingInvites.length ? (
        <Section title="Inviti per te">
          <ul className="flex flex-col gap-2">
            {ctx.pendingInvites.map((invite) => (
              <li key={invite.household_id}>
                <Card className="flex items-center justify-between gap-3 p-4">
                  <span className="font-medium">{invite.household.name}</span>
                  <div className="flex gap-1">
                    <ActionButton action={respondToInviteAction.bind(null, invite.household_id, false)}>Rifiuta</ActionButton>
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

      <Section title="Hai un codice invito?">
        <Card className="p-4">
          <ActionForm action={claimInvitationAction}>
            <Field label="Codice invito" name="code" autoComplete="one-time-code" placeholder="ABCD-EFGH" required />
            <SubmitButton variant="secondary" pendingLabel="Verifica…">
              Entra nella casa
            </SubmitButton>
          </ActionForm>
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
        <TextLink href="/benvenuto?nuova=1">Crea un&apos;altra casa</TextLink>
      </Section>

      {alone ? (
        <p className="text-sm text-muted">
          Sei l&apos;unico membro: se esci, la casa e tutti i suoi dati vengono eliminati definitivamente.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ActionButton
          action={removeMemberAction.bind(null, ctx.user.id)}
          variant="danger"
          confirmLabel={alone ? "Eliminare casa e dati?" : "Confermi di voler uscire?"}
        >
          {alone ? "Esci ed elimina la casa" : "Esci da questa casa"}
        </ActionButton>
        <form action={signOut}>
          <button type="submit" className={buttonClass.secondary}>
            Esci dall&apos;account
          </button>
        </form>
      </div>
    </>
  );
}
