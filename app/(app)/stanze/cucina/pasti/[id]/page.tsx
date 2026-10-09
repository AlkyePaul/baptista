import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { addMealEntryAction, addMealItemAction, deleteKitchenRecordAction, removeMealItemAction, updateMealAction } from "@/app/actions/kitchen";
import { ActionButton, ActionForm, Field, SelectField, SubmitButton, VisibilityField } from "@/components/forms";
import { FoodLookup } from "@/components/food-lookup";
import { MacroLine, NutritionFields } from "@/components/kitchen";
import { Card, EmptyState, PageHeader, Section, TextLink } from "@/components/ui";
import type { Meal } from "@/lib/db/types";
import { localDate, localHour } from "@/lib/dates";
import { formatItalianNumber } from "@/lib/goals";
import { requireExecutionContext } from "@/lib/households/context";
import { mealTotals, portion, slotForHour, SLOTS } from "@/lib/nutrition";
import { knownFoods } from "@/services/food";
import { MAX_MEAL_ITEMS } from "@/services/meals";
import { getRecord } from "@/services/shared";

export const metadata: Metadata = { title: "Pasto" };

/** A meal = foods with grams; kcal and macros are derived (D25). */
export default async function MealPage({ params }: PageProps<"/stanze/cucina/pasti/[id]">) {
  const { id } = await params;
  const ctx = await requireExecutionContext();
  const meal = await getRecord<Meal>(ctx, "meals", id);
  if (!meal) notFound();
  const known = await knownFoods(ctx);
  const now = new Date();
  const tz = ctx.household.timezone;
  const totals = mealTotals(meal.items);
  const isOwner = meal.owner_user_id === ctx.user.id;

  return (
    <>
      <TextLink href="/stanze/cucina/aggiungi?tipo=pasto">← Pasti</TextLink>
      <PageHeader title={meal.title} />

      <Card className="flex flex-col gap-2 p-4">
        <span className="text-sm text-muted">Totale del pasto</span>
        <MacroLine totals={totals} />
        {meal.items.some((i) => i.protein_100g == null || i.carbs_100g == null || i.fat_100g == null) ? (
          <p className="text-xs text-muted">«—» = manca il dato per almeno un alimento: il totale non viene stimato.</p>
        ) : null}
      </Card>

      <Section title="Alimenti">
        {meal.items.length ? (
          <Card>
            <ul className="divide-y divide-border">
              {meal.items.map((item) => {
                const p = portion(item, item.grams);
                return (
                  <li key={item.id} className="flex items-center gap-3 py-2 pr-2 pl-4">
                    <span className="flex flex-1 flex-col">
                      <span>{item.name}</span>
                      <span className="text-sm text-muted">
                        {formatItalianNumber(item.grams)} g · {formatItalianNumber(p.kcal)} kcal
                      </span>
                    </span>
                    <ActionButton action={removeMealItemAction.bind(null, meal.id, meal.version, item.id)} label={`Rimuovi: ${item.name}`} className="size-11 px-0">
                      <span aria-hidden>×</span>
                    </ActionButton>
                  </li>
                );
              })}
            </ul>
          </Card>
        ) : (
          <EmptyState>Aggiungi il primo alimento qui sotto.</EmptyState>
        )}
        {meal.items.length < MAX_MEAL_ITEMS ? (
          <details className="rounded-2xl border border-border bg-surface" open={meal.items.length === 0}>
            <summary className="flex min-h-12 cursor-pointer items-center px-4 font-medium">+ Aggiungi alimento</summary>
            <div className="border-t border-border p-4">
              <ActionForm action={addMealItemAction.bind(null, meal.id)}>
                <input type="hidden" name="version" value={meal.version} />
                <input type="hidden" name="barcode" />
                <FoodLookup targets={{ name: "name", barcode: "barcode" }} known={known} />
                <div className="grid grid-cols-[1fr_7rem] gap-3">
                  <Field label="Alimento" name="name" required />
                  <Field label="Grammi" name="grams" inputMode="decimal" placeholder="100" />
                </div>
                <NutritionFields />
                <SubmitButton>Aggiungi</SubmitButton>
              </ActionForm>
            </div>
          </details>
        ) : null}
      </Section>

      {meal.items.length ? (
        <Section title="L'hai mangiato?">
          <Card className="p-4">
            <ActionForm action={addMealEntryAction} successMessage>
              <input type="hidden" name="meal_id" value={meal.id} />
              <div className="grid grid-cols-3 gap-3">
                <SelectField
                  label="Pasto"
                  name="slot"
                  defaultValue={slotForHour(localHour(now, tz))}
                  options={SLOTS.map((s) => ({ value: s.id, label: s.label }))}
                />
                <Field label="Giorno" name="eaten_on" type="date" defaultValue={localDate(now, tz)} />
                <Field label="Porzioni" name="portions" inputMode="decimal" defaultValue="1" />
              </div>
              <SubmitButton>Aggiungi al mio diario</SubmitButton>
              <p className="text-xs text-muted">Il diario è personale: lo vedi solo tu.</p>
            </ActionForm>
          </Card>
        </Section>
      ) : null}

      <details className="rounded-2xl border border-border bg-surface">
        <summary className="flex min-h-12 cursor-pointer items-center px-4 font-medium">Dettagli</summary>
        <div className="border-t border-border p-4">
          <ActionForm action={updateMealAction.bind(null, meal.id)} resetOnSuccess={false} successMessage>
            <input type="hidden" name="version" value={meal.version} />
            <Field label="Nome" name="title" defaultValue={meal.title} required />
            <Field label="Note" name="notes" defaultValue={meal.notes} multiline />
            {isOwner ? <VisibilityField defaultValue={meal.visibility} /> : <input type="hidden" name="visibility" value={meal.visibility} />}
            <SubmitButton>Salva</SubmitButton>
          </ActionForm>
        </div>
      </details>

      <div className="flex justify-end">
        <ActionButton action={deleteKitchenRecordAction.bind(null, "meals", meal.id)} variant="danger" confirmLabel="Conferma eliminazione">
          Elimina pasto
        </ActionButton>
      </div>
    </>
  );
}
