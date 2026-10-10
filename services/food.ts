import "server-only";

import { z } from "zod";
import { throwIfDbError } from "@/lib/errors";
import type { FoodItem } from "@/lib/db/types";
import type { FoodFacts } from "@/lib/openfoodfacts-parse";
import { FOOD_CATEGORIES, STORAGES, UNITS, type FoodCategory } from "@/lib/food";
import type { ExecutionContext } from "@/lib/households/context";
import { visibilitySchema } from "@/lib/households/permissions";
import {
  decimal,
  optionalCivilDate,
  optionalDecimal,
  optionalText,
  PAGE_SIZE,
  requiredText,
  updateVersioned,
  versionField,
} from "@/services/shared";

const ids = <T extends readonly { id: string }[]>(list: T) => list.map((x) => x.id) as [T[number]["id"], ...T[number]["id"][]];

/** Nutrition per 100 g/ml; all optional (a food can be stored without nutrition data). */
export const nutritionFields = {
  kcal_100g: optionalDecimal("Calorie", { max: 1000, decimals: 2 }),
  protein_100g: optionalDecimal("Proteine", { max: 100 }),
  carbs_100g: optionalDecimal("Carboidrati", { max: 100 }),
  fat_100g: optionalDecimal("Grassi", { max: 100 }),
};

const foodFields = {
  product_name: requiredText(120, "Scrivi il nome dell'alimento."),
  brand: optionalText(80),
  barcode: z
    .string()
    .trim()
    .regex(/^[0-9]{6,14}$/, "Codice a barre non valido (solo cifre).")
    .optional()
    .transform((v) => v ?? null),
  category: z.enum(ids(FOOD_CATEGORIES), { error: "Scegli una categoria." }),
  quantity: decimal("Quantità", { max: 999_999, decimals: 3 }),
  unit: z.enum(ids(UNITS), { error: "Scegli un'unità." }),
  storage: z.enum(ids(STORAGES), { error: "Scegli dove si trova." }),
  purchased_on: optionalCivilDate,
  expires_on: optionalCivilDate,
  /** The date typed is an estimate (nothing printed on the package). */
  expiry_estimated: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
  ...nutritionFields,
  nutrition_source: z.enum(["manual", "openfoodfacts"]).optional(),
  visibility: visibilitySchema,
};

/** Maps the single date field of the form onto explicit/estimated columns (provenance kept). */
function toRow({ expires_on, expiry_estimated, nutrition_source, ...rest }: z.infer<z.ZodObject<typeof foodFields>>) {
  const hasNutrition = rest.kcal_100g !== null;
  return {
    ...rest,
    explicit_expires_on: expiry_estimated ? null : expires_on,
    estimated_expires_on: expiry_estimated ? expires_on : null,
    estimate_basis: expiry_estimated && expires_on ? "Stima dell'utente" : null,
    nutrition_source: hasNutrition ? (nutrition_source ?? "manual") : null,
  };
}

export const foodSchema = z.object(foodFields).transform(toRow);
export const updateFoodSchema = z
  .object({ ...foodFields, version: versionField })
  .transform(({ version, ...rest }) => ({ ...toRow(rest), version }));

export async function createFood(ctx: ExecutionContext, input: z.infer<typeof foodSchema>) {
  const { error } = await ctx.supabase.from("food_items").insert({ household_id: ctx.household.id, ...input });
  throwIfDbError(error);
}

export async function updateFood(ctx: ExecutionContext, id: string, input: z.infer<typeof updateFoodSchema>) {
  const { version, ...patch } = input;
  await updateVersioned(ctx, "food_items", id, version, patch);
}

export const FOOD_STATUSES = ["available", "opened", "consumed", "discarded"] as const;
export type FoodStatusInput = (typeof FOOD_STATUSES)[number];

/** Opened sets the opening day once; consumed/discarded close the item (events by the DB). */
export async function setFoodStatus(ctx: ExecutionContext, id: string, version: number, status: FoodStatusInput, today: string) {
  const patch: Record<string, unknown> = { status };
  if (status === "opened") patch.opened_on = today;
  await updateVersioned(ctx, "food_items", id, version, patch);
}

/** Items still in the house (available or opened), soonest expiry first is applied in the UI. */
export async function listPantry(ctx: ExecutionContext, limit = PAGE_SIZE * 4): Promise<FoodItem[]> {
  const { data, error } = await ctx.supabase
    .from("food_items")
    .select("*")
    .eq("household_id", ctx.household.id)
    .in("status", ["available", "opened"])
    .order("product_name")
    .limit(limit);
  throwIfDbError(error);
  return (data ?? []) as FoodItem[];
}

export async function listRecentlyClosed(ctx: ExecutionContext, limit = 10): Promise<FoodItem[]> {
  const { data, error } = await ctx.supabase
    .from("food_items")
    .select("*")
    .eq("household_id", ctx.household.id)
    .in("status", ["consumed", "discarded"])
    .order("closed_at", { ascending: false })
    .limit(limit);
  throwIfDbError(error);
  return (data ?? []) as FoodItem[];
}

/** Foods with nutrition data, to reuse them in meals and in the diary. */
export async function listFoodsWithNutrition(ctx: ExecutionContext, limit = 100): Promise<FoodItem[]> {
  const { data, error } = await ctx.supabase
    .from("food_items")
    .select("*")
    .eq("household_id", ctx.household.id)
    .not("kcal_100g", "is", null)
    .order("updated_at", { ascending: false })
    .limit(limit);
  throwIfDbError(error);
  const seen = new Set<string>();
  return ((data ?? []) as FoodItem[]).filter((f) => {
    const key = f.product_name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Inventory foods in the shape used by the lookup chips. */
export async function knownFoods(ctx: ExecutionContext): Promise<FoodFacts[]> {
  return (await listFoodsWithNutrition(ctx)).map((f) => ({
    barcode: f.barcode,
    name: f.product_name,
    brand: f.brand,
    kcal_100g: f.kcal_100g === null ? null : Number(f.kcal_100g),
    protein_100g: f.protein_100g === null ? null : Number(f.protein_100g),
    carbs_100g: f.carbs_100g === null ? null : Number(f.carbs_100g),
    fat_100g: f.fat_100g === null ? null : Number(f.fat_100g),
    category: f.category as FoodCategory,
  }));
}
