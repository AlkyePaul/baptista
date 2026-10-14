"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { run } from "@/lib/actions";
import { localDate } from "@/lib/dates";
import { DomainError, messageFor, type ActionState } from "@/lib/errors";
import { getUserContext, requireExecutionContext } from "@/lib/households/context";
import { uuidSchema } from "@/lib/households/permissions";
import * as diet from "@/services/diet";
import * as food from "@/services/food";
import * as meals from "@/services/meals";
import * as recipes from "@/services/recipes";
import { decimal, deleteRecord, parseForm } from "@/services/shared";
import * as schedules from "@/services/schedules";
import * as shopping from "@/services/shopping";

const id = (value: string) => uuidSchema.parse(value);
const version = (value: number) => z.number().int().positive().parse(value);

/** Validation messages written by services (e.g. «È già tra gli ingredienti.») reach the form. */
function domainMessage(state: ActionState, error?: unknown): ActionState {
  if (error instanceof DomainError && error.message !== error.code) return { ok: false, message: error.message };
  return state;
}

async function attempt(mutation: () => Promise<unknown>, success?: string): Promise<ActionState> {
  let failure: unknown;
  const state = await run(async () => {
    try {
      await mutation();
    } catch (error) {
      failure = error;
      throw error;
    }
  }, success);
  return state.ok ? state : domainMessage(state, failure);
}

// Cucina → Aggiungi: one catalog food, into the pantry or onto the list (D31) ----------------

const destination = z.object({ food_id: z.uuid({ error: "Scegli un alimento." }), destination: z.enum(["dispensa", "lista"]) });

export async function addFoodAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const target = parseForm(destination, formData);
  if (!target.ok) return target.state;
  const ctx = await requireExecutionContext();
  if (target.data.destination === "lista") {
    const parsed = parseForm(shopping.addShoppingSchema, (formData.set("kind", "food"), formData));
    if (!parsed.ok) return parsed.state;
    return attempt(() => shopping.addShoppingItem(ctx, parsed.data), "Aggiunto alla Lista della spesa.");
  }
  const parsed = parseForm(food.pantryItemSchema, formData);
  if (!parsed.ok) return parsed.state;
  return attempt(() => food.createPantryItem(ctx, target.data.food_id, parsed.data), "Aggiunto alla dispensa.");
}

export async function updatePantryItemAction(itemId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(food.updatePantryItemSchema, formData);
  if (!parsed.ok) return parsed.state;
  const ctx = await requireExecutionContext();
  const state = await run(() => food.updatePantryItem(ctx, id(itemId), parsed.data));
  if (state.ok) redirect("/stanze/cucina/dispensa");
  return state;
}

export async function setFoodStatusAction(foodId: string, foodVersion: number, status: string): Promise<ActionState> {
  const parsed = z.enum(food.FOOD_STATUSES).safeParse(status);
  if (!parsed.success) return { ok: false, message: messageFor("invalid") };
  const ctx = await requireExecutionContext();
  const today = localDate(new Date(), ctx.household.timezone);
  return run(() => food.setFoodStatus(ctx, id(foodId), version(foodVersion), parsed.data, today));
}

// Recipes (family cookbook) ------------------------------------------------------------------

export async function createRecipeAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(recipes.recipeSchema, formData);
  if (!parsed.ok) return parsed.state;
  const ctx = await requireExecutionContext();
  let recipeId = "";
  const state = await run(async () => {
    recipeId = await recipes.createRecipe(ctx, parsed.data);
  });
  if (state.ok) redirect(`/stanze/cucina/ricette/${recipeId}`);
  return state;
}

export async function updateRecipeAction(recipeId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(recipes.updateRecipeSchema, formData);
  if (!parsed.ok) return parsed.state;
  const ctx = await requireExecutionContext();
  return run(() => recipes.updateRecipe(ctx, id(recipeId), parsed.data), "Salvato.");
}

export async function addIngredientAction(recipeId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(recipes.ingredientSchema, formData);
  if (!parsed.ok) return parsed.state;
  const ctx = await requireExecutionContext();
  return attempt(() => recipes.addIngredient(ctx, id(recipeId), parsed.data));
}

export async function removeIngredientAction(ingredientId: string): Promise<ActionState> {
  const ctx = await requireExecutionContext();
  return run(() => recipes.removeIngredient(ctx, id(ingredientId)));
}

const toMeal = z.object({ meal_id: z.string().min(1, "Scegli un pasto."), title: z.string().trim().max(120).optional() });

