import "server-only";

import { z } from "zod";
import { DomainError, throwIfDbError } from "@/lib/errors";
import type { DietEntry, Meal } from "@/lib/db/types";
import type { ExecutionContext, UserContext } from "@/lib/households/context";
import { mealTotals, portion, SLOTS } from "@/lib/nutrition";
import { nutritionFields } from "@/services/food";
import { civilDate, decimal, getRecord, optionalDecimal, requiredText } from "@/services/shared";

const slot = z.enum(SLOTS.map((s) => s.id) as ["breakfast", "lunch", "dinner", "snack"], { error: "Scegli il pasto." });

/** Quick entry: a label and calories (macros optional). */
export const quickEntrySchema = z.object({
  eaten_on: civilDate(),
  slot,
  label: requiredText(120, "Scrivi cosa hai mangiato."),
  kcal: decimal("Calorie", { max: 20000, decimals: 1 }),
  protein_g: optionalDecimal("Proteine", { max: 2000, decimals: 1 }),
  carbs_g: optionalDecimal("Carboidrati", { max: 2000, decimals: 1 }),
  fat_g: optionalDecimal("Grassi", { max: 2000, decimals: 1 }),
});

/** A food by weight: values per 100 g (from Open Food Facts or the inventory) times grams. */
export const foodEntrySchema = z
  .object({
    eaten_on: civilDate(),
    slot,
    label: requiredText(120, "Scrivi l'alimento."),
    grams: decimal("Grammi", { exclusiveMin: true, max: 10000, decimals: 1 }),
    ...nutritionFields,
  })
  .superRefine((v, ctx) => {
    if (v.kcal_100g === null) ctx.addIssue({ code: "custom", path: ["kcal_100g"], message: "Indica le calorie per 100 g." });
  });

export const mealEntrySchema = z.object({
  eaten_on: civilDate(),
  slot,
  meal_id: z.uuid({ error: "Scegli un pasto." }),
  /** Portion of the saved meal, e.g. 0,5 for half. */
  portions: decimal("Porzioni", { exclusiveMin: true, max: 20, decimals: 2 }).optional().transform((v) => v ?? 1),
});

export const kcalTargetSchema = z.object({
  kcal_target: z.union([z.undefined(), decimal("Obiettivo", { min: 800, max: 6000, decimals: 0 })]).transform((v) => v ?? null),
});

async function insertEntry(ctx: ExecutionContext, row: Record<string, unknown>) {
  const { error } = await ctx.supabase.from("diet_entries").insert({ household_id: ctx.household.id, ...row });
  throwIfDbError(error);
}

export async function addQuickEntry(ctx: ExecutionContext, input: z.infer<typeof quickEntrySchema>) {
  await insertEntry(ctx, input);
}

export async function addFoodEntry(ctx: ExecutionContext, input: z.infer<typeof foodEntrySchema>) {
  const { kcal_100g, protein_100g, carbs_100g, fat_100g, ...rest } = input;
  const t = portion({ kcal_100g: kcal_100g ?? 0, protein_100g, carbs_100g, fat_100g }, rest.grams);
  await insertEntry(ctx, { ...rest, kcal: t.kcal, protein_g: t.protein, carbs_g: t.carbs, fat_g: t.fat });
}

/** Snapshot of a saved meal (the meal can change later without rewriting the diary). */
export async function addMealEntry(ctx: ExecutionContext, input: z.infer<typeof mealEntrySchema>) {
  const meal = await getRecord<Meal>(ctx, "meals", input.meal_id);
  if (!meal) throw new DomainError("not_found");
  const t = mealTotals(meal.items);
  const f = input.portions;
  const scale = (v: number | null) => (v === null ? null : Math.round(v * f * 10) / 10);
  await insertEntry(ctx, {
    eaten_on: input.eaten_on,
    slot: input.slot,
    label: f === 1 ? meal.title : `${meal.title} × ${String(f).replace(".", ",")}`,
    kcal: Math.round(t.kcal * f),
    protein_g: scale(t.protein),
    carbs_g: scale(t.carbs),
    fat_g: scale(t.fat),
    meal_id: meal.id,
  });
}

/** The caller's own entries for a day (RLS already restricts to the owner). */
export async function listDay(ctx: ExecutionContext, day: string): Promise<DietEntry[]> {
  const { data, error } = await ctx.supabase
    .from("diet_entries")
    .select("id, eaten_on, slot, label, grams, kcal, protein_g, carbs_g, fat_g, meal_id, created_at")
    .eq("household_id", ctx.household.id)
    .eq("owner_user_id", ctx.user.id)
    .eq("eaten_on", day)
    .order("created_at")
    .limit(200);
  throwIfDbError(error);
  return (data ?? []) as DietEntry[];
}

export async function getKcalTarget(ctx: UserContext): Promise<number | null> {
  const { data, error } = await ctx.supabase.from("profiles").select("kcal_target").eq("user_id", ctx.user.id).maybeSingle();
  throwIfDbError(error);
  return (data as { kcal_target: number | null } | null)?.kcal_target ?? null;
}

export async function setKcalTarget(ctx: UserContext, target: number | null) {
  const { error } = await ctx.supabase.from("profiles").update({ kcal_target: target }).eq("user_id", ctx.user.id);
  throwIfDbError(error);
}
