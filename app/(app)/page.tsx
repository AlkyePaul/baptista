import Link from "next/link";
import { toggleHabitDayAction } from "@/app/actions/domains";
import { BaptistaThread } from "@/components/baptista/thread";
import { ActionButton } from "@/components/forms";
import { ProgressRing } from "@/components/progress-ring";
import { recordColor } from "@/lib/categories";
import { Card, EmptyState, Section, TextLink } from "@/components/ui";
import { addDays, formatLongDay, formatTime, greeting, localDate, localHour } from "@/lib/dates";
import { requireExecutionContext, type ExecutionContext } from "@/lib/households/context";
import { getCurrentRoom } from "@/lib/rooms-server";
import { listEventsBetween } from "@/services/calendar";
import { goalPercent } from "@/lib/goals";
import { listGoals } from "@/services/goals";
import { getHabitWeeks, listHabits } from "@/services/habits";
import { loadThread } from "@/services/baptista";
import { listTasksDueBetween } from "@/services/tasks";
import { FinanceRoom, KitchenRoom, WardrobeRoom } from "@/components/room-dashboards";

export default async function HomePage() {
  const ctx = await requireExecutionContext();
  const room = await getCurrentRoom();
  const tz = ctx.household.timezone;
  const now = new Date();

  return (
    <>
      <header className="flex flex-col gap-1">
        <p className="text-sm text-muted first-letter:uppercase">{formatLongDay(localDate(now, tz))}</p>
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

  const [events, dueToday, habits, goals] = await Promise.all([
    listEventsBetween(ctx, today, addDays(today, 1)),
    listTasksDueBetween(ctx, today, today),
    listHabits(ctx, { activeOnly: true }),
    listGoals(ctx),
  ]);
  const openToday = dueToday.filter((t) => t.status === "open");
  const eventsLeft = events.filter((e) => e.all_day || (e.starts_at !== null && new Date(e.starts_at) > now)).length;
  // Phase 04.1: Baptista takes the place of «In evidenza» (same observations, same ranking).
  const [thread, weeks] = await Promise.all([
    loadThread(ctx, { room: "all", daily: true, eventsLeftToday: eventsLeft, now }),
    getHabitWeeks(ctx, habits, today),
  ]);
  // Ring colours of the thumbnails follow the same category colours as the cards.
  const colors = Object.fromEntries([...habits, ...goals].map((r) => [r.id, recordColor(r)]));
  for (const view of [thread.active, ...thread.queue]) {
    if (view?.thumb?.kind === "visual" && colors[view.thumb.sourceId]) view.thumb.color = colors[view.thumb.sourceId];
  }

  return (
    <>
      {thread.quiet ? <p className="-mt-2 text-muted">{thread.quiet}</p> : null}
      <BaptistaThread thread={thread} timeZone={tz} />

      <Section title="Oggi" action={<TextLink href={`/calendario?giorno=${today}`}>Calendario</TextLink>}>
        {events.length || openToday.length ? (
          <Card>
            <ul className="divide-y divide-border">
              {events.map((event) => (
                <li key={event.id}>
                  <Link href={`/calendario/${event.id}`} className="flex min-h-14 items-center gap-4 px-4 py-3">
                    <span className="w-14 shrink-0 font-mono text-sm text-muted">
                      {event.all_day ? "Giorno" : formatTime(new Date(event.starts_at!), tz)}
                    </span>
                    <span className="flex-1">{event.title}</span>
                  </Link>
                </li>
              ))}
              {openToday.map((task) => (
                <li key={task.id}>
                  <Link href={`/aggiungi/attivita/${task.id}`} className="flex min-h-14 items-center gap-4 px-4 py-3">
                    <span className="w-14 shrink-0 text-sm text-muted">Da fare</span>
                    <span className="flex-1">{task.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <EmptyState>Niente in programma per oggi.</EmptyState>
        )}
      </Section>

      <Section title="Abitudini della settimana" action={<TextLink href="/abitudini">Tutte</TextLink>}>
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
                    <span className="line-clamp-2 text-sm font-medium">{w.habit.title}</span>
                    <ActionButton
                      action={toggleHabitDayAction.bind(null, w.habit.id, today)}
                      variant={doneToday ? "secondary" : "ghost"}
                      label={doneToday ? `Annulla ${w.habit.title} di oggi` : `Registra ${w.habit.title} oggi`}
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
            Nessuna abitudine attiva. <TextLink href="/abitudini">Creane una</TextLink>
          </EmptyState>
        )}
      </Section>

      <Section title="Obiettivi" action={<TextLink href="/abitudini#obiettivi">Tutti</TextLink>}>
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
                    <ProgressRing percent={pct} color={recordColor(goal)} label={`${goal.title}: ${pct}%`}>
                      <span className="text-base font-semibold">{pct >= 100 ? "✓" : `${pct}%`}</span>
                    </ProgressRing>
                    <span className="line-clamp-2 text-sm font-medium">{goal.title}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState>
            Nessun obiettivo. <TextLink href="/abitudini#obiettivi">Aggiungine uno</TextLink>
          </EmptyState>
        )}
      </Section>
    </>
  );
}
