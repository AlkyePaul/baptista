/**
 * Nutrition arithmetic (Cucina, D25). Values are per 100 g/ml as published by Open Food Facts or
 * typed by hand; totals are always derived here, never stored twice or produced by a model.
 */

export type Per100 = {
  kcal_100g: number;
  protein_100g?: number | null;
  carbs_100g?: number | null;
  fat_100g?: number | null;
};

/** A food with grams, nutrition from the catalog (kcal may be unknown). */
export type MealLine = { grams: number; food: { name: string; kcal_100g: number | null; protein_100g: number | null; carbs_100g: number | null; fat_100g: number | null } };

export type Totals = { kcal: number; protein: number | null; carbs: number | null; fat: number | null };

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Nutrients of `grams` of a food. A missing macro stays unknown (null), never zero. */
export function portion(food: Per100, grams: number): Totals {
  const f = grams / 100;
  const part = (v: number | null | undefined) => (v === null || v === undefined ? null : round1(Number(v) * f));
  return { kcal: Math.round(Number(food.kcal_100g) * f), protein: part(food.protein_100g), carbs: part(food.carbs_100g), fat: part(food.fat_100g) };
}

/** Sum of totals; a macro is known only if it is known for every part. */
export function sumTotals(parts: Totals[]): Totals {
  const known = (key: "protein" | "carbs" | "fat") =>
    parts.every((p) => p[key] !== null) ? round1(parts.reduce((acc, p) => acc + (p[key] ?? 0), 0)) : null;
  return {
    kcal: Math.round(parts.reduce((acc, p) => acc + p.kcal, 0)),
    protein: parts.length ? known("protein") : 0,
    carbs: parts.length ? known("carbs") : 0,
    fat: parts.length ? known("fat") : 0,
  };
}

/**
 * Totals of a meal. Foods at 0 g do not count (garlic in a recipe); a weighed food without kcal in
 * the catalog is listed in `unknown` so the total is never presented as complete when it is not.
 */
export function mealTotals(items: MealLine[]): Totals & { unknown: string[] } {
  const weighed = items.filter((i) => i.grams > 0);
  const unknown = weighed.filter((i) => i.food.kcal_100g === null).map((i) => i.food.name);
  const parts = weighed
    .filter((i) => i.food.kcal_100g !== null)
    .map((i) => portion({ ...i.food, kcal_100g: i.food.kcal_100g as number }, i.grams));
  return { ...sumTotals(parts), unknown };
}

/** Diary entries store totals directly (snapshot). */
export type DiaryValues = { kcal: number | string; protein_g: number | string | null; carbs_g: number | string | null; fat_g: number | string | null };

export function diaryTotals(entries: DiaryValues[]): Totals {
  return sumTotals(
    entries.map((e) => ({
      kcal: Number(e.kcal),
      protein: e.protein_g === null ? null : Number(e.protein_g),
      carbs: e.carbs_g === null ? null : Number(e.carbs_g),
      fat: e.fat_g === null ? null : Number(e.fat_g),
    })),
  );
}

/** Share of the daily target (0–100 for the ring) and what is left (can be negative). */
export function targetProgress(kcal: number, target: number | null): { percent: number; left: number | null } {
  if (!target || target <= 0) return { percent: 0, left: null };
  return { percent: Math.max(0, Math.min(100, Math.round((100 * kcal) / target))), left: Math.round(target - kcal) };
}

export const SLOTS = [
  { id: "breakfast", label: "Colazione" },
  { id: "lunch", label: "Pranzo" },
  { id: "dinner", label: "Cena" },
  { id: "snack", label: "Spuntini" },
] as const;
export type Slot = (typeof SLOTS)[number]["id"];

/** Default slot from the local hour: a sensible preselection, always editable. */
export function slotForHour(hour: number): Slot {
  if (hour < 11) return "breakfast";
  if (hour < 16) return "lunch";
  if (hour >= 18 && hour < 23) return "dinner";
  return "snack";
}
