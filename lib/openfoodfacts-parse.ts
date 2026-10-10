import { z } from "zod";
import type { FoodCategory } from "./food";
import { categoryFromOffTags } from "./shopping";

/** Validation of Open Food Facts product JSON (pure, shared by the server client and tests). */

export type FoodFacts = {
  barcode: string | null;
  name: string;
  brand: string | null;
  kcal_100g: number | null;
  protein_100g: number | null;
  carbs_100g: number | null;
  fat_100g: number | null;
  /** From the Open Food Facts category tags; decides the proposed storage (lib/shopping.ts). */
  category: FoodCategory | null;
};

const product = z.object({
  code: z.string().optional(),
  product_name: z.string().optional(),
  product_name_it: z.string().optional(),
  brands: z.string().optional(),
  nutriments: z.record(z.string(), z.unknown()).optional(),
  categories_tags: z.array(z.string()).optional().catch(undefined),
});

function bounded(value: unknown, max: number): number | null {
  const n = typeof value === "string" ? Number(value) : value;
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > max) return null;
  return Math.round(n * 100) / 100;
}

export function toFoodFacts(raw: unknown): FoodFacts | null {
  const parsed = product.safeParse(raw);
  if (!parsed.success) return null;
  const p = parsed.data;
  const name = (p.product_name_it || p.product_name || "").trim().slice(0, 120);
  if (!name) return null;
  const n = p.nutriments ?? {};
  const kj = bounded(n["energy_100g"], 4200);
  const kcal = bounded(n["energy-kcal_100g"], 1000) ?? (kj === null ? null : Math.round(kj / 4.184));
  const code = p.code && /^[0-9]{6,14}$/.test(p.code) ? p.code : null;
  return {
    barcode: code,
    name,
    brand: p.brands?.split(",")[0]?.trim().slice(0, 80) || null,
    kcal_100g: kcal,
    protein_100g: bounded(n["proteins_100g"], 100),
    carbs_100g: bounded(n["carbohydrates_100g"], 100),
    fat_100g: bounded(n["fat_100g"], 100),
    category: categoryFromOffTags(p.categories_tags),
  };
}
