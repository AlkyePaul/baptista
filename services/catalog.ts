import "server-only";

import { z } from "zod";
import type { Food } from "@/lib/db/types";
import { DomainError, throwIfDbError } from "@/lib/errors";
import { FOOD_CATEGORIES, STORAGES } from "@/lib/food";
import type { ExecutionContext } from "@/lib/households/context";
import type { FoodFacts } from "@/lib/openfoodfacts-parse";
import { nameKey, storageFor } from "@/lib/shopping";
import { nutritionFields } from "@/services/food";
import { optionalDecimal, optionalText, requiredText, versionField } from "@/services/shared";

/**
 * Household food catalog (D31): every food in the pantry, on the list, in a recipe or a meal is
 * one of these. Shared by the household; nutrition lives here only.
 */

const ids = <T extends readonly { id: string }[]>(list: T) => list.map((x) => x.id) as [T[number]["id"], ...T[number]["id"][]];

const numberOrNull = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export function normaliseFood(row: Record<string, unknown>): Food {
  return {
    ...(row as Food),
    kcal_100g: numberOrNull(row.kcal_100g),
    protein_100g: numberOrNull(row.protein_100g),
    carbs_100g: numberOrNull(row.carbs_100g),
    fat_100g: numberOrNull(row.fat_100g),
    portion_weight_g: numberOrNull(row.portion_weight_g),
  };
}

export const FOOD_SELECT = "id, household_id, name, brand, barcode, category, default_storage, kcal_100g, protein_100g, carbs_100g, fat_100g, nutrition_source, staple, portion_label, portion_weight_g, version, created_at";

const foodFields = {
  name: requiredText(120, "Scrivi il nome dell'alimento."),
  brand: optionalText(80),
  barcode: z
    .string()
    .trim()
    .regex(/^[0-9]{6,14}$/, "Codice a barre non valido (solo cifre).")
    .optional()
    .transform((v) => v ?? null),
  category: z.enum(ids(FOOD_CATEGORIES), { error: "Scegli una categoria." }),
  default_storage: z.enum(ids(STORAGES)).optional(),
  ...nutritionFields,
  portion_label: optionalText(80),
  portion_weight_g: optionalDecimal("Peso porzione", { min: 0.1, max: 5000, decimals: 1 }),
};

/** «Nuovo alimento»: typed by hand (nutrition optional). */
export const newFoodSchema = z.object(foodFields).transform((f) => ({ ...f, default_storage: f.default_storage ?? storageFor(f.category) }));
export const updateFoodSchema = z.object({ ...foodFields, version: versionField }).transform((f) => ({ ...f, default_storage: f.default_storage ?? storageFor(f.category) }));

export async function getFood(ctx: ExecutionContext, id: string): Promise<Food | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const { data, error } = await ctx.supabase.from("foods").select(FOOD_SELECT).eq("id", id).eq("household_id", ctx.household.id).maybeSingle();
  throwIfDbError(error);
  return data ? normaliseFood(data) : null;
}

export async function listCatalog(ctx: ExecutionContext, limit = 500): Promise<Food[]> {
  const { data, error } = await ctx.supabase.from("foods").select(FOOD_SELECT).eq("household_id", ctx.household.id).order("name").limit(limit);
  throwIfDbError(error);
  return (data ?? []).map(normaliseFood);
}

/** Catalog search: barcode exact, else every word of the query in the name or brand. */
export async function searchCatalog(ctx: ExecutionContext, query: string, limit = 12): Promise<Food[]> {
  const q = query.trim();
  if (/^[0-9]{6,14}$/.test(q)) {
    const { data, error } = await ctx.supabase.from("foods").select(FOOD_SELECT).eq("household_id", ctx.household.id).eq("barcode", q).limit(1);
    throwIfDbError(error);
    return (data ?? []).map(normaliseFood);
  }
  const words = nameKey(q).split(" ").filter((w) => w.length >= 2).slice(0, 4);
  let request = ctx.supabase.from("foods").select(FOOD_SELECT).eq("household_id", ctx.household.id);
  for (const w of words) request = request.ilike("name_key", `%${w.replace(/[%_\\]/g, "")}%`);
  const { data, error } = await request.order("name").limit(limit);
  throwIfDbError(error);
  return (data ?? []).map(normaliseFood);
}

