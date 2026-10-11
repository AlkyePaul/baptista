import "server-only";

import { z } from "zod";
import { RECIPE_UNITS, type Recipe, type RecipeIngredient } from "@/lib/db/types";
import { DomainError, throwIfDbError } from "@/lib/errors";
import type { ExecutionContext } from "@/lib/households/context";
import { visibilitySchema } from "@/lib/households/permissions";
import { FOOD_SELECT, normaliseFood } from "@/services/catalog";
import { getRecord, optionalDecimal, optionalText, PAGE_SIZE, requiredText, updateVersioned, versionField } from "@/services/shared";

/**
 * Family cookbook (D31): a recipe is a note with catalog ingredients (quantities optional) and a
 * free-text preparation. Exact grams belong to meals (calorie counting), not to recipes.
 */

export const recipeSchema = z.object({
  title: requiredText(120, "Dai un nome alla ricetta."),
  servings: z.coerce.number().int().min(1, "Almeno 1 porzione.").max(50, "Al massimo 50 porzioni.").optional().transform((v) => v ?? null),
  body: optionalText(20000),
  visibility: visibilitySchema,
});
export const updateRecipeSchema = recipeSchema.extend({ version: versionField });

export const ingredientSchema = z
  .object({
    food_id: z.uuid({ error: "Scegli un alimento." }),
    amount: optionalDecimal("Quantità", { max: 100_000, decimals: 2, exclusiveMin: true }),
    unit: z.enum(RECIPE_UNITS).optional().transform((v) => v ?? null),
  })
  .superRefine((v, ctx) => {
    if (v.unit && v.unit !== "qb" && v.amount === null) ctx.addIssue({ code: "custom", path: ["amount"], message: "Indica la quantità o togli l'unità." });
  })
  .transform((v) => ({ ...v, unit: v.amount !== null && v.unit === null ? ("pz" as const) : v.unit }));

export async function createRecipe(ctx: ExecutionContext, input: z.infer<typeof recipeSchema>): Promise<string> {
  const { data, error } = await ctx.supabase.from("recipes").insert({ household_id: ctx.household.id, ...input }).select("id").single();
  throwIfDbError(error);
  return (data as { id: string }).id;
}

export async function updateRecipe(ctx: ExecutionContext, id: string, input: z.infer<typeof updateRecipeSchema>) {
  const { version, ...patch } = input;
  await updateVersioned(ctx, "recipes", id, version, patch);
}

export async function listRecipes(ctx: ExecutionContext, limit = PAGE_SIZE * 2): Promise<Array<Recipe & { ingredients: number }>> {
  const { data, error } = await ctx.supabase
    .from("recipes")
    .select("*, recipe_ingredients(count)")
    .eq("household_id", ctx.household.id)
    .order("title")
    .limit(limit);
  throwIfDbError(error);
  return ((data ?? []) as Array<Recipe & { recipe_ingredients: Array<{ count: number }> }>).map(({ recipe_ingredients, ...r }) => ({
    ...r,
    ingredients: recipe_ingredients?.[0]?.count ?? 0,
  }));
}

export async function getRecipe(ctx: ExecutionContext, id: string): Promise<Recipe | null> {
  return getRecord<Recipe>(ctx, "recipes", id);
}

export async function listIngredients(ctx: ExecutionContext, recipeId: string): Promise<RecipeIngredient[]> {
  const { data, error } = await ctx.supabase
    .from("recipe_ingredients")
    .select(`id, recipe_id, food_id, amount, unit, position, food:foods(${FOOD_SELECT})`)
    .eq("recipe_id", recipeId)
    .order("position")
    .order("created_at");
  throwIfDbError(error);
  return ((data ?? []) as unknown as Array<RecipeIngredient & { food: Record<string, unknown> }>).map((i) => ({
    ...i,
    amount: i.amount === null ? null : Number(i.amount),
    food: normaliseFood(i.food),
  }));
}

export async function addIngredient(ctx: ExecutionContext, recipeId: string, input: z.infer<typeof ingredientSchema>) {
  const recipe = await getRecipe(ctx, recipeId);
  if (!recipe) throw new DomainError("not_found");
  const { count } = await ctx.supabase.from("recipe_ingredients").select("id", { count: "exact", head: true }).eq("recipe_id", recipeId);
  const { error } = await ctx.supabase
    .from("recipe_ingredients")
    .insert({ household_id: ctx.household.id, recipe_id: recipeId, position: (count ?? 0) + 1, ...input });
  if (error?.code === "23505") throw new DomainError("duplicate", "È già tra gli ingredienti.");
  throwIfDbError(error);
}

export async function removeIngredient(ctx: ExecutionContext, ingredientId: string) {
  const { data, error } = await ctx.supabase.from("recipe_ingredients").delete().eq("id", ingredientId).eq("household_id", ctx.household.id).select("id");
  throwIfDbError(error);
  if (!data?.length) throw new DomainError("not_found");
}

/** «Aggiungi al pasto»: ingredients join the meal; weights become grams, the rest 0 g. */
export async function addRecipeToMeal(ctx: ExecutionContext, recipeId: string, mealId: string): Promise<number> {
  const { data, error } = await ctx.supabase.rpc("add_recipe_to_meal", { p_recipe_id: recipeId, p_meal_id: mealId });
  throwIfDbError(error);
  return Number(data ?? 0);
}
