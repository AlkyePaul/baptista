/**
 * Food inventory vocabulary and expiry logic shared by UI and services (Cucina, D25).
 * The windows mirror the SQL detector (AGENT.md): approaching within 2 days of the effective
 * date; an explicit date always wins over an estimate.
 */

import { addDays } from "./dates";
import { formatItalianNumber } from "./goals";

export const STORAGES = [
  { id: "fridge", label: "Frigo" },
  { id: "freezer", label: "Freezer" },
  { id: "pantry", label: "Dispensa" },
] as const;
export type Storage = (typeof STORAGES)[number]["id"];

export const FOOD_CATEGORIES = [
  { id: "produce", label: "Frutta e verdura" },
  { id: "dairy", label: "Latticini e uova" },
  { id: "meat_fish", label: "Carne e pesce" },
  { id: "bakery", label: "Pane e forno" },
  { id: "ready_meal", label: "Piatti pronti" },
  { id: "pantry", label: "Dispensa secca" },
  { id: "frozen", label: "Surgelati" },
  { id: "drinks", label: "Bevande" },
  { id: "other", label: "Altro" },
] as const;
export type FoodCategory = (typeof FOOD_CATEGORIES)[number]["id"];

export const UNITS = [
  { id: "pz", label: "pz" },
  { id: "conf", label: "conf." },
  { id: "g", label: "g" },
  { id: "kg", label: "kg" },
  { id: "ml", label: "ml" },
  { id: "l", label: "l" },
] as const;
export type Unit = (typeof UNITS)[number]["id"];

export const STATUS_LABELS = {
  available: "Disponibile",
  opened: "Aperto",
  consumed: "Finito",
  discarded: "Buttato",
} as const;
export type FoodStatus = keyof typeof STATUS_LABELS;

export const APPROACHING_DAYS = 2;

export type ExpiryFields = { explicit_expires_on: string | null; estimated_expires_on: string | null };

export function effectiveExpiry(item: ExpiryFields): { date: string; estimated: boolean } | null {
  if (item.explicit_expires_on) return { date: item.explicit_expires_on, estimated: false };
  if (item.estimated_expires_on) return { date: item.estimated_expires_on, estimated: true };
  return null;
}

export type ExpiryState = "expired" | "today" | "soon" | "ok" | "none";

export function expiryState(item: ExpiryFields, today: string): ExpiryState {
  const e = effectiveExpiry(item);
  if (!e) return "none";
  if (e.date < today) return "expired";
  if (e.date === today) return "today";
  if (e.date <= addDays(today, APPROACHING_DAYS)) return "soon";
  return "ok";
}

/** Sort key: items with a date first (soonest first), then the rest by name. */
export function compareByExpiry<T extends ExpiryFields & { product_name: string }>(a: T, b: T): number {
  const da = effectiveExpiry(a)?.date ?? "9999-12-31";
  const db = effectiveExpiry(b)?.date ?? "9999-12-31";
  return da.localeCompare(db) || a.product_name.localeCompare(b.product_name, "it");
}

export function label<T extends readonly { id: string; label: string }[]>(list: T, id: string): string {
  return list.find((x) => x.id === id)?.label ?? id;
}

/** «Granarolo · Latticini e uova · 64 kcal/100 g» under a catalog food (D31). */
export function foodLine(food: { brand: string | null; category: string; kcal_100g: number | null }): string {
  return [food.brand, label(FOOD_CATEGORIES, food.category), food.kcal_100g === null ? null : `${formatItalianNumber(food.kcal_100g)} kcal/100 g`]
    .filter(Boolean)
    .join(" · ");
}

export const RECIPE_UNIT_LABELS: Record<string, [string, string]> = {
  g: ["g", "g"],
  kg: ["kg", "kg"],
  ml: ["ml", "ml"],
  l: ["l", "l"],
  pz: ["pezzo", "pezzi"],
  cucchiaio: ["cucchiaio", "cucchiai"],
  cucchiaino: ["cucchiaino", "cucchiaini"],
  spicchio: ["spicchio", "spicchi"],
  pizzico: ["pizzico", "pizzichi"],
  qb: ["q.b.", "q.b."],
};

/** «200 g», «2 spicchi», «q.b.», or nothing when the recipe gives no quantity. */
export function recipeQuantity(amount: number | null, unit: string | null): string | null {
  if (unit === "qb") return "q.b.";
  if (amount === null) return null;
  const [one, many] = RECIPE_UNIT_LABELS[unit ?? "pz"] ?? [unit ?? "", unit ?? ""];
  return `${formatItalianNumber(amount)} ${amount === 1 ? one : many}`;
}