type EnsureInput = {
  name: string;
  brand?: string | null;
  barcode?: string | null;
  category?: string | null;
  default_storage?: string | null;
  kcal_100g?: number | null;
  protein_100g?: number | null;
  carbs_100g?: number | null;
  fat_100g?: number | null;
  nutrition_source?: "manual" | "openfoodfacts" | null;
  portion_label?: string | null;
  portion_weight_g?: number | null;
};

/** Find by barcode, else by name + brand, else create (database procedure, RLS applies). */
export async function ensureFood(ctx: ExecutionContext, input: EnsureInput): Promise<string> {
  const { data, error } = await ctx.supabase.rpc("ensure_food", {
    p_household_id: ctx.household.id,
    p_name: input.name.trim().slice(0, 120),
    p_brand: input.brand ?? null,
    p_barcode: input.barcode ?? null,
    p_category: input.category ?? null,
    p_storage: input.default_storage ?? null,
    p_kcal: input.kcal_100g ?? null,
    p_protein: input.protein_100g ?? null,
    p_carbs: input.carbs_100g ?? null,
    p_fat: input.fat_100g ?? null,
    p_source: input.nutrition_source ?? null,
    p_portion_label: input.portion_label ?? null,
    p_portion_weight_g: input.portion_weight_g ?? null,
  });
  throwIfDbError(error);
  if (!data) throw new DomainError("unknown");
  return data as string;
}

/** A product chosen on Open Food Facts enters the household catalog (or is found there). */
export function ensureFromFacts(ctx: ExecutionContext, facts: FoodFacts) {
  return ensureFood(ctx, {
    name: facts.name,
    brand: facts.brand,
    barcode: facts.barcode,
    category: facts.category,
    kcal_100g: facts.kcal_100g,
    protein_100g: facts.protein_100g,
    carbs_100g: facts.carbs_100g,
    fat_100g: facts.fat_100g,
    nutrition_source: facts.kcal_100g === null ? null : "openfoodfacts",
  });
}

export async function updateFood(ctx: ExecutionContext, id: string, input: z.infer<typeof updateFoodSchema>) {
  const { version, ...patch } = input;
  const { data, error } = await ctx.supabase
    .from("foods")
    .update({ ...patch, nutrition_source: patch.kcal_100g === null ? null : "manual" })
    .eq("id", id)
    .eq("household_id", ctx.household.id)
    .eq("version", version)
    .select("id");
  throwIfDbError(error);
  if (!data?.length) throw new DomainError("conflict");
}

/** Only foods never used (pantry history, list, recipes, meals) can be deleted. */
export async function deleteFood(ctx: ExecutionContext, id: string) {
  const { data, error } = await ctx.supabase.from("foods").delete().eq("id", id).eq("household_id", ctx.household.id).select("id");
  if (error?.code === "23503") throw new DomainError("in_use");
  throwIfDbError(error);
  if (!data?.length) throw new DomainError("not_found");
}

/** C8 «Abituale» (true) or «No, non chiederlo più» (false). */
export async function setStaple(ctx: ExecutionContext, id: string, staple: boolean) {
  const { error } = await ctx.supabase.from("foods").update({ staple }).eq("id", id).eq("household_id", ctx.household.id);
  throwIfDbError(error);
}

/** Ids of the foods marked «Abituale». */
export async function listStapleIds(ctx: ExecutionContext): Promise<string[]> {
  const { data, error } = await ctx.supabase.from("foods").select("id").eq("household_id", ctx.household.id).eq("staple", true).limit(500);
  throwIfDbError(error);
  return ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
}
