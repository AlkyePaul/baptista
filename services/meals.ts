import "server-only";

import { z } from "zod";
import { DomainError, throwIfDbError } from "@/lib/errors";
import type { Meal, MealItem } from "@/lib/db/types";
import type { ExecutionContext } from "@/lib/households/context";
import { visibilitySchema } from "@/lib/households/permissions";
import { FOOD_SELECT, normaliseFood } from "@/services/catalog";
import { decimal, optionalText, PAGE_SIZE, requiredText, updateVersioned, versionField } from "@/services/shared";

/** Meals (D31): catalog foods with grams, for calories and macros. 0 g is fine (garlic). */

export const MAX_MEAL_ITEMS = 50;

export const mealSchema = z.object({
  title: requiredText(120, "Dai un nome al pasto."),
  notes: optionalText(2000),
  visibility: visibilitySchema,
});

export const updateMealSchema = mealSchema.extend({ version: versionField });

export const mealItemSchema = z.object({
  food_id: z.uuid({ error: "Scegli un alimento." }),
  grams: decimal("Grammi", { min: 0, max: 5000, decimals: 1 }).optional().transform((v) => v ?? 0),
});

export const gramsSchema = z.object({ grams: decimal("Grammi", { min: 0, max: 5000, decimals: 1 }) });

export async function createMeal(ctx: ExecutionContext, input: z.infer<typeof mealSchema>) {
  const { data, error } = await ctx.supabase
    .from("meals")
    .insert({ household_id: ctx.household.id, ...input })
    .select("id")
    .single();
  throwIfDbError(error);
  return (data as { id: string }).id;
}

export async function updateMeal(ctx: ExecutionContext, id: string, input: z.infer<typeof updateMealSchema>) {
  const { version, ...patch } = input;
  await updateVersioned(ctx, "meals", id, version, patch);
}

export async function listMeals(ctx: ExecutionContext, limit = PAGE_SIZE): Promise<Meal[]> {
  const { data, error } = await ctx.supabase
    .from("meals")
    .select("*")
    .eq("household_id", ctx.household.id)
    .order("updated_at", { ascending: false })
    .limit(limit);
  throwIfDbError(error);
  return (data ?? []) as Meal[];
}

/** Items of one or more meals with their catalog food (nutrition read live). */
export async function listMealItems(ctx: ExecutionContext, mealIds: string[]): Promise<MealItem[]> {
  if (!mealIds.length) return [];
  const { data, error } = await ctx.supabase
    .from("meal_items")
    .select(`id, meal_id, food_id, grams, position, food:foods(${FOOD_SELECT})`)
    .in("meal_id", mealIds)
    .order("position")
    .order("created_at");
  throwIfDbError(error);
  return ((data ?? []) as unknown as Array<MealItem & { food: Record<string, unknown> }>).map((i) => ({
    ...i,
    grams: Number(i.grams),
    food: normaliseFood(i.food),
  }));
}

export async function addMealItem(ctx: ExecutionContext, mealId: string, input: z.infer<typeof mealItemSchema>) {
  const items = await listMealItems(ctx, [mealId]);
  if (items.length >= MAX_MEAL_ITEMS) throw new DomainError("limit_reached");
  const { error } = await ctx.supabase.from("meal_items").insert({
    household_id: ctx.household.id,
    meal_id: mealId,
    food_id: input.food_id,
    grams: input.grams,
    position: (items.at(-1)?.position ?? 0) + 1,
  });
  throwIfDbError(error);
}

export async function setMealItemGrams(ctx: ExecutionContext, itemId: string, grams: number) {
  const { data, error } = await ctx.supabase.from("meal_items").update({ grams }).eq("id", itemId).eq("household_id", ctx.household.id).select("id");
  throwIfDbError(error);
  if (!data?.length) throw new DomainError("not_found");
}

export async function removeMealItem(ctx: ExecutionContext, itemId: string) {
  const { data, error } = await ctx.supabase.from("meal_items").delete().eq("id", itemId).eq("household_id", ctx.household.id).select("id");
  throwIfDbError(error);
  if (!data?.length) throw new DomainError("not_found");
}
