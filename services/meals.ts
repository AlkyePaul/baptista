import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { DomainError, throwIfDbError } from "@/lib/errors";
import type { Meal } from "@/lib/db/types";
import type { ExecutionContext } from "@/lib/households/context";
import { visibilitySchema } from "@/lib/households/permissions";
import type { MealItem } from "@/lib/nutrition";
import { nutritionFields } from "@/services/food";
import { decimal, getRecord, optionalText, PAGE_SIZE, requiredText, updateVersioned, versionField } from "@/services/shared";

export const MAX_MEAL_ITEMS = 50;

export const mealSchema = z.object({
  title: requiredText(120, "Dai un nome al pasto."),
  notes: optionalText(2000),
  visibility: visibilitySchema,
});

export const updateMealSchema = mealSchema.extend({ version: versionField });

/** One food of a meal: grams plus nutrition per 100 g (calories required to count). */
export const mealItemSchema = z
  .object({
    name: requiredText(120, "Scrivi l'alimento."),
    grams: decimal("Grammi", { min: 0, exclusiveMin: true, max: 5000, decimals: 1 }),
    ...nutritionFields,
    barcode: z.string().regex(/^[0-9]{6,14}$/).optional().transform((v) => v ?? null),
    version: versionField,
  })
  .superRefine((v, ctx) => {
    if (v.kcal_100g === null) ctx.addIssue({ code: "custom", path: ["kcal_100g"], message: "Indica le calorie per 100 g." });
  });

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

/** Item mutations rewrite `items` with the version the user saw (no lost updates). */
async function mutateItems(ctx: ExecutionContext, id: string, version: number, change: (items: MealItem[]) => MealItem[]) {
  const meal = await getRecord<Meal>(ctx, "meals", id);
  if (!meal) throw new DomainError("not_found");
  if (meal.version !== version) throw new DomainError("conflict");
  await updateVersioned(ctx, "meals", id, version, { items: change(meal.items) });
}

export async function addMealItem(ctx: ExecutionContext, id: string, input: z.infer<typeof mealItemSchema>) {
  const { version, kcal_100g, ...rest } = input;
  await mutateItems(ctx, id, version, (items) => {
    if (items.length >= MAX_MEAL_ITEMS) throw new DomainError("limit_reached");
    return [...items, { id: randomUUID(), ...rest, kcal_100g: kcal_100g ?? 0 }];
  });
}

export async function removeMealItem(ctx: ExecutionContext, id: string, version: number, itemId: string) {
  await mutateItems(ctx, id, version, (items) => items.filter((i) => i.id !== itemId));
}