/** From a recipe: into an existing meal, or a new meal named after the recipe. */
export async function addRecipeToMealAction(recipeId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(toMeal, formData);
  if (!parsed.ok) return parsed.state;
  const ctx = await requireExecutionContext();
  const recipe = await recipes.getRecipe(ctx, id(recipeId));
  if (!recipe) return { ok: false, message: messageFor("not_found") };
  let mealId = parsed.data.meal_id;
  const state = await run(async () => {
    if (mealId === "nuovo") {
      mealId = await meals.createMeal(ctx, { title: parsed.data.title || recipe.title, notes: null, visibility: recipe.visibility });
    }
    await recipes.addRecipeToMeal(ctx, recipe.id, id(mealId));
  });
  if (state.ok) redirect(`/stanze/cucina/pasti/${mealId}`);
  return state;
}

/** From a meal: «Aggiungi una ricetta». */
export async function addMealRecipeAction(mealId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(z.object({ recipe_id: z.uuid({ error: "Scegli una ricetta." }) }), formData);
  if (!parsed.ok) return parsed.state;
  const ctx = await requireExecutionContext();
  let added = 0;
  const state = await run(async () => {
    added = await recipes.addRecipeToMeal(ctx, parsed.data.recipe_id, id(mealId));
  });
  if (!state.ok) return state;
  return { ok: true, message: added ? `${added === 1 ? "1 alimento aggiunto" : `${added} alimenti aggiunti`}: controlla i grammi.` : "Gli ingredienti erano già nel pasto." };
}

// Meals --------------------------------------------------------------------------------------

export async function createMealAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(meals.mealSchema, formData);
  if (!parsed.ok) return parsed.state;
  const ctx = await requireExecutionContext();
  let mealId = "";
  const state = await run(async () => {
    mealId = await meals.createMeal(ctx, parsed.data);
  });
  if (state.ok) redirect(`/stanze/cucina/pasti/${mealId}`);
  return state;
}

export async function updateMealAction(mealId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(meals.updateMealSchema, formData);
  if (!parsed.ok) return parsed.state;
  const ctx = await requireExecutionContext();
  return run(() => meals.updateMeal(ctx, id(mealId), parsed.data), "Salvato.");
}

const unitQtySchema = z.object({ quantity: decimal("Quantità", { min: 1, max: 99, decimals: 0 }) });

/** Resolve portion_weight_g × quantity → grams, or null when the food is gram-based. */
function resolveUnitGrams(formData: FormData) {
  const raw = formData.get("portion_weight_g");
  const pw = raw ? Number(raw) : null;
  if (!pw || !Number.isFinite(pw)) return null;
  const parsed = parseForm(unitQtySchema, formData);
  if (!parsed.ok) return parsed;
  return { ok: true as const, grams: Math.round(parsed.data.quantity * pw * 10) / 10 };
}

export async function addMealItemAction(mealId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const unit = resolveUnitGrams(formData);
  if (unit && !unit.ok) return unit.state;
  const foodParsed = parseForm(z.object({ food_id: z.uuid({ error: "Scegli un alimento." }) }), formData);
  if (!foodParsed.ok) return foodParsed.state;
  if (unit) {
    const ctx = await requireExecutionContext();
    return run(() => meals.addMealItem(ctx, id(mealId), { food_id: foodParsed.data.food_id, grams: unit.grams }));
  }
  const gramsParsed = parseForm(meals.gramsSchema, formData);
  if (!gramsParsed.ok) return gramsParsed.state;
  const ctx = await requireExecutionContext();
  return run(() => meals.addMealItem(ctx, id(mealId), { food_id: foodParsed.data.food_id, grams: gramsParsed.data.grams }));
}

export async function setMealItemGramsAction(itemId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const unit = resolveUnitGrams(formData);
  if (unit && !unit.ok) return unit.state;
  if (unit) {
    const ctx = await requireExecutionContext();
    return run(() => meals.setMealItemGrams(ctx, id(itemId), unit.grams));
  }
  const parsed = parseForm(meals.gramsSchema, formData);
  if (!parsed.ok) return parsed.state;
  const ctx = await requireExecutionContext();
  return run(() => meals.setMealItemGrams(ctx, id(itemId), parsed.data.grams));
}

export async function removeMealItemAction(itemId: string): Promise<ActionState> {
  const ctx = await requireExecutionContext();
  return run(() => meals.removeMealItem(ctx, id(itemId)));
}

// Diary --------------------------------------------------------------------------------------

export async function addQuickEntryAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(diet.quickEntrySchema, formData);
  if (!parsed.ok) return parsed.state;
  const ctx = await requireExecutionContext();
  return run(() => diet.addQuickEntry(ctx, parsed.data), "Aggiunto al diario.");
}

