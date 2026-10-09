import type { Metadata } from "next";
import Link from "next/link";
import { createEventAction, createNoteAction, createTaskAction, toggleTaskAction } from "@/app/actions/domains";
import { ActionButton, ActionForm, EventTimeFields, Field, SubmitButton, VisibilityField } from "@/components/forms";
import { Badge, Card, cx, EmptyState, PrivateMark, Section, TextLink } from "@/components/ui";
import type { CalendarEvent } from "@/lib/db/types";
import { addDays, formatTime, isCivilDate, localDate, relativeDay, toLocalInput } from "@/lib/dates";
import { requireExecutionContext, type ExecutionContext } from "@/lib/households/context";
import { eventStartDay, listEventsBetween } from "@/services/calendar";
import { listNotes } from "@/services/notes";
import { PAGE_SIZE } from "@/services/shared";
import { listOpenTasks, listRecentlyCompleted } from "@/services/tasks";

export const metadata: Metadata = { title: "Aggiungi" };

/** One module, four variants (D21). */
const KINDS = [
  { id: "attivita", label: "Da fare", color: "#d9a33a" },
  { id: "evento", label: "Evento", color: "var(--accent)" },
  { id: "nota", label: "Nota", color: "#7a6fd0" },
  { id: "lista", label: "Lista", color: "#3f9d8c" },
] as const;
type Kind = (typeof KINDS)[number]["id"];

function isKind(value: unknown): value is Kind {
  return KINDS.some((k) => k.id === value);
}

