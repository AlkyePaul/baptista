import Link from "next/link";
import { toggleHabitDayAction } from "@/app/actions/domains";
import { BaptistaThread } from "@/components/baptista/thread";
import { ActionButton } from "@/components/forms";
import { ChecklistRows } from "@/components/checklist";
import { ListAccordion } from "@/components/list-accordion";
import { ProgressRing } from "@/components/progress-ring";
import { recordColor } from "@/lib/categories";
import { Card, EmptyState, PrivateMark, Section, TextLink } from "@/components/ui";
import {
  addDays,
  formatLongDay,
  formatTime,
  greeting,
  localDate,
  localHour,
} from "@/lib/dates";
import {
  requireExecutionContext,
  type ExecutionContext,
} from "@/lib/households/context";
import { getCurrentRoom } from "@/lib/rooms-server";
import { eventStartDay, listEventsBetween } from "@/services/calendar";
import { listNotes } from "@/services/notes";
import { goalPercent } from "@/lib/goals";
import { listGoals } from "@/services/goals";
import { getHabitWeeks, listHabits } from "@/services/habits";
import { loadThread } from "@/services/baptista";
import { listTasksDueBetween } from "@/services/tasks";
import {
  FinanceRoom,
  KitchenRoom,
  WardrobeRoom,
} from "@/components/room-dashboards";

export default async function HomePage() {
  const ctx = await requireExecutionContext();
  const room = await getCurrentRoom();
  const tz = ctx.household.timezone;
  const now = new Date();

  return (
    <>
      <header className="flex flex-col gap-1">
        <p className="text-sm text-muted first-letter:uppercase">
          {formatLongDay(localDate(now, tz))}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          {greeting(localHour(now, tz))}, {ctx.displayName}
        </h1>
      </header>

      {room === "soggiorno" ? (
        <LivingRoom ctx={ctx} now={now} />
      ) : room === "cucina" ? (
        <KitchenRoom ctx={ctx} now={now} />
      ) : room === "finanze" ? (
        <FinanceRoom ctx={ctx} now={now} />
      ) : (
        <WardrobeRoom ctx={ctx} now={now} />
      )}
    </>
  );
}

