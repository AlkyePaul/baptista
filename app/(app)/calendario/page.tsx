import type { Metadata } from "next";
import Link from "next/link";
import { toggleTaskAction } from "@/app/actions/domains";
import { ActionButton } from "@/components/forms";
import { buttonClass, Card, cx, EmptyState, PrivateMark } from "@/components/ui";
import type { CalendarEvent, Task } from "@/lib/db/types";
import {
  addDays,
  addMonths,
  formatLongDay,
  formatMonth,
  formatTime,
  isCivilDate,
  isMonth,
  localDate,
  monthGrid,
  monthOf,
} from "@/lib/dates";
import { requireExecutionContext } from "@/lib/households/context";
import { listEventsBetween } from "@/services/calendar";
import { listTasksDueBetween } from "@/services/tasks";

export const metadata: Metadata = { title: "Calendario" };

const WEEKDAYS = ["L", "M", "M", "G", "V", "S", "D"];

/** Local days an event covers (all-day end is exclusive; timed end is an instant). */
function eventDays(event: CalendarEvent, tz: string): string[] {
  const first = event.all_day ? event.start_date! : localDate(new Date(event.starts_at!), tz);
  const last = event.all_day
    ? addDays(event.end_date!, -1)
    : localDate(new Date(new Date(event.ends_at!).getTime() - 1), tz);
  const days: string[] = [];
  for (let d = first; d <= last && days.length < 62; d = addDays(d, 1)) days.push(d);
  return days;
}