export async function addFoodEntryAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const unit = resolveUnitGrams(formData);
  if (unit && !unit.ok) return unit.state;
  if (unit) {
    const parsed = parseForm(diet.foodEntrySchema.omit({ grams: true }), formData);
    if (!parsed.ok) return parsed.state;
    const ctx = await requireExecutionContext();
    return attempt(() => diet.addFoodEntry(ctx, { ...parsed.data, grams: unit.grams }), "Aggiunto al diario.");
  }
  const parsed = parseForm(diet.foodEntrySchema, formData);
  if (!parsed.ok) return parsed.state;
  const ctx = await requireExecutionContext();
  return attempt(() => diet.addFoodEntry(ctx, parsed.data), "Aggiunto al diario.");
}

export async function addMealEntryAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(diet.mealEntrySchema, formData);
  if (!parsed.ok) return parsed.state;
  const ctx = await requireExecutionContext();
  return run(() => diet.addMealEntry(ctx, parsed.data), "Aggiunto al diario.");
}

export async function setKcalTargetAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(diet.kcalTargetSchema, formData);
  if (!parsed.ok) return parsed.state;
  const ctx = await getUserContext();
  return run(() => diet.setKcalTarget(ctx, parsed.data.kcal_target), "Obiettivo salvato.");
}

export async function deleteDietEntryAction(entryId: string): Promise<ActionState> {
  const ctx = await requireExecutionContext();
  return run(() => schedules.deleteDietEntryWithSkip(ctx, id(entryId)));
}

/** Add a catalog food from the food selector (RPC-style, no FormData). */
export async function addFoodEntryDirectAction(input: {
  eaten_on: string;
  slot: string;
  food_id: string;
  grams: number;
}): Promise<ActionState> {
  const parsed = diet.foodEntrySchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? messageFor("invalid") };
  const ctx = await requireExecutionContext();
  return attempt(() => diet.addFoodEntry(ctx, parsed.data), "Aggiunto.");
}

/** Add a saved meal from the food selector. */
export async function addMealEntryDirectAction(input: {
  eaten_on: string;
  slot: string;
  meal_id: string;
  portions: number;
}): Promise<ActionState> {
  const parsed = diet.mealEntrySchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? messageFor("invalid") };
  const ctx = await requireExecutionContext();
  return run(() => diet.addMealEntry(ctx, parsed.data), "Aggiunto.");
}

/** Trigger materialization of recurring meals for a date range. */
export async function materializeSchedulesAction(from: string, to: string): Promise<ActionState> {
  const ctx = await requireExecutionContext();
  return run(() => schedules.materializeSchedules(ctx, from, to));
}

/** List recently used foods for the food selector. */
export async function listRecentFoodsAction(): Promise<{ ok: true; foods: import("@/lib/db/types").Food[] } | { ok: false; message: string }> {
  try {
    const ctx = await requireExecutionContext();
    const foods = await diet.listRecentFoods(ctx);
    return { ok: true, foods };
  } catch {
    return { ok: false, message: "Errore nel caricamento." };
  }
}

// Schedules (recurring meals) ----------------------------------------------------------------

export async function createScheduleAction(mealId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(schedules.scheduleSchema, formData);
  if (!parsed.ok) return parsed.state;
  const ctx = await requireExecutionContext();
  return run(() => schedules.createSchedule(ctx, { ...parsed.data, meal_id: id(mealId) }), "Programmato.");
}

export async function deleteScheduleAction(scheduleId: string): Promise<ActionState> {
  const ctx = await requireExecutionContext();
  return run(() => schedules.deleteSchedule(ctx, id(scheduleId)));
}

/** Save a slot's manual entries as a recurring meal on selected weekdays. */
export async function saveSlotAsRecurringAction(input: {
  day: string;
  slotId: string;
  title: string;
  weekdays: number[];
}): Promise<ActionState> {
  const ctx = await requireExecutionContext();
  return attempt(() => schedules.saveSlotAsRecurring(ctx, input), "Salvato e programmato.");
}

// Delete -------------------------------------------------------------------------------------

const DELETE_TARGETS = {
  food_items: "/stanze/cucina/dispensa",
  meals: "/stanze/cucina/pasti",
  recipes: "/stanze/cucina/ricette",
} as const;

export async function deleteKitchenRecordAction(table: keyof typeof DELETE_TARGETS, recordId: string): Promise<ActionState> {
  if (!(table in DELETE_TARGETS)) return { ok: false, message: messageFor("invalid") };
  const ctx = await requireExecutionContext();
  const state = await run(() => deleteRecord(ctx, table, id(recordId)));
  if (state.ok) redirect(DELETE_TARGETS[table]);
  return state;
}