export default async function AddPage({ searchParams }: PageProps<"/aggiungi">) {
  const ctx = await requireExecutionContext();
  const params = await searchParams;
  const kind: Kind = isKind(params.tipo) ? params.tipo : "attivita";
  const day = typeof params.data === "string" && isCivilDate(params.data) ? params.data : null;
  const more = params.altri === "1";
  const current = KINDS.find((k) => k.id === kind)!;

  return (
    <>
      <header className="flex flex-col gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">Aggiungi</h1>
        <nav aria-label="Tipo di elemento" className="grid grid-cols-4 gap-1 rounded-2xl border border-border bg-surface p-1">
          {KINDS.map((k) => {
            const active = k.id === kind;
            return (
              <Link
                key={k.id}
                href={`/aggiungi?tipo=${k.id}${day ? `&data=${day}` : ""}`}
                aria-current={active ? "page" : undefined}
                scroll={false}
                className={cx(
                  "flex min-h-11 items-center justify-center gap-1.5 rounded-xl text-sm font-medium transition-colors",
                  active ? "bg-foreground/[0.07] text-foreground" : "text-muted hover:text-foreground",
                )}
              >
                <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: k.color }} />
                {k.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <Card className="p-4" style={{ borderTop: `3px solid ${current.color}` }}>
        <CreateForm kind={kind} ctx={ctx} day={day} now={new Date()} />
      </Card>

      <ExistingItems kind={kind} ctx={ctx} more={more} />
    </>
  );
}

function CreateForm({ kind, ctx, day, now }: { kind: Kind; ctx: ExecutionContext; day: string | null; now: Date }) {
  const tz = ctx.household.timezone;
  switch (kind) {
    case "attivita":
      return (
        <ActionForm action={createTaskAction} successMessage key="attivita">
          <Field label="Cosa c'è da fare" name="title" placeholder="Es. Pagare la bolletta" required />
          <Field label="Scadenza" name="due_date" type="date" defaultValue={day} hint="Facoltativa. Comparirà nel calendario." />
          <VisibilityField />
          <SubmitButton>Aggiungi</SubmitButton>
        </ActionForm>
      );
    case "evento": {
      const nextHour = new Date(Math.ceil(now.getTime() / 3_600_000) * 3_600_000);
      const defaults = day
        ? { starts_at: `${day}T09:00`, ends_at: `${day}T10:00`, start_date: day }
        : {
            starts_at: toLocalInput(nextHour, tz),
            ends_at: toLocalInput(new Date(nextHour.getTime() + 3_600_000), tz),
            start_date: localDate(now, tz),
          };
      return (
        <ActionForm action={createEventAction} successMessage key="evento">
          <Field label="Titolo" name="title" placeholder="Es. Dentista" required />
          <EventTimeFields defaults={defaults} />
          <Field label="Note" name="description" multiline />
          <VisibilityField />
          <SubmitButton>Aggiungi evento</SubmitButton>
        </ActionForm>
      );
    }
    case "nota":
      return (
        <ActionForm action={createNoteAction} successMessage key="nota">
          <input type="hidden" name="kind" value="note" />
          <Field label="Titolo" name="title" placeholder="Es. Password del Wi-Fi" required />
          <Field label="Testo" name="body" multiline />
          <VisibilityField />
          <SubmitButton>Salva nota</SubmitButton>
        </ActionForm>
      );
    case "lista":
      return (
        <ActionForm action={createNoteAction} key="lista">
          <input type="hidden" name="kind" value="list" />
          <Field label="Nome della lista" name="title" placeholder="Es. Spesa" required />
          <Field label="Elementi" name="items_text" multiline hint="Uno per riga. Potrai aggiungerne altri dopo." />
          <VisibilityField />
          <SubmitButton>Crea lista</SubmitButton>
        </ActionForm>
      );
  }
}

async function ExistingItems({ kind, ctx, more }: { kind: Kind; ctx: ExecutionContext; more: boolean }) {
  const tz = ctx.household.timezone;
  const today = localDate(new Date(), tz);
  const limit = more ? PAGE_SIZE * 4 : PAGE_SIZE;

  if (kind === "attivita") {
    const [open, completed] = await Promise.all([listOpenTasks(ctx, limit), listRecentlyCompleted(ctx)]);
    return (
      <Section title="Da fare">
        {open.length ? (
          <Card>
            <ul className="divide-y divide-border">
              {open.map((task) => {
                const overdue = task.due_date !== null && task.due_date < today;
                return (
                  <li key={task.id} className="flex items-center gap-2 px-2 py-1">
                    <ActionButton
                      action={toggleTaskAction.bind(null, task.id, task.version, true)}
                      label={`Segna come fatta: ${task.title}`}
                      className="size-11 px-0"
                    >
                      <span aria-hidden className="inline-block size-5 rounded-md border-2 border-[#d9a33a]" />
                    </ActionButton>
                    <Link href={`/aggiungi/attivita/${task.id}`} className="flex min-h-12 flex-1 flex-col justify-center">
                      <span>{task.title}</span>
                      {task.due_date ? (
                        <span className={overdue ? "text-sm text-danger" : "text-sm text-muted"}>
                          {overdue ? "Scaduta " : "Scade "}
                          {relativeDay(task.due_date, today)}
                        </span>
                      ) : null}
                    </Link>
                    <PrivateMark visibility={task.visibility} />
                  </li>
                );
              })}
            </ul>
          </Card>
        ) : (
          <EmptyState>Tutto fatto. Niente in sospeso!</EmptyState>
        )}
        {open.length === limit && !more ? <TextLink href="/aggiungi?tipo=attivita&altri=1">Mostra altre</TextLink> : null}
        {completed.length ? (
          <details className="rounded-2xl border border-border bg-surface">
            <summary className="flex min-h-12 cursor-pointer items-center px-4 text-sm font-medium text-muted">
              Completate di recente ({completed.length})
            </summary>
            <ul className="divide-y divide-border border-t border-border">
              {completed.map((task) => (
                <li key={task.id} className="flex items-center gap-2 px-2 py-1">
                  <ActionButton
                    action={toggleTaskAction.bind(null, task.id, task.version, false)}
                    label={`Riapri: ${task.title}`}
                    className="size-11 px-0"
                  >
                    <span aria-hidden className="inline-flex size-5 items-center justify-center rounded-md bg-[#d9a33a] text-xs text-white">
                      ✓
                    </span>
                  </ActionButton>
                  <span className="flex-1 text-muted line-through">{task.title}</span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </Section>
    );
  }

  if (kind === "evento") {
    const events = await listEventsBetween(ctx, today, addDays(today, 30));
    const byDay = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const d = eventStartDay(event, tz) < today ? today : eventStartDay(event, tz);
      byDay.set(d, [...(byDay.get(d) ?? []), event]);
    }
    return (
      <Section title="Prossimi 30 giorni" action={<TextLink href="/calendario">Calendario</TextLink>}>
        {byDay.size ? (
          <Card>
            <ul className="divide-y divide-border">
              {[...byDay.entries()].flatMap(([d, list]) =>
                list.map((event, i) => (
                  <li key={`${d}-${event.id}`}>
                    <Link href={`/calendario/${event.id}`} className="flex min-h-14 items-center gap-3 px-4 py-3">
                      <span className="w-16 shrink-0 text-sm font-medium first-letter:uppercase">
                        {i === 0 ? relativeDay(d, today) : ""}
                      </span>
                      <span className="flex flex-1 flex-col">
                        <span>{event.title}</span>
                        <span className="text-sm text-muted">
                          {event.all_day ? "Tutto il giorno" : formatTime(new Date(event.starts_at!), tz)}
                        </span>
                      </span>
                      <PrivateMark visibility={event.visibility} />
                    </Link>
                  </li>
                )),
              )}
            </ul>
          </Card>
        ) : (
          <EmptyState>Nessun evento nei prossimi 30 giorni.</EmptyState>
        )}
      </Section>
    );
  }

  const notes = await listNotes(ctx, limit, kind === "lista" ? "list" : "note");
  return (
    <Section title={kind === "lista" ? "Le tue liste" : "Le tue note"}>
      {notes.length ? (
        <ul className="grid grid-cols-2 gap-2">
          {notes.map((note) => {
            const done = note.items.filter((i) => i.done).length;
            return (
              <li key={note.id}>
                <Link
                  href={`/aggiungi/note/${note.id}`}
                  className="flex h-full min-h-24 flex-col gap-2 rounded-2xl border border-border bg-surface p-4"
                >
                  <span className="font-medium">{note.title}</span>
                  {note.kind === "note" && note.body ? (
                    <span className="line-clamp-2 text-sm text-muted">{note.body}</span>
                  ) : null}
                  <span className="mt-auto flex items-center gap-2 text-sm text-muted">
                    {note.kind === "list" ? `${done}/${note.items.length}` : null}
                    <PrivateMark visibility={note.visibility} />
                    {note.kind === "list" && note.items.length > 0 && done === note.items.length ? (
                      <Badge tone="accent">Completa</Badge>
                    ) : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState>{kind === "lista" ? "Nessuna lista. Prova con la lista della spesa." : "Nessuna nota."}</EmptyState>
      )}
    </Section>
  );
}
