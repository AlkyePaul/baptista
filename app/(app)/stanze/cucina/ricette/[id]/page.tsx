import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { addIngredientAction, addRecipeToMealAction, deleteKitchenRecordAction, removeIngredientAction, updateRecipeAction } from "@/app/actions/kitchen";
import { addIngredientsAction } from "@/app/actions/shopping";
import { FoodPicker } from "@/components/food-picker";
import { ActionButton, ActionForm, Field, SelectField, SubmitButton, VisibilityField } from "@/components/forms";
import { ListAccordion } from "@/components/list-accordion";
import { Card, EmptyState, PageHeader, PrivateMark, Section, TextLink } from "@/components/ui";
import { RECIPE_UNITS } from "@/lib/db/types";
import { RECIPE_UNIT_LABELS, recipeQuantity } from "@/lib/food";
import { requireExecutionContext } from "@/lib/households/context";
import { listPantry } from "@/services/food";
import { listMeals } from "@/services/meals";
import { getRecipe, listIngredients } from "@/services/recipes";
import { listShopping } from "@/services/shopping";

export const metadata: Metadata = { title: "Ricetta" };

/** A page of the family cookbook (D31): catalog ingredients, optional quantities, preparation. */
export default async function RecipePage({ params }: PageProps<"/stanze/cucina/ricette/[id]">) {
  const { id } = await params;
  const ctx = await requireExecutionContext();
  const recipe = await getRecipe(ctx, id);
  if (!recipe) notFound();
  const [ingredients, pantry, shoppingItems, meals] = await Promise.all([listIngredients(ctx, recipe.id), listPantry(ctx), listShopping(ctx), listMeals(ctx)]);
  const isOwner = recipe.owner_user_id === ctx.user.id;
  // C3: what is not in the house, matched by catalog food (no name guessing any more).
  const inHouse = new Set(pantry.map((f) => f.food_id));
  const onList = new Set(shoppingItems.map((i) => i.food_id));
  const missing = ingredients.filter((i) => !inHouse.has(i.food_id));

  return (
    <>
      <TextLink href="/stanze/cucina/ricette">← Ricettario</TextLink>
      <PageHeader
        title={recipe.title}
        subtitle={recipe.servings ? `${recipe.servings === 1 ? "1 porzione" : `${recipe.servings} porzioni`}` : undefined}
        action={<PrivateMark visibility={recipe.visibility} />}
      />

      <ListAccordion id={`recipe:${recipe.id}`} title="Ingredienti" count={ingredients.length}>
        {ingredients.length ? (
          <ul className="divide-y divide-border">
            {ingredients.map((i) => (
              <li key={i.id} className="flex min-h-12 items-center gap-3 pr-1 pl-4">
                <span className="flex-1">{i.food.name}</span>
                <span className="text-sm text-muted">{recipeQuantity(i.amount, i.unit)}</span>
                <ActionButton action={removeIngredientAction.bind(null, i.id)} label={`Togli ${i.food.name}`} className="size-10 px-0">
                  <span aria-hidden>×</span>
                </ActionButton>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-4 py-3 text-sm text-muted">Nessun ingrediente.</p>
        )}
        <div className="border-t border-border p-3">
          <ActionForm action={addIngredientAction.bind(null, recipe.id)}>
            <FoodPicker label="Aggiungi ingrediente" />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Quantità" name="amount" inputMode="decimal" hint="Facoltativa" />
              <SelectField
                label="Unità"
                name="unit"
                defaultValue=""
                options={[{ value: "", label: "—" }, ...RECIPE_UNITS.map((u) => ({ value: u, label: RECIPE_UNIT_LABELS[u][0] }))]}
              />
            </div>
            <SubmitButton variant="secondary">Aggiungi</SubmitButton>
          </ActionForm>
        </div>
      </ListAccordion>

      {ingredients.length ? (
        <Section title="Cosa manca?">
          {missing.length ? (
            <Card className="p-4">
              <ActionForm action={addIngredientsAction}>
                <p className="text-sm text-muted">{missing.length === 1 ? "Questo ingrediente non è in dispensa:" : `${missing.length} ingredienti non sono in dispensa:`}</p>
                <ul className="flex flex-col">
                  {missing.map((i) => (
                    <li key={i.id}>
                      <label className="flex min-h-11 cursor-pointer items-center gap-3">
                        <input type="checkbox" name="food" value={i.food_id} className="size-5 accent-[var(--accent)]" />
                        <span className="flex-1">{i.food.name}</span>
                        {onList.has(i.food_id) ? <span className="text-xs text-muted">già in lista</span> : null}
                      </label>
                    </li>
                  ))}
                </ul>
                <SubmitButton variant="secondary">Aggiungi alla lista</SubmitButton>
              </ActionForm>
            </Card>
          ) : (
            <EmptyState>In dispensa c&apos;è tutto.</EmptyState>
          )}
        </Section>
      ) : null}

      {ingredients.length ? (
        <Section title="Nel diario">
          <Card className="p-4">
            <ActionForm action={addRecipeToMealAction.bind(null, recipe.id)}>
              <p className="text-sm text-muted">Gli ingredienti entrano in un pasto con i loro grammi; quelli senza peso (aglio, sale…) a 0 g, poi puoi correggerli.</p>
              <SelectField
                label="Aggiungi al pasto"
                name="meal_id"
                defaultValue="nuovo"
                options={[{ value: "nuovo", label: `Nuovo pasto «${recipe.title}»` }, ...meals.map((m) => ({ value: m.id, label: m.title }))]}
              />
              <SubmitButton variant="secondary">Aggiungi al pasto</SubmitButton>
            </ActionForm>
          </Card>
        </Section>
      ) : null}

      <Section title="Preparazione">
        <Card className="p-4">
          <ActionForm action={updateRecipeAction.bind(null, recipe.id)} resetOnSuccess={false} successMessage>
            <input type="hidden" name="version" value={recipe.version} />
            <Field label="Nome" name="title" defaultValue={recipe.title} required />
            <Field label="Porzioni" name="servings" inputMode="numeric" defaultValue={recipe.servings} hint="Facoltative" />
            <Field label="Preparazione" name="body" defaultValue={recipe.body} multiline />
            {isOwner ? <VisibilityField defaultValue={recipe.visibility} /> : <input type="hidden" name="visibility" value={recipe.visibility} />}
            <SubmitButton>Salva</SubmitButton>
          </ActionForm>
        </Card>
      </Section>

      <div className="flex justify-end">
        <ActionButton action={deleteKitchenRecordAction.bind(null, "recipes", recipe.id)} variant="danger" confirmLabel="Conferma eliminazione">
          Elimina ricetta
        </ActionButton>
      </div>
    </>
  );
}
