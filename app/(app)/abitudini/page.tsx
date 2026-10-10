import type { Metadata } from "next";
import Link from "next/link";
import { createGoalAction, createHabitAction, goalProgressAction, toggleHabitDayAction } from "@/app/actions/domains";
import { ActionButton, ActionForm, CategoryField, Field, SelectField, SubmitButton, VisibilityField } from "@/components/forms";
import { ProgressRing } from "@/components/progress-ring";
import { CategoryChip, Card, cx, EmptyState, PageHeader, PrivateMark, Section, TextLink } from "@/components/ui";
import { recordColor } from "@/lib/categories";
import { formatDay, localDate, relativeDay, weekDays, weekdayInitial } from "@/lib/dates";
import { requireExecutionContext } from "@/lib/households/context";
import { formatItalianNumber, goalPercent, goalRemaining } from "@/lib/goals";
import { listMyCategories } from "@/services/categories";
import { listGoals } from "@/services/goals";
import { getHabitWeeks, listHabits } from "@/services/habits";

export const metadata: Metadata = { title: "Abitudini e obiettivi" };

const TARGET_OPTIONS = Array.from({ length: 7 }, (_, i) => ({
  value: String(i + 1),
  label: i === 6 ? "Ogni giorno" : `${i + 1} ${i === 0 ? "volta" : "volte"} a settimana`,
}));

const it = (n: number) => formatItalianNumber(n);