export default async function CalendarPage({ searchParams }: PageProps<"/calendario">) {
  const ctx = await requireExecutionContext();
  const tz = ctx.household.timezone;
  const today = localDate(new Date(), tz);
  const params = await searchParams;
  const dayParam = typeof params.giorno === "string" && isCivilDate(params.giorno) ? params.giorno : null;
  const monthParam = typeof params.mese === "string" && isMonth(params.mese) ? params.mese : null;
  const month = monthParam ?? (dayParam ? monthOf(dayParam) : monthOf(today));
  const selected = dayParam ?? (month === monthOf(today) ? today : `${month}-01`);

  const weeks = monthGrid(month);
  const gridStart = weeks[0][0];
  const gridEnd = weeks.at(-1)!.at(-1)!;
  const [events, tasks] = await Promise.all([
    listEventsBetween(ctx, gridStart, addDays(gridEnd, 1), 500),
    listTasksDueBetween(ctx, gridStart, gridEnd),
  ]);

  const eventsByDay = new Map<string, CalendarEvent[]>();
  for (const event of events) {
    for (const day of eventDays(event, tz)) eventsByDay.set(day, [...(eventsByDay.get(day) ?? []), event]);
  }
  const tasksByDay = new Map<string, Task[]>();
  for (const task of tasks) tasksByDay.set(task.due_date!, [...(tasksByDay.get(task.due_date!) ?? []), task]);

  const dayEvents = eventsByDay.get(selected) ?? [];
  const dayTasks = tasksByDay.get(selected) ?? [];
  const href = (m: string, d?: string) => `/calendario?mese=${m}${d ? `&giorno=${d}` : ""}`;

  return (
    <>
      <header className="flex items-center justify-between gap-2">
        <Link href={href(addMonths(month, -1))} className={buttonClass.ghost} aria-label="Mese precedente" scroll={false}>
          ‹
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight first-letter:uppercase">{formatMonth(month)}</h1>
        <Link href={href(addMonths(month, 1))} className={buttonClass.ghost} aria-label="Mese successivo" scroll={false}>
          ›
        </Link>
      </header>

      <Card className="p-2">
        <div className="grid grid-cols-7 pb-1 text-center text-xs font-medium text-muted" aria-hidden>
          {WEEKDAYS.map((d, i) => (
            <span key={i} className="py-1">
              {d}
            </span>
          ))}
        </div>
        <div role="grid" aria-label={`Calendario di ${formatMonth(month)}`} className="flex flex-col gap-1">
          {weeks.map((week) => (
            <div role="row" key={week[0]} className="grid grid-cols-7 gap-1">
              {week.map((day) => {
                const inMonth = monthOf(day) === month;
                const evCount = eventsByDay.get(day)?.length ?? 0;
                const openTasks = tasksByDay.get(day)?.filter((t) => t.status === "open").length ?? 0;
                const isSelected = day === selected;
                const isToday = day === today;
                const label = `${formatLongDay(day)}${evCount ? `, ${evCount} eventi` : ""}${openTasks ? `, ${openTasks} da fare` : ""}`;
                return (
                  <Link
                    role="gridcell"
                    key={day}
                    href={href(month, day)}
                    scroll={false}
                    aria-label={label}
                    aria-selected={isSelected}
                    aria-current={isToday ? "date" : undefined}
                    className={cx(
                      "flex aspect-square flex-col items-center justify-center gap-1 rounded-xl text-sm transition-colors",
                      !inMonth && "text-muted/50",
                      isSelected ? "bg-accent font-semibold text-on-accent" : "hover:bg-foreground/5",
                      isToday && !isSelected && "font-semibold text-accent ring-1 ring-accent/50",
                    )}
                  >
                    <span>{Number(day.slice(8))}</span>
                    <span className="flex h-1.5 gap-0.5" aria-hidden>
                      {evCount ? <span className={cx("size-1.5 rounded-full", isSelected ? "bg-on-accent" : "bg-accent")} /> : null}
                      {evCount > 1 ? <span className={cx("size-1.5 rounded-full", isSelected ? "bg-on-accent" : "bg-accent")} /> : null}
                      {openTasks ? <span className="size-1.5 rounded-full bg-[#d9a33a]" /> : null}
                    </span>
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
        <p className="flex gap-4 px-2 pt-2 text-xs text-muted">
          <span className="flex items-center gap-1">
            <span className="size-1.5 rounded-full bg-accent" /> Eventi
          </span>
          <span className="flex items-center gap-1">
            <span className="size-1.5 rounded-full bg-[#d9a33a]" /> Da fare
          </span>
          {month !== monthOf(today) ? (
            <Link href={href(monthOf(today), today)} className="ml-auto font-medium text-accent" scroll={false}>
              Oggi
            </Link>
          ) : null}
        </p>
      </Card>

      <section aria-labelledby="day-title" className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 id="day-title" className="text-lg font-semibold first-letter:uppercase">
            {selected === today ? "Oggi" : formatLongDay(selected)}
          </h2>
          <div className="flex gap-1">
            <Link href={`/aggiungi?tipo=evento&data=${selected}`} className={buttonClass.secondary + " min-h-10 px-3 text-sm"}>
              + Evento
            </Link>
            <Link href={`/aggiungi?tipo=attivita&data=${selected}`} className={buttonClass.secondary + " min-h-10 px-3 text-sm"}>
              + Da fare
            </Link>
          </div>
        </div>

        {dayEvents.length || dayTasks.length ? (
          <Card>
            <ul className="divide-y divide-border">
              {dayEvents.map((event) => (
                <li key={event.id}>
                  <Link href={`/calendario/${event.id}`} className="flex min-h-14 items-center gap-3 px-4 py-3">
                    <span className="h-8 w-1 shrink-0 rounded-full bg-accent" aria-hidden />
                    <span className="flex flex-1 flex-col">
                      <span>{event.title}</span>
                      <span className="text-sm text-muted">
                        {event.all_day
                          ? "Tutto il giorno"
                          : `${formatTime(new Date(event.starts_at!), tz)} – ${formatTime(new Date(event.ends_at!), tz)}`}
                      </span>
                    </span>
                    <PrivateMark visibility={event.visibility} />
                  </Link>
                </li>
              ))}
              {dayTasks.map((task) => {
                const done = task.status === "completed";
                return (
                  <li key={task.id} className="flex items-center gap-2 px-2 py-1">
                    <ActionButton
                      action={toggleTaskAction.bind(null, task.id, task.version, !done)}
                      label={done ? `Riapri: ${task.title}` : `Segna come fatta: ${task.title}`}
                      className="size-11 px-0"
                    >
                      {done ? (
                        <span aria-hidden className="inline-flex size-5 items-center justify-center rounded-md bg-[#d9a33a] text-xs text-white">
                          ✓
                        </span>
                      ) : (
                        <span aria-hidden className="inline-block size-5 rounded-md border-2 border-[#d9a33a]" />
                      )}
                    </ActionButton>
                    <Link href={`/aggiungi/attivita/${task.id}`} className="flex min-h-12 flex-1 items-center">
                      <span className={done ? "text-muted line-through" : undefined}>{task.title}</span>
                    </Link>
                    <PrivateMark visibility={task.visibility} />
                  </li>
                );
              })}
            </ul>
          </Card>
        ) : (
          <EmptyState>Niente in programma in questo giorno.</EmptyState>
        )}
      </section>
    </>
  );
}
