"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { run } from "@/lib/actions";
import { localDate } from "@/lib/dates";
import { messageFor, toActionState, type ActionState } from "@/lib/errors";
import { getUserContext, requireExecutionContext } from "@/lib/households/context";
import { uuidSchema } from "@/lib/households/permissions";
import { lookupBarcode, searchByName, type FoodFacts } from "@/lib/openfoodfacts";
import * as diet from "@/services/diet";
import * as food from "@/services/food";
import * as meals from "@/services/meals";
import * as notes from "@/services/notes";
import { deleteRecord, parseForm } from "@/services/shared";

const id = (value: string) => uuidSchema.parse(value);
const version = (value: number) => z.number().int().positive().parse(value);

// Inventory ----------------------------------------------------------------------------------

export async function createFoodAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(food.foodSchema, formData);
  if (!parsed.ok) return parsed.state;
  const ctx = await requireExecutionContext();
  return run(() => food.createFood(ctx, parsed.data), "Aggiunto alla dispensa.");
}

export async function updateFoodAction(foodId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(food.updateFoodSchema, formData);
  if (!parsed.ok) return parsed.state;
  const ctx = await requireExecutionContext();
  const state = await run(() => food.updateFood(ctx, id(foodId), parsed.data));
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

// Open Food Facts ----------------------------------------------------------------------------

export type LookupResult = { ok: true; results: FoodFacts[] } | { ok: false; message: string };

const lookupQuery = z.string().trim().min(2, "Scrivi almeno 2 caratteri.").max(80, "Ricerca troppo lunga.");

/** Authenticated lookup by barcode (digits only) or by name. Only the query leaves the server. */
export async function lookupFoodAction(query: string): Promise<LookupResult> {
  const parsed = lookupQuery.safeParse(query);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? messageFor("invalid") };
  await requireExecutionContext();
  try {
    const q = parsed.data;
    const results = /^[0-9]{6,14}$/.test(q) ? await lookupBarcode(q) : await searchByName(q);
    return { ok: true, results };
  } catch (error) {
    return { ok: false, message: toActionState(error).message ?? messageFor("unknown") };
  }
}

// Recipes (notes of kind "recipe") -----------------------------------------------------------

export async function createRecipeAction(_: ActionState, formData: FormData): Promise<ActionState> {
  formData.set("kind", "recipe");
  const parsed = parseForm(notes.noteSchema, formData);
  if (!parsed.ok) return parsed.state;
  const ctx = await requireExecutionContext();
  let recipeId = "";
  const state = await run(async () => {
    recipeId = await notes.createNote(ctx, parsed.data);
  });
  if (state.ok) redirect(`/stanze/cucina/ricette/${recipeId}`);
  return state;
}

export async function updateRecipeAction(recipeId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(notes.updateNoteSchema, formData);
  if (!parsed.ok) return parsed.state;
  const ctx = await requireExecutionContext();
  return run(() => notes.updateNote(ctx, id(recipeId), parsed.data), "Salvato.");
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

export async function addMealItemAction(mealId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(meals.mealItemSchema, formData);
  if (!parsed.ok) return parsed.state;
  const ctx = await requireExecutionContext();
  return run(() => meals.addMealItem(ctx, id(mealId), parsed.data));
}

export async function removeMealItemAction(mealId: string, mealVersion: number, itemId: string): Promise<ActionState> {
  const ctx = await requireExecutionContext();
  return run(() => meals.removeMealItem(ctx, id(mealId), version(mealVersion), id(itemId)));
}

// Diary --------------------------------------------------------------------------------------

export async function addQuickEntryAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(diet.quickEntrySchema, formData);
  if (!parsed.ok) return parsed.state;
  const ctx = await requireExecutionContext();
  return run(() => diet.addQuickEntry(ctx, parsed.data), "Aggiunto al diario.");
}

export async function addFoodEntryAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(diet.foodEntrySchema, formData);
  if (!parsed.ok) return parsed.state;
  const ctx = await requireExecutionContext();
  return run(() => diet.addFoodEntry(ctx, parsed.data), "Aggiunto al diario.");
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
  return run(() => deleteRecord(ctx, "diet_entries", id(entryId)));
}

// Delete -------------------------------------------------------------------------------------

const DELETE_TARGETS = {
  food_items: "/stanze/cucina/dispensa",
  meals: "/stanze/cucina/aggiungi?tipo=pasto",
  notes: "/stanze/cucina/aggiungi?tipo=ricetta",
} as const;

export async function deleteKitchenRecordAction(table: keyof typeof DELETE_TARGETS, recordId: string): Promise<ActionState> {
  if (!(table in DELETE_TARGETS)) return { ok: false, message: messageFor("invalid") };
  const ctx = await requireExecutionContext();
  const state = await run(() => deleteRecord(ctx, table, id(recordId)));
  if (state.ok) redirect(DELETE_TARGETS[table]);
  return state;
}
