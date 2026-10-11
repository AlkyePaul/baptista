import "server-only";

import { z } from "zod";
import { throwIfDbError } from "@/lib/errors";
import type { FoodItem } from "@/lib/db/types";
import { STORAGES, UNITS } from "@/lib/food";
import type { ExecutionContext } from "@/lib/households/context";
import { visibilitySchema } from "@/lib/households/permissions";
import { decimal, optionalCivilDate, optionalDecimal, PAGE_SIZE, updateVersioned, versionField } from "@/services/shared";

const ids = <T extends readonly { id: string }[]>(list: T) => list.map((x) => x.id) as [T[number]["id"], ...T[number]["id"][]];

/** Nutrition per 100 g/ml; all optional (a food can live in the catalog without nutrition data). */
export const nutritionFields = {
  kcal_100g: optionalDecimal("Calorie", { max: 1000, decimals: 2 }),
  protein_100g: optionalDecimal("Proteine", { max: 100 }),
  carbs_100g: optionalDecimal("Carboidrati", { max: 100 }),
  fat_100g: optionalDecimal("Grassi", { max: 100 }),
};

/**
 * A pantry item = a catalog food (D31) + what is specific to this package: quantity, place,
 * dates. Name and nutrition come from the catalog and are edited there.
 */
const itemFields = {
  quantity: decimal("Quantità", { max: 999_999, decimals: 3 }),
  unit: z.enum(ids(UNITS), { error: "Scegli un'unità." }),
  storage: z.enum(ids(STORAGES), { error: "Scegli dove si trova." }),
  purchased_on: optionalCivilDate,
  expires_on: optionalCivilDate,
  /** The date typed is an estimate (nothing printed on the package). */
  expiry_estimated: z.preprocess((v) => v === "on" || v === "true", z.boolean()),
  visibility: visibilitySchema.default("household"),
};

function toRow({ expires_on, expiry_estimated, ...rest }: z.infer<z.ZodObject<typeof itemFields>>) {
  return {
    ...rest,
    explicit_expires_on: expiry_estimated ? null : expires_on,
    estimated_expires_on: expiry_estimated ? expires_on : null,
    estimate_basis: expiry_estimated && expires_on ? "Stima dell'utente" : null,
  };
}

export const pantryItemSchema = z.object(itemFields).transform(toRow);
export const updatePantryItemSchema = z
  .object({ ...itemFields, version: versionField })
  .transform(({ version, ...rest }) => ({ ...toRow(rest), version }));

export async function createPantryItem(ctx: ExecutionContext, foodId: string, input: z.infer<typeof pantryItemSchema>) {
  const { error } = await ctx.supabase.from("food_items").insert({ household_id: ctx.household.id, food_id: foodId, ...input });
  throwIfDbError(error);
}

export async function updatePantryItem(ctx: ExecutionContext, id: string, input: z.infer<typeof updatePantryItemSchema>) {
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

/** Items still in the house (available or opened). */
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