export default async function HabitsPage({ searchParams }: PageProps<"/abitudini">) {
  const ctx = await requireExecutionContext();
  const today = localDate(new Date(), ctx.household.timezone);
  const days = weekDays(today);
  const { categoria } = await searchParams;
  const [allHabits, allGoals, categories] = await Promise.all([listHabits(ctx), listGoals(ctx), listMyCategories(ctx)]);
  // Filter chips: categories actually used by visible habits/goals (may include another member's).
  const used = new Map(
    [...allHabits, ...allGoals].flatMap((r) => (r.category ? [[r.category.id, r.category] as const] : [])),
  );
  const filter = typeof categoria === "string" && used.has(categoria) ? categoria : null;
  const habits = filter ? allHabits.filter((h) => h.category_id === filter) : allHabits;
  const goals = filter ? allGoals.filter((g) => g.category_id === filter) : allGoals;
  const weeks = await getHabitWeeks(ctx, habits.filter((h) => h.active), today);
  const inactive = habits.filter((h) => !h.active);
  const habitTitles = new Map(allHabits.map((h) => [h.id, h.title]));
  const habitOptions = allHabits.map((h) => ({ value: h.id, label: h.visibility === "private" ? `${h.title} (solo io)` : h.title }));
  const totals = weeks.reduce(
    (acc, w) => ({ done: acc.done + Math.min(w.count, w.habit.target_per_week), target: acc.target + w.habit.target_per_week }),
    { done: 0, target: 0 },
  );
  const overall = totals.target ? Math.round((100 * totals.done) / totals.target) : 0;

  return (
    <>
      <PageHeader
        title="Abitudini"
        subtitle={`Settimana dal ${formatDay(days[0])}`}
        action={<TextLink href="/abitudini/categorie">Categorie</TextLink>}
      />

      {used.size ? (
        <nav aria-label="Filtra per categoria" className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
          <Link
            href="/abitudini"
            scroll={false}
            aria-current={!filter ? "page" : undefined}
            className="flex min-h-10 shrink-0 items-center rounded-full border border-border bg-surface px-3 text-sm aria-[current]:border-foreground aria-[current]:font-medium"
          >
            Tutte
          </Link>
          {[...used.values()].map((c) => (
            <Link
              key={c.id}
              href={`/abitudini?categoria=${c.id}`}
              scroll={false}
              aria-current={filter === c.id ? "page" : undefined}
              className="flex min-h-10 shrink-0 items-center gap-2 rounded-full border border-border bg-surface px-3 text-sm aria-[current]:font-medium"
              style={filter === c.id ? { borderColor: c.color, backgroundColor: `${c.color}22` } : undefined}
            >
              <span aria-hidden className="size-3 rounded-full" style={{ backgroundColor: c.color }} />
              {c.name}
            </Link>
          ))}
        </nav>
      ) : null}

      {weeks.length ? (
        <Card className="flex items-center gap-4 p-4">
          <ProgressRing percent={overall} color="var(--accent)" size={88} stroke={10} label={`Settimana completata al ${overall}%`}>
            <span className="text-lg font-semibold">{overall}%</span>
          </ProgressRing>
          <div className="flex flex-col gap-1">
            <span className="font-medium">La tua settimana</span>
            <span className="text-sm text-muted">
              {totals.done} registrazioni su {totals.target} previste. Contano solo quelle registrate.
            </span>
          </div>
        </Card>
      ) : null}

      <Section title="Questa settimana">
        {weeks.length ? (
          <ul className="flex flex-col gap-3">
            {weeks.map((w) => {
              const color = recordColor(w.habit);
              return (
                <li key={w.habit.id}>
                  <Card className="flex flex-col gap-3 p-4">
                    <div className="flex items-center gap-4">
                      <ProgressRing
                        percent={w.percent}
                        color={color}
                        label={`${w.habit.title}: ${w.count} su ${w.habit.target_per_week} questa settimana`}
                      >
                        <span className="text-base font-semibold">
                          {w.count}/{w.habit.target_per_week}
                        </span>
                      </ProgressRing>
                      <div className="flex flex-1 flex-col gap-0.5">
                        <Link href={`/abitudini/${w.habit.id}`} className="font-medium">
                          {w.habit.title}
                        </Link>
                        {w.habit.category ? <CategoryChip category={w.habit.category} /> : null}
                        <span className="text-sm text-muted">
                          {w.remaining === 0 ? "Obiettivo della settimana raggiunto" : `Ne mancano ${w.remaining}`}
                        </span>
                      </div>
                      <PrivateMark visibility={w.habit.visibility} />
                    </div>
                    <ol className="grid grid-cols-7 gap-1">
                      {days.map((day) => {
                        const done = w.days.has(day);
                        const future = day > today;
                        return (
                          <li key={day} className="flex flex-col items-center gap-1">
                            <span className={cx("text-xs", day === today ? "font-semibold text-foreground" : "text-muted")}>
                              {weekdayInitial(day)}
                            </span>
                            {future ? (
                              <span aria-hidden className="size-9 rounded-full border border-dashed border-border" />
                            ) : (
                              <HabitDay
                                habitId={w.habit.id}
                                day={day}
                                done={done}
                                color={color}
                                label={`${w.habit.title}, ${relativeDay(day, today)}: ${done ? "registrato, tocca per annullare" : "tocca per registrare"}`}
                              />
                            )}
                          </li>
                        );
                      })}
                    </ol>
                  </Card>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState>Nessuna abitudine attiva. Creane una qui sotto.</EmptyState>
        )}
        <details className="group rounded-2xl border border-border bg-surface">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between px-4 font-medium">
            Nuova abitudine
            <span aria-hidden className="text-xl text-accent transition group-open:rotate-45">+</span>
          </summary>
          <div className="border-t border-border p-4">
            <ActionForm action={createHabitAction}>
              <Field label="Abitudine" name="title" placeholder="Es. Camminare 30 minuti" required />
              <SelectField label="Quante volte" name="target_per_week" defaultValue="3" options={TARGET_OPTIONS} />
              <CategoryField categories={categories} defaultValue={filter} />
              <VisibilityField />
              <SubmitButton>Crea</SubmitButton>
            </ActionForm>
          </div>
        </details>
        {inactive.length ? (
          <p className="text-sm text-muted">
            In pausa:{" "}
            {inactive.map((h, i) => (
              <span key={h.id}>
                {i > 0 ? ", " : ""}
                <Link href={`/abitudini/${h.id}`} className="underline underline-offset-4">
                  {h.title}
                </Link>
              </span>
            ))}
          </p>
        ) : null}
      </Section>

      <Section title="Obiettivi" id="obiettivi">
        {goals.length ? (
          <ul className="flex flex-col gap-3">
            {goals.map((goal) => {
              const pct = goalPercent(goal);
              return (
                <li key={goal.id}>
                  <Card className="flex flex-col gap-3 p-4">
                    <div className="flex items-center gap-4">
                      <ProgressRing percent={pct} color={recordColor(goal)} label={`${goal.title}: ${pct}%`}>
                        <span className="text-base font-semibold">{pct >= 100 ? "✓" : `${pct}%`}</span>
                      </ProgressRing>
                      <div className="flex flex-1 flex-col gap-0.5">
                        <Link href={`/abitudini/obiettivi/${goal.id}`} className="font-medium">
                          {goal.title}
                        </Link>
                        {goal.category ? <CategoryChip category={goal.category} /> : null}
                        <span className="text-sm text-muted">
                          Da {it(goal.start_value)} a {it(goal.target_value)}
                          {goal.unit ? ` ${goal.unit}` : ""} · ora {it(goal.current_value)}
                        </span>
                        <span className="text-sm text-muted">
                          {goalRemaining(goal) === 0
                            ? "Traguardo raggiunto"
                            : `Mancano ${it(goalRemaining(goal))}${goal.unit ? ` ${goal.unit}` : ""}`}
                          {goal.target_date ? ` · entro ${formatDay(goal.target_date)}` : ""}
                        </span>
                      </div>
                      <PrivateMark visibility={goal.visibility} />
                    </div>
                    {goal.habit_id ? (
                      <p className="text-sm text-muted">
                        Avanza da solo con l&apos;abitudine «{habitTitles.get(goal.habit_id) ?? "collegata"}».
                      </p>
                    ) : (
                    <ActionForm action={goalProgressAction.bind(null, goal.id)} resetOnSuccess={false} className="flex-row items-end">
                      <input type="hidden" name="version" value={goal.version} />
                      <Field
                        label="Valore attuale"
                        name="current_value"
                        inputMode="decimal"
                        defaultValue={formatItalianNumber(goal.current_value, false)}
                        className="flex-1"
                      />
                      <SubmitButton variant="secondary" pendingLabel="…">
                        Salva
                      </SubmitButton>
                    </ActionForm>
                    )}
                  </Card>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState>Nessun obiettivo ancora.</EmptyState>
        )}
        <details className="group rounded-2xl border border-border bg-surface">
          <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between px-4 font-medium">
            Nuovo obiettivo
            <span aria-hidden className="text-xl text-accent transition group-open:rotate-45">+</span>
          </summary>
          <div className="border-t border-border p-4">
            <ActionForm action={createGoalAction}>
              <Field label="Obiettivo" name="title" placeholder="Es. Correre 100 km" required />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Punto di partenza" name="start_value" inputMode="decimal" defaultValue="0" hint="Es. 85" />
                <Field label="Traguardo" name="target_value" inputMode="decimal" placeholder="100" hint="Più alto o più basso" required />
              </div>
              <Field label="Unità" name="unit" placeholder="km, kg, €…" />
              <Field label="Entro il" name="target_date" type="date" hint="Facoltativo" />
              <SelectField
                label="Avanza con un'abitudine"
                name="habit_id"
                defaultValue=""
                options={[{ value: "", label: "No, aggiorno io il valore" }, ...habitOptions]}
              />
              <CategoryField categories={categories} defaultValue={filter} />
              <VisibilityField />
              <SubmitButton>Crea</SubmitButton>
            </ActionForm>
          </div>
        </details>
      </Section>
    </>
  );
}

function HabitDay({ habitId, day, done, color, label }: { habitId: string; day: string; done: boolean; color: string; label: string }) {
  return (
    <ActionButton
      action={toggleHabitDayAction.bind(null, habitId, day)}
      label={label}
      variant="ghost"
      className="size-9 min-h-9 rounded-full p-0"
    >
      <span
        aria-hidden
        className="flex size-9 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors"
        style={done ? { backgroundColor: color, borderColor: color, color: "#fff" } : { borderColor: `${color}55` }}
      >
        {done ? "✓" : ""}
      </span>
    </ActionButton>
  );
}
