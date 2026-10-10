import "server-only";

import { z } from "zod";
import type { FoodItem, PantryStaple, ShoppingItem } from "@/lib/db/types";
import { DomainError, throwIfDbError } from "@/lib/errors";
import { effectiveExpiry, FOOD_CATEGORIES, label, STORAGES, UNITS } from "@/lib/food";
import { formatItalianNumber } from "@/lib/goals";
import type { ExecutionContext } from "@/lib/households/context";
import { visibilitySchema } from "@/lib/households/permissions";
import { pantryMatch, storageFor } from "@/lib/shopping";
import { nutritionFields } from "@/services/food";
import { civilDate, decimal, optionalDecimal, optionalText, requiredText, updateVersioned } from "@/services/shared";

/** Lista della spesa (Phase 04.1, A-1): one shared list per household, Alimenti → Dispensa and Altro. */

const ids = <T extends readonly { id: string }[]>(list: T) => list.map((x) => x.id) as [T[number]["id"], ...T[number]["id"][]];

export const addShoppingSchema = z
  .object({
    kind: z.enum(["food", "other"]),
    name: requiredText(120, "Scrivi cosa comprare."),
    quantity: optionalDecimal("Quantità", { max: 999_999, decimals: 3, exclusiveMin: true }),
    unit: z.enum(ids(UNITS)).optional().transform((v) => v ?? null),
    brand: optionalText(80),
    barcode: z
      .string()
      .trim()
      .regex(/^[0-9]{6,14}$/, "Codice a barre non valido (solo cifre).")
      .optional()
      .transform((v) => v ?? null),
    category: z.enum(ids(FOOD_CATEGORIES)).optional().transform((v) => v ?? null),
    storage: z.enum(ids(STORAGES)).optional().transform((v) => v ?? null),
    ...nutritionFields,
  })
  .transform((v) =>
    v.kind === "other"
      ? { ...v, brand: null, barcode: null, category: null, storage: null, kcal_100g: null, protein_100g: null, carbs_100g: null, fat_100g: null }
      : { ...v, storage: v.storage ?? storageFor(v.category) },
  );

export type AddShoppingInput = z.infer<typeof addShoppingSchema>;

export async function listShopping(ctx: ExecutionContext): Promise<ShoppingItem[]> {
  const { data, error } = await ctx.supabase
    .from("shopping_items")
    .select("*")
    .eq("household_id", ctx.household.id)
    .eq("status", "open")
    .order("sort_order")
    .order("created_at")
    .limit(400);
  throwIfDbError(error);
  return (data ?? []) as ShoppingItem[];
}

export async function addShoppingItem(ctx: ExecutionContext, input: AddShoppingInput): Promise<string> {
  const { data, error } = await ctx.supabase.rpc("add_shopping_item", {
    p_household_id: ctx.household.id,
    p_kind: input.kind,
    p_name: input.name,
    p_quantity: input.quantity,
    p_unit: input.unit,
    p_barcode: input.barcode,
    p_brand: input.brand,
    p_category: input.category,
    p_storage: input.storage,
    p_kcal: input.kcal_100g,
    p_protein: input.protein_100g,
    p_carbs: input.carbs_100g,
    p_fat: input.fat_100g,
  });
  throwIfDbError(error);
  return data as string;
}

/** Many foods at once (recipe ingredients C3, missing staples C8); duplicates merge in the DB. */
export async function addFoods(ctx: ExecutionContext, foods: Array<{ name: string; barcode?: string | null }>) {
  for (const food of foods.slice(0, 100)) {
    await addShoppingItem(ctx, {
      kind: "food",
      name: food.name.slice(0, 120),
      quantity: null,
      unit: null,
      brand: null,
      barcode: food.barcode ?? null,
      category: null,
      storage: "pantry",
      kcal_100g: null,
      protein_100g: null,
      carbs_100g: null,
      fat_100g: null,
    });
  }
}

export type StockResult = { batch_id: string | null; items: Array<{ id: string; food_item_id: string; name: string; storage: string }> };

/** Bought: food rows become pantry items in one transaction (bulk = «Tutto in dispensa»). */
export async function stockItems(ctx: ExecutionContext, itemIds: string[], bulk: boolean): Promise<StockResult> {
  const { data, error } = await ctx.supabase.rpc("stock_shopping_items", {
    p_household_id: ctx.household.id,
    p_ids: itemIds,
    p_bulk: bulk,
  });
  throwIfDbError(error);
  return data as StockResult;
}

/** Undo of a stocking: refused (conflict) when any created food changed since. */
export async function unstockItems(ctx: ExecutionContext, itemIds: string[]) {
  const { error } = await ctx.supabase.rpc("unstock_shopping_items", { p_household_id: ctx.household.id, p_ids: itemIds });
  throwIfDbError(error);
}

async function getItem(ctx: ExecutionContext, id: string): Promise<ShoppingItem> {
  const { data, error } = await ctx.supabase.from("shopping_items").select("*").eq("id", id).eq("household_id", ctx.household.id).maybeSingle();
  throwIfDbError(error);
  if (!data) throw new DomainError("not_found");
  return data as ShoppingItem;
}

