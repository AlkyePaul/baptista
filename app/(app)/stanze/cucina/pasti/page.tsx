import type { Metadata } from "next";
import Link from "next/link";
import { materializeSchedulesAction, setKcalTargetAction } from "@/app/actions/kitchen";
import { ActionForm, Field, SubmitButton } from "@/components/forms";
import { DailySummary } from "@/components/daily-summary";
import { MealPlanner } from "@/components/meal-planner";
import { WeekCalendar } from "@/components/week-calendar";
import { buttonClass, cx } from "@/components/ui";
import { addDays, formatLongDay, isCivilDate, relativeDay, weekDays, weekStart } from "@/lib/dates";
import { requireExecutionContext } from "@/lib/households/context";
import { diaryTotals, mealTotals, type Slot } from "@/lib/nutrition";
import { getKcalTarget, listDays } from "@/services/diet";
import { listMealItems, listMeals } from "@/services/meals";
import { materializeSchedules } from "@/services/schedules";
import { localDate, localHour } from "@/lib/dates";
import { formatItalianNumber } from "@/lib/goals";

export const metadata: Metadata = { title: "Pasti" };

/**
 * Weekly Meal Planner: unified food planning and calorie diary.
 * - Weekly calendar navigation at top
 * - Selected day's nutritional summary
 * - Meal accordions per slot (Colazione, Pranzo, Cena, Spuntini)
 * - Recurring meals auto-materialized on load
 * - Full-screen food selector triggered from accordion + buttons
 * - Supports future dates (projected calories)
 */
export default async function MealPlannerPage({ searchParams }: PageProps<"/stanze/cucina/pasti">) {
  const ctx = await requireExecutionContext();
  const params = await searchParams;
  const now = new Date();
  const tz = ctx.household.timezone;
  const today = localDate(now, tz);

  // Allow future dates (removed the <= today restriction)
  const day = typeof params.giorno === "string" && isCivilDate(params.giorno) ? params.giorno : today;

  // Determine the week boundaries
  const days = weekDays(day);
  const weekFrom = days[0];
  const weekTo = days[6];

  // Auto-materialize recurring meals for the visible week + 7 extra days.
  // The materializations PK guarantees idempotency across concurrent loads.
  const materializeTo = addDays(weekTo, 7);
  await materializeSchedules(ctx, weekFrom, materializeTo);

  // Load all data for the week
  const [weekEntries, target, meals] = await Promise.all([
    listDays(ctx, weekFrom, weekTo),
    getKcalTarget(ctx),
    listMeals(ctx),
  ]);

  // Compute per-meal kcal for the food selector
  const mealItems = await listMealItems(ctx, meals.map((m) => m.id));
  const mealsWithKcal = meals.map((m) => ({
    ...m,
    kcal: mealTotals(mealItems.filter((i) => i.meal_id === m.id)).kcal,
  }));

  // Selected day's entries
  const dayEntries = weekEntries.filter((e) => e.eaten_on === day);
  const totals = diaryTotals(dayEntries);

  // Dates with entries (for calendar dots)
  const datesWithEntries = new Set(weekEntries.map((e) => e.eaten_on));

  const isFuture = day > today;
  const dayLabel = `${relativeDay(day, today)} — ${formatLongDay(day)}`;

  return (
    <>
      {/* Weekly calendar navigation */}
      <WeekCalendar
        selected={day}
        today={today}
        datesWithEntries={datesWithEntries}
      />

      {/* Day header */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight first-letter:uppercase">
          {relativeDay(day, today)}
        </h1>
        <span className="text-sm text-muted first-letter:uppercase">
          {formatLongDay(day)}
        </span>
      </div>

      {/* Daily nutritional summary */}
      <DailySummary
        totals={totals}
        target={target}
        today={today}
        selectedDay={day}
      />

      {/* Meal accordions with integrated food selector */}
      <MealPlanner
        day={day}
        dayLabel={dayLabel}
        today={today}
        entries={dayEntries}
        meals={mealsWithKcal}
      />

      {/* Saved meals section */}
      <details className="rounded-2xl border border-border bg-surface">
        <summary className="flex min-h-12 cursor-pointer items-center px-4 font-medium">
          Pasti salvati · {meals.length}
        </summary>
        <div className="border-t border-border">
          {meals.length ? (
            <ul className="divide-y divide-border">
              {meals.map((m) => (
                <li key={m.id}>
                  <Link
                    href={`/stanze/cucina/pasti/${m.id}`}
                    className="flex min-h-12 items-center justify-between gap-3 px-4"
                  >
                    <span>{m.title}</span>
                    <span className="text-sm text-muted">
                      {formatItalianNumber(mealsWithKcal.find((mw) => mw.id === m.id)?.kcal ?? 0)} kcal
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-4 text-center text-sm text-muted">
              Un pasto è una combinazione di alimenti con i grammi, da riusare nel diario.
            </p>
          )}
        </div>
      </details>

      {/* Kcal target settings */}
      <details className="rounded-2xl border border-border bg-surface">
        <summary className="flex min-h-12 cursor-pointer items-center px-4 font-medium">
          Obiettivo giornaliero
        </summary>
        <div className="border-t border-border p-4">
          <ActionForm action={setKcalTargetAction} resetOnSuccess={false} successMessage>
            <Field
              label="Calorie al giorno"
              name="kcal_target"
              inputMode="numeric"
              defaultValue={target ?? undefined}
              hint="Tra 800 e 6000. Lascia vuoto per non usarlo."
            />
            <SubmitButton>Salva</SubmitButton>
          </ActionForm>
        </div>
      </details>

      <p className="text-xs text-muted">
        {isFuture
          ? "I valori per i giorni futuri sono previsti dalla pianificazione, non un consumo effettivo."
          : "Il diario è personale: gli altri membri della casa non lo vedono. È un conteggio dei valori inseriti, non un consiglio medico."}
      </p>
    </>
  );
}
