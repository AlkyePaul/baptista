import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  addMealEntryAction,
  addMealItemAction,
  addMealRecipeAction,
  deleteKitchenRecordAction,
  removeMealItemAction,
  setMealItemGramsAction,
  updateMealAction,
} from "@/app/actions/kitchen";
import { FoodPicker } from "@/components/food-picker";
import { ActionButton, ActionForm, Field, SelectField, SubmitButton, VisibilityField } from "@/components/forms";
import { MacroLine } from "@/components/kitchen";
import { Card, EmptyState, PageHeader, Section, TextLink } from "@/components/ui";
import type { Meal } from "@/lib/db/types";
import { localDate, localHour } from "@/lib/dates";
import { formatItalianNumber } from "@/lib/goals";
import { requireExecutionContext } from "@/lib/households/context";
import { mealTotals, portion, slotForHour, SLOTS } from "@/lib/nutrition";
import { listMealItems, MAX_MEAL_ITEMS } from "@/services/meals";
import { listRecipes } from "@/services/recipes";
import { getRecord } from "@/services/shared";

export const metadata: Metadata = { title: "Pasto" };

/**
 * A meal (D31) = catalog foods with grams, for calories and macros. A recipe can be added: its
 * weighed ingredients bring their grams, the others start at 0 g and can be corrected.
 */
export default async function MealPage({ params }: PageProps<"/stanze/cucina/pasti/[id]">) {
  const { id } = await params;
  const ctx = await requireExecutionContext();
  const meal = await getRecord<Meal>(ctx, "meals", id);
  if (!meal) notFound();
  const [items, recipes] = await Promise.all([listMealItems(ctx, [meal.id]), listRecipes(ctx)]);
  const now = new Date();
  const tz = ctx.household.timezone;
  const totals = mealTotals(items);
  const isOwner = meal.owner_user_id === ctx.user.id;

  return (
    <>
      <TextLink href="/stanze/cucina/dieta#pasti">← Dieta</TextLink>
      <PageHeader title={meal.title} />

      <Card className="flex flex-col gap-2 p-4">
        <span className="text-sm text-muted">Totale del pasto</span>
        <MacroLine totals={totals} />
        {totals.unknown.length ? (
          <p className="text-xs text-danger">Senza calorie negli alimenti di casa: {totals.unknown.join(", ")}. Il totale non le conta.</p>
        ) : null}
        {totals.protein === null || totals.carbs === null || totals.fat === null ? (
          <p className="text-xs text-muted">«—» = manca il dato per almeno un alimento: il totale non viene stimato.</p>
        ) : null}
      </Card>

      <Section title="Alimenti">
        {items.length ? (
          <Card>
            <ul className="divide-y divide-border">
              {items.map((item) => {
                const kcal = item.food.kcal_100g === null ? null : portion({ ...item.food, kcal_100g: item.food.kcal_100g }, item.grams).kcal;
                return (
                  <li key={item.id} className="flex items-center gap-2 py-2 pr-1 pl-4">
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate">{item.food.name}</span>
                      <span className="text-xs text-muted">{kcal === null ? "kcal sconosciute" : `${formatItalianNumber(kcal)} kcal`}</span>
                    </span>
                    <ActionForm action={setMealItemGramsAction.bind(null, item.id)} resetOnSuccess={false} className="flex-row items-center gap-1">
                      <input
                        name="grams"
                        inputMode="decimal"
                        defaultValue={formatItalianNumber(item.grams, false)}
                        aria-label={`Grammi di ${item.food.name}`}
                        className="min-h-10 w-20 rounded-lg border border-border bg-surface px-2 text-right"
                      />
                      <span className="text-sm text-muted">g</span>
                      <SubmitButton variant="ghost" pendingLabel="…" className="min-h-10 px-2">
                        ✓
                      </SubmitButton>
                    </ActionForm>
                    <ActionButton action={removeMealItemAction.bind(null, item.id)} label={`Rimuovi: ${item.food.name}`} className="size-10 px-0">
                      <span aria-hidden>×</span>
                    </ActionButton>
                  </li>
                );
              })}
            </ul>
          </Card>
        ) : (
          <EmptyState>Aggiungi un alimento o una ricetta qui sotto.</EmptyState>
        )}
        {items.length < MAX_MEAL_ITEMS ? (
          <details className="rounded-2xl border border-border bg-surface" open={items.length === 0}>
            <summary className="flex min-h-12 cursor-pointer items-center px-4 font-medium">+ Aggiungi alimento</summary>
            <div className="border-t border-border p-4">
              <ActionForm action={addMealItemAction.bind(null, meal.id)}>
                <FoodPicker />
                <Field label="Grammi" name="grams" inputMode="decimal" placeholder="100" hint="0 se non conta (spezie, aglio…)" />
                <SubmitButton>Aggiungi</SubmitButton>
              </ActionForm>
            </div>
          </details>
        ) : null}
        {recipes.length ? (
          <details className="rounded-2xl border border-border bg-surface">
            <summary className="flex min-h-12 cursor-pointer items-center px-4 font-medium">+ Aggiungi una ricetta</summary>
            <div className="border-t border-border p-4">
              <ActionForm action={addMealRecipeAction.bind(null, meal.id)} successMessage>
                <SelectField label="Ricetta" name="recipe_id" options={recipes.map((r) => ({ value: r.id, label: r.title }))} />
                <SubmitButton variant="secondary">Aggiungi gli ingredienti</SubmitButton>
              </ActionForm>
            </div>
          </details>
        ) : null}
      </Section>

      {items.length ? (
        <Section title="L'hai mangiato?">
          <Card className="p-4">
            <ActionForm action={addMealEntryAction} successMessage>
              <input type="hidden" name="meal_id" value={meal.id} />
              <div className="grid grid-cols-3 gap-3">
                <SelectField label="Pasto" name="slot" defaultValue={slotForHour(localHour(now, tz))} options={SLOTS.map((s) => ({ value: s.id, label: s.label }))} />
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