/** Tick: a food is bought and goes to the pantry; an «Altro» row is simply done. */
export async function tickItem(ctx: ExecutionContext, id: string, version: number): Promise<StockResult | null> {
  const item = await getItem(ctx, id);
  if (item.version !== version) throw new DomainError("conflict");
  if (item.kind === "food") return stockItems(ctx, [id], false);
  await setItemStatus(ctx, id, version, "done");
  return null;
}

export async function setItemStatus(ctx: ExecutionContext, id: string, version: number, status: "open" | "done" | "removed") {
  const { data, error } = await ctx.supabase
    .from("shopping_items")
    .update({ status })
    .eq("id", id)
    .eq("household_id", ctx.household.id)
    .eq("version", version)
    .select("id");
  throwIfDbError(error);
  if (!data?.length) throw new DomainError("conflict");
}

export async function setItemStorage(ctx: ExecutionContext, id: string, version: number, storage: string) {
  if (!STORAGES.some((s) => s.id === storage)) throw new DomainError("invalid");
  const { data, error } = await ctx.supabase
    .from("shopping_items")
    .update({ storage })
    .eq("id", id)
    .eq("household_id", ctx.household.id)
    .eq("version", version)
    .eq("kind", "food")
    .select("id");
  throwIfDbError(error);
  if (!data?.length) throw new DomainError("conflict");
}

// Staples (C8) ---------------------------------------------------------------------------------

export async function listStaples(ctx: ExecutionContext): Promise<PantryStaple[]> {
  const { data, error } = await ctx.supabase.from("pantry_staples").select("id, name, name_key, barcode, status").eq("household_id", ctx.household.id).order("name");
  throwIfDbError(error);
  return (data ?? []) as PantryStaple[];
}

/** Star or «No, non chiederlo più»: one row per product name, the latest answer wins. */
export async function setStaple(ctx: ExecutionContext, name: string, barcode: string | null, status: "staple" | "declined") {
  const { error } = await ctx.supabase.rpc("set_pantry_staple", {
    p_household_id: ctx.household.id,
    p_name: name.trim().slice(0, 120),
    p_barcode: barcode,
    p_status: status,
  });
  throwIfDbError(error);
}

export async function removeStaple(ctx: ExecutionContext, id: string) {
  const { error } = await ctx.supabase.from("pantry_staples").delete().eq("id", id).eq("household_id", ctx.household.id);
  throwIfDbError(error);
}

// C1: the shopping as an expense --------------------------------------------------------------

export const shoppingExpenseSchema = z.object({
  total: decimal("Totale", { max: 999_999_999, exclusiveMin: true }),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Valuta non valida.").default("EUR"),
  occurred_on: civilDate(),
  merchant: optionalText(120),
  visibility: visibilitySchema,
});

export async function registerShoppingExpense(
  ctx: ExecutionContext,
  batchId: string,
  input: z.infer<typeof shoppingExpenseSchema>,
  lines: Record<string, number> = {},
) {
  const { data, error } = await ctx.supabase.rpc("register_shopping_expense", {
    p_household_id: ctx.household.id,
    p_batch_id: batchId,
    p_total: input.total,
    p_currency: input.currency,
    p_occurred_on: input.occurred_on,
    p_merchant: input.merchant,
    p_visibility: input.visibility,
    p_lines: lines,
  });
  throwIfDbError(error);
  return data as string;
}

/** «Aggiungi scadenze» after a bulk stocking: explicit dates printed on the packages. */
export async function setExpiries(ctx: ExecutionContext, dates: Array<{ id: string; version: number; date: string }>) {
  for (const d of dates.slice(0, 200)) {
    await updateVersioned(ctx, "food_items", d.id, d.version, { explicit_expires_on: d.date });
  }
}

// View ---------------------------------------------------------------------------------------

export type ShoppingView = { items: ShoppingItem[]; inPantry: Record<string, string>; staples: string[] };

const shortDate = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

/** Open rows plus, for food rows, what is already in the house (computed on read, never stored). */
export async function shoppingView(ctx: ExecutionContext, pantry: FoodItem[]): Promise<ShoppingView> {
  const [items, staples] = await Promise.all([listShopping(ctx), listStaples(ctx)]);
  const inPantry: Record<string, string> = {};
  for (const item of items) {
    if (item.kind !== "food") continue;
    const match = pantryMatch(item, pantry);
    if (!match) continue;
    const expiry = effectiveExpiry(match);
    inPantry[item.id] = [
      `${formatItalianNumber(Number(match.quantity))} ${label(UNITS, match.unit)}`,
      label(STORAGES, match.storage),
      expiry ? `${expiry.estimated ? "stima " : "scade "}${shortDate(expiry.date)}` : null,
    ]
      .filter(Boolean)
      .join(" · ");
  }
  return { items, inPantry, staples: staples.filter((s) => s.status === "staple").map((s) => s.name_key) };
}
