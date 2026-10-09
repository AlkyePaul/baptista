/**
 * Food inventory vocabulary and expiry logic shared by UI and services (Cucina, D25).
 * The windows mirror the SQL detector (AGENT.md): approaching within 2 days of the effective
 * date; an explicit date always wins over an estimate.
 */

import { addDays } from "./dates";

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
