import type { Metadata } from "next";
import Link from "next/link";
import { addFoodEntryAction, addMealEntryAction, addQuickEntryAction, createMealAction, deleteDietEntryAction, setKcalTargetAction } from "@/app/actions/kitchen";
import { ActionButton, ActionForm, Field, SelectField, SubmitButton, VisibilityField } from "@/components/forms";
import { FoodPicker } from "@/components/food-picker";
import { MacroLine } from "@/components/kitchen";
import { Modal, Tabs } from "@/components/modal";
import { ProgressRing } from "@/components/progress-ring";
import { buttonClass, Card, cx, EmptyState, PrivateMark, Section } from "@/components/ui";
import { addDays, formatLongDay, isCivilDate, localDate, localHour, relativeDay } from "@/lib/dates";
import { formatItalianNumber } from "@/lib/goals";
import { requireExecutionContext } from "@/lib/households/context";
import { diaryTotals, mealTotals, slotForHour, SLOTS, targetProgress, type Slot } from "@/lib/nutrition";
import { getKcalTarget, listDay } from "@/services/diet";
import { listMealItems, listMeals } from "@/services/meals";

export const metadata: Metadata = { title: "Dieta" };

const RING = "#3f9d8c";
const OVER = "#c4553f";

/** Personal calorie diary (D25): always private, values are snapshots of what was eaten. */
export default async function DietPage({ searchParams }: PageProps<"/stanze/cucina/dieta">) {
  const ctx = await requireExecutionContext();
  const params = await searchParams;
  const now = new Date();
  const tz = ctx.household.timezone;
  const today = localDate(now, tz);
  const day = typeof params.giorno === "string" && isCivilDate(params.giorno) && params.giorno <= today ? params.giorno : today;

  const [entries, target, meals] = await Promise.all([listDay(ctx, day), getKcalTarget(ctx), listMeals(ctx)]);
  const mealItems = await listMealItems(ctx, meals.map((m) => m.id));
  const mealKcal = new Map(meals.map((m) => [m.id, mealTotals(mealItems.filter((i) => i.meal_id === m.id)).kcal]));
  const totals = diaryTotals(entries);
  const progress = targetProgress(totals.kcal, target);
  const over = progress.left !== null && progress.left < 0;
  const defaultSlot: Slot = day === today ? slotForHour(localHour(now, tz)) : "lunch";
  const slotField = <SelectField label="Pasto" name="slot" defaultValue={defaultSlot} options={SLOTS.map((s) => ({ value: s.id, label: s.label }))} />;

  return (
    <>
      <header className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <Link href={`/stanze/cucina/dieta?giorno=${addDays(day, -1)}`} className={cx(buttonClass.ghost, "size-11 px-0")} aria-label="Giorno precedente">
            ‹
          </Link>
          <div className="flex flex-col items-center">
            <h1 className="text-3xl font-semibold tracking-tight first-letter:uppercase">{relativeDay(day, today)}</h1>
            <p className="text-sm text-muted first-letter:uppercase">{formatLongDay(day)}</p>
          </div>
          {day < today ? (
            <Link href={`/stanze/cucina/dieta?giorno=${addDays(day, 1)}`} className={cx(buttonClass.ghost, "size-11 px-0")} aria-label="Giorno successivo">
              ›
            </Link>
          ) : (
            <span className="size-11" />
          )}
        </div>
      </header>

      <Card className="flex items-center gap-5 p-4">
        <ProgressRing
          percent={target ? progress.percent : 0}
          color={over ? OVER : RING}
          size={112}
          stroke={10}
          label={target ? `${totals.kcal} kcal su ${target}` : `${totals.kcal} kcal`}
        >
          <span className="text-2xl font-semibold">{formatItalianNumber(totals.kcal)}</span>
          <span className="text-xs text-muted">kcal</span>
        </ProgressRing>
        <div className="flex flex-1 flex-col gap-2">
          {target ? (
            <p className={cx("font-medium", over && "text-danger")}>
              {over ? `${formatItalianNumber(-progress.left!)} kcal oltre l'obiettivo` : `Restano ${formatItalianNumber(progress.left!)} kcal`}
            </p>
          ) : (
            <p className="text-sm text-muted">Imposta un obiettivo giornaliero qui sotto.</p>
          )}
          <MacroLine totals={totals} hideKcal />
        </div>
      </Card>

      <Modal trigger="+ Aggiungi al diario" title="Cosa hai mangiato?">
        <Tabs
          tabs={[
            {
              id: "alimento",
              label: "Alimento",
              content: (
                <ActionForm action={addFoodEntryAction}>
                  <input type="hidden" name="eaten_on" value={day} />
                  <FoodPicker />
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Grammi" name="grams" inputMode="decimal" placeholder="100" />
                    {slotField}
                  </div>
                  <SubmitButton>Aggiungi</SubmitButton>
                </ActionForm>
              ),
            },
            {
              id: "pasto",
              label: "Pasto salvato",
              content: meals.length ? (
                <ActionForm action={addMealEntryAction}>
                  <input type="hidden" name="eaten_on" value={day} />
                  <SelectField
                    label="Pasto"
                    name="meal_id"
                    options={meals.map((m) => ({ value: m.id, label: `${m.title} · ${formatItalianNumber(mealKcal.get(m.id) ?? 0)} kcal` }))}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    {slotField}
                    <Field label="Porzioni" name="portions" inputMode="decimal" defaultValue="1" />
                  </div>
                  <SubmitButton>Aggiungi</SubmitButton>
                </ActionForm>
              ) : (
                <EmptyState>Nessun pasto salvato: crealo qui sotto, in «Pasti».</EmptyState>
              ),
            },
            {
              id: "rapido",
              label: "Rapido",
              content: (
                <ActionForm action={addQuickEntryAction}>
                  <input type="hidden" name="eaten_on" value={day} />
                  <div className="grid grid-cols-[1fr_7rem] gap-3">
                    <Field label="Cosa" name="label" placeholder="Es. Pizza margherita" required />
                    <Field label="kcal" name="kcal" inputMode="decimal" />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Field label="Prot. (g)" name="protein_g" inputMode="decimal" />
                    <Field label="Carb. (g)" name="carbs_g" inputMode="decimal" />
                    <Field label="Grassi (g)" name="fat_g" inputMode="decimal" />
                  </div>
                  {slotField}
                  <SubmitButton>Aggiungi</SubmitButton>
                </ActionForm>
              ),
            },
          ]}
        />
      </Modal>

      {SLOTS.map((slot) => {
        const list = entries.filter((e) => e.slot === slot.id);
        const kcal = diaryTotals(list).kcal;
        return (
          <Section key={slot.id} title={slot.label} action={list.length ? <span className="text-sm text-muted">{formatItalianNumber(kcal)} kcal</span> : undefined}>
            {list.length ? (
              <Card>
                <ul className="divide-y divide-border">
                  {list.map((entry) => (
                    <li key={entry.id} className="flex items-center gap-3 py-2 pr-2 pl-4">
                      <span className="flex flex-1 flex-col">
                        <span>{entry.label}</span>
                        <span className="text-sm text-muted">
                          {entry.grams ? `${formatItalianNumber(entry.grams)} g · ` : ""}
                          {formatItalianNumber(entry.kcal)} kcal
                        </span>
                      </span>
                      <ActionButton action={deleteDietEntryAction.bind(null, entry.id)} label={`Elimina: ${entry.label}`} confirmLabel="Elimina?" className="min-h-10 px-2 text-xs">
                        ×
                      </ActionButton>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : (
              <p className="text-sm text-muted">Niente registrato.</p>
            )}
          </Section>
        );
      })}

      <Section title="Pasti" id="pasti">
        {meals.length ? (
          <Card>
            <ul className="divide-y divide-border">
              {meals.map((m) => (
                <li key={m.id}>
                  <Link href={`/stanze/cucina/pasti/${m.id}`} className="flex min-h-12 items-center justify-between gap-3 px-4">
                    <span>{m.title}</span>
                    <span className="flex items-center gap-2 text-sm text-muted">
                      {formatItalianNumber(mealKcal.get(m.id) ?? 0)} kcal
                      <PrivateMark visibility={m.visibility} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <EmptyState>Un pasto è una combinazione di alimenti con i grammi, da riusare nel diario. Puoi anche partire da una ricetta.</EmptyState>
        )}
        <details className="rounded-2xl border border-border bg-surface">
          <summary className="flex min-h-12 cursor-pointer items-center px-4 font-medium">+ Nuovo pasto</summary>
          <div className="border-t border-border p-4">
            <ActionForm action={createMealAction}>
              <Field label="Nome del pasto" name="title" placeholder="Es. Colazione classica" required />
              <VisibilityField />
              <SubmitButton>Crea e aggiungi gli alimenti</SubmitButton>
            </ActionForm>
          </div>
        </details>
      </Section>

      <details className="rounded-2xl border border-border bg-surface">
        <summary className="flex min-h-12 cursor-pointer items-center px-4 font-medium">Obiettivo giornaliero</summary>
        <div className="border-t border-border p-4">
          <ActionForm action={setKcalTargetAction} resetOnSuccess={false} successMessage>
            <Field label="Calorie al giorno" name="kcal_target" inputMode="numeric" defaultValue={target ?? undefined} hint="Tra 800 e 6000. Lascia vuoto per non usarlo." />
            <SubmitButton>Salva</SubmitButton>
          </ActionForm>
        </div>
      </details>
      <p className="text-xs text-muted">
        Il diario è personale: gli altri membri della casa non lo vedono. È un conteggio dei valori inseriti, non un consiglio medico.
      </p>
    </>
  );
}
