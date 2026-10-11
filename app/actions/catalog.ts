"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { run } from "@/lib/actions";
import type { Food } from "@/lib/db/types";
import { messageFor, toActionState, type ActionState } from "@/lib/errors";
import { FOOD_CATEGORIES } from "@/lib/food";
import { requireExecutionContext } from "@/lib/households/context";
import { uuidSchema } from "@/lib/households/permissions";
import { lookupBarcode, searchByName, type FoodFacts } from "@/lib/openfoodfacts";
import * as catalog from "@/services/catalog";
import { parseForm } from "@/services/shared";

const id = (value: string) => uuidSchema.parse(value);

export type CatalogSearch = { ok: true; foods: Food[] } | { ok: false; message: string };
export type OffSearch = { ok: true; results: FoodFacts[] } | { ok: false; message: string };
export type FoodResult = { ok: true; food: Food } | { ok: false; message: string; fieldErrors?: Record<string, string> };

const query = z.string().trim().min(2, "Scrivi almeno 2 caratteri.").max(80, "Ricerca troppo lunga.");

/** The household catalog first: it is what the family already uses. */
export async function searchCatalogAction(q: string): Promise<CatalogSearch> {
  const parsed = query.safeParse(q);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? messageFor("invalid") };
  const ctx = await requireExecutionContext();
  try {
    return { ok: true, foods: await catalog.searchCatalog(ctx, parsed.data) };
  } catch (error) {
    return { ok: false, message: toActionState(error).message ?? messageFor("unknown") };
  }
}

/** Open Food Facts by barcode or name. Only the query leaves the server. */
export async function searchOffAction(q: string): Promise<OffSearch> {
  const parsed = query.safeParse(q);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? messageFor("invalid") };
  await requireExecutionContext();
  try {
    const v = parsed.data;
    return { ok: true, results: /^[0-9]{6,14}$/.test(v) ? await lookupBarcode(v) : await searchByName(v) };
  } catch (error) {
    return { ok: false, message: toActionState(error).message ?? messageFor("unknown") };
  }
}

// Data coming back from the browser is re-validated: never trusted because it came from OFF.
const factsSchema = z.object({
  barcode: z.string().regex(/^[0-9]{6,14}$/).nullable(),
  name: z.string().trim().min(1).max(120),
  brand: z.string().trim().max(80).nullable(),
  kcal_100g: z.number().min(0).max(1000).nullable(),
  protein_100g: z.number().min(0).max(100).nullable(),
  carbs_100g: z.number().min(0).max(100).nullable(),
  fat_100g: z.number().min(0).max(100).nullable(),
  category: z.enum(FOOD_CATEGORIES.map((c) => c.id) as [string, ...string[]]).nullable(),
});

async function loaded(ctx: Awaited<ReturnType<typeof requireExecutionContext>>, foodId: string): Promise<FoodResult> {
  const food = await catalog.getFood(ctx, foodId);
  return food ? { ok: true, food } : { ok: false, message: messageFor("not_found") };
}

/** A product picked on Open Food Facts joins the household catalog (or is found there). */
export async function pickOffFoodAction(facts: FoodFacts): Promise<FoodResult> {
  const parsed = factsSchema.safeParse(facts);
  if (!parsed.success) return { ok: false, message: messageFor("invalid") };
  const ctx = await requireExecutionContext();
  try {
    return await loaded(ctx, await catalog.ensureFromFacts(ctx, parsed.data as FoodFacts));
  } catch (error) {
    return { ok: false, message: toActionState(error).message ?? messageFor("unknown") };
  }
}

/** «Nuovo alimento»: typed by hand into the household catalog. */
export async function createCatalogFoodAction(fields: Record<string, string>): Promise<FoodResult> {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) if (typeof v === "string") fd.set(k, v);
  const parsed = parseForm(catalog.newFoodSchema, fd);
  if (!parsed.ok) return { ok: false, message: parsed.state.message ?? messageFor("invalid"), fieldErrors: parsed.state.fieldErrors };
  const ctx = await requireExecutionContext();
  try {
    return await loaded(ctx, await catalog.ensureFood(ctx, parsed.data));
  } catch (error) {
    return { ok: false, message: toActionState(error).message ?? messageFor("unknown") };
  }
}

export async function updateCatalogFoodAction(foodId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(catalog.updateFoodSchema, formData);
  if (!parsed.ok) return parsed.state;
  const ctx = await requireExecutionContext();
  return run(() => catalog.updateFood(ctx, id(foodId), parsed.data), "Salvato.");
}

export async function deleteCatalogFoodAction(foodId: string): Promise<ActionState> {
  const ctx = await requireExecutionContext();
  const state = await run(() => catalog.deleteFood(ctx, id(foodId)));
  if (state.ok) redirect("/stanze/cucina/aggiungi");
  return state;
}

/** Star «Abituale» (C8): always an explicit choice. */
export async function setStapleAction(foodId: string, staple: boolean): Promise<ActionState> {
  const ctx = await requireExecutionContext();
  return run(() => catalog.setStaple(ctx, id(foodId), staple));
}