async function LivingRoom({ ctx, now }: { ctx: ExecutionContext; now: Date }) {
  const tz = ctx.household.timezone;
  const today = localDate(now, tz);

  const tomorrow = addDays(today, 1);

  const [events, due, habits, goals, lists, notes] = await Promise.all([
    listEventsBetween(ctx, today, addDays(today, 2)),
    listTasksDueBetween(ctx, today, tomorrow),
    listHabits(ctx, { activeOnly: true }),
    listGoals(ctx),
    listNotes(ctx, 6, "list"),
    listNotes(ctx, 6, "note"),
  ]);
  // The calendar summary covers today and tomorrow; an event already running counts for today.
  const days = [today, tomorrow].map((day) => ({
    day,
    events: events.filter(
      (e) => (eventStartDay(e, tz) < today ? today : eventStartDay(e, tz)) === day,
    ),
    tasks: due.filter((t) => t.status === "open" && t.due_date === day),
  }));
  const eventsLeft = days[0].events.filter(
    (e) => e.all_day || (e.starts_at !== null && new Date(e.starts_at) > now),
  ).length;
  // Phase 04.1: Baptista takes the place of «In evidenza» (same observations, same ranking).
  const [thread, weeks] = await Promise.all([
    loadThread(ctx, {
      room: "all",
      daily: true,
      eventsLeftToday: eventsLeft,
      now,
    }),
    getHabitWeeks(ctx, habits, today),
  ]);
  // Ring colours of the thumbnails follow the same category colours as the cards.
  const colors = Object.fromEntries(
    [...habits, ...goals].map((r) => [r.id, recordColor(r)]),
  );
  for (const view of [thread.active, ...thread.queue]) {
    if (view?.thumb?.kind === "visual" && colors[view.thumb.sourceId])
      view.thumb.color = colors[view.thumb.sourceId];
  }

  return (
    <>
      {thread.quiet ? <p className="-mt-2 text-muted">{thread.quiet}</p> : null}
      <BaptistaThread thread={thread} timeZone={tz} />

      <Section
        title="Oggi e domani"
        action={
          <TextLink href={`/calendario?giorno=${today}`}>Calendario</TextLink>
        }
      >
        {days.some((d) => d.events.length || d.tasks.length) ? (
          <Card>
            {days.map(({ day, events: dayEvents, tasks }) => (
              <div key={day} className="border-b border-border last:border-b-0">
                <Link
                  href={`/calendario?giorno=${day}`}
                  className="block px-4 pt-3 text-xs font-semibold tracking-wider text-muted uppercase"
                >
                  {day === today ? "Oggi" : "Domani"}
                </Link>
                {dayEvents.length || tasks.length ? (
                  <ul className="divide-y divide-border">
                    {dayEvents.map((event) => (
                      <li key={event.id}>
                        <Link
                          href={`/calendario/${event.id}`}
                          className="flex min-h-14 items-center gap-4 px-4 py-3"
                        >
                          <span className="w-14 shrink-0 font-mono text-sm text-muted">
                            {event.all_day ||
                            eventStartDay(event, tz) !== day
                              ? "Giorno"
                              : formatTime(new Date(event.starts_at!), tz)}
                          </span>
                          <span className="flex-1">{event.title}</span>
                        </Link>
                      </li>
                    ))}
                    {tasks.map((task) => (
                      <li key={task.id}>
                        <Link
                          href={`/aggiungi/attivita/${task.id}`}
                          className="flex min-h-14 items-center gap-4 px-4 py-3"
                        >
                          <span className="w-14 shrink-0 text-sm text-muted">
                            Da fare
                          </span>
                          <span className="flex-1">{task.title}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-4 pt-1 pb-3 text-sm text-muted">
                    Niente in programma.
                  </p>
                )}
              </div>
            ))}
          </Card>
        ) : (
          <EmptyState>Niente in programma per oggi e domani.</EmptyState>
        )}
      </Section>

      <Section
        title="Abitudini settimanali"
        action={<TextLink href="/abitudini">Tutte</TextLink>}
      >
        {weeks.length ? (
          <ul className="grid grid-cols-3 gap-2">
            {weeks.map((w) => {
              const doneToday = w.days.has(today);
              const color = recordColor(w.habit);
              return (
                <li key={w.habit.id}>
                  <Card className="flex h-full flex-col items-center gap-2 px-2 py-3 text-center">
                    <ProgressRing
                      percent={w.percent}
                      color={color}
                      label={`${w.habit.title}: ${w.count} su ${w.habit.target_per_week} questa settimana`}
                    >
                      <span className="text-base font-semibold">
                        {w.count}/{w.habit.target_per_week}
                      </span>
                    </ProgressRing>
                    <span className="line-clamp-2 text-sm font-medium">
                      {w.habit.title}
                    </span>
                    <ActionButton
                      action={toggleHabitDayAction.bind(
                        null,
                        w.habit.id,
                        today,
                      )}
                      variant={doneToday ? "secondary" : "ghost"}
                      label={
                        doneToday
                          ? `Annulla ${w.habit.title} di oggi`
                          : `Registra ${w.habit.title} oggi`
                      }
                      className="min-h-9 px-2 text-xs"
                    >
                      {doneToday ? "✓ Oggi" : "+ Oggi"}
                    </ActionButton>
                  </Card>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState>
            Nessuna abitudine attiva.{" "}
            <TextLink href="/abitudini">Creane una</TextLink>
          </EmptyState>
        )}
      </Section>

      <Section
        title="Obiettivi"
        action={<TextLink href="/abitudini#obiettivi">Tutti</TextLink>}
      >
        {goals.length ? (
          <ul className="grid grid-cols-3 gap-2">
            {goals.slice(0, 6).map((goal) => {
              const pct = goalPercent(goal);
              return (
                <li key={goal.id}>
                  <Link
                    href={`/abitudini/obiettivi/${goal.id}`}
                    className="flex h-full flex-col items-center gap-2 rounded-2xl border border-border bg-surface px-2 py-3 text-center"
                  >
                    <ProgressRing
                      percent={pct}
                      color={recordColor(goal)}
                      label={`${goal.title}: ${pct}%`}
                    >
                      <span className="text-base font-semibold">
                        {pct >= 100 ? "✓" : `${pct}%`}
                      </span>
                    </ProgressRing>
                    <span className="line-clamp-2 text-sm font-medium">
                      {goal.title}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState>
            Nessun obiettivo.{" "}
            <TextLink href="/abitudini#obiettivi">Aggiungine uno</TextLink>
          </EmptyState>
        )}
      </Section>

      <Section
        title="Liste"
        action={<TextLink href="/aggiungi?tipo=lista">Tutte</TextLink>}
      >
        {lists.length ? (
          lists.map((note) => (
            <ListAccordion
              key={note.id}
              id={`note:${note.id}`}
              title={
                <span className="flex items-center gap-2">
                  {note.title}
                  <PrivateMark visibility={note.visibility} />
                </span>
              }
              count={note.items.filter((i) => !i.done).length}
              defaultOpen={false}
            >
              <ChecklistRows note={note} />
              <div className="flex justify-end border-t border-border px-2 py-1">
                <TextLink href={`/aggiungi/note/${note.id}`}>Apri</TextLink>
              </div>
            </ListAccordion>
          ))
        ) : (
          <EmptyState>
            Nessuna lista.{" "}
            <TextLink href="/aggiungi?tipo=lista">Creane una</TextLink>
          </EmptyState>
        )}
      </Section>

      <Section
        title="Note e appunti"
        action={<TextLink href="/aggiungi?tipo=nota">Tutte</TextLink>}
      >
        {notes.length ? (
          <ul className="grid grid-cols-2 gap-2">
            {notes.map((note) => (
              <li key={note.id}>
                <Link
                  href={`/aggiungi/note/${note.id}`}
                  className="flex h-full min-h-24 flex-col gap-2 rounded-2xl border border-border bg-surface p-4"
                >
                  <span className="font-medium">{note.title}</span>
                  {note.body ? (
                    <span className="line-clamp-2 text-sm text-muted">
                      {note.body}
                    </span>
                  ) : null}
                  <span className="mt-auto flex items-center gap-2 text-sm text-muted">
                    <PrivateMark visibility={note.visibility} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState>
            Nessuna nota.{" "}
            <TextLink href="/aggiungi?tipo=nota">Scrivine una</TextLink>
          </EmptyState>
        )}
      </Section>
    </>
  );
}
