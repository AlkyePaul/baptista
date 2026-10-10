/**
 * Shopping list vocabulary and matching rules (Phase 04.1, A-1). Pure and shared by UI, services
 * and tests. `nameKey` mirrors the SQL function baptista.name_key exactly.
 */

import type { FoodCategory, Storage } from "./food";

const ACCENTS: Record<string, string> = {
  à: "a", á: "a", â: "a", ä: "a",
  è: "e", é: "e", ê: "e", ë: "e",
  ì: "i", í: "i", î: "i", ï: "i",
  ò: "o", ó: "o", ô: "o", ö: "o",
  ù: "u", ú: "u", û: "u", ü: "u",
};

/** Lower case, Italian accents folded, spaces collapsed (same as baptista.name_key). */
export function nameKey(value: string): string {
  return [...value.toLowerCase()]
    .map((ch) => ACCENTS[ch] ?? ch)
    .join("")
    .trim()
    .replace(/\s+/g, " ");
}

/** Storage proposed from the food category (editable chip on the row). */
export function storageFor(category: FoodCategory | null | undefined): Storage {
  switch (category) {
    case "produce":
    case "dairy":
    case "meat_fish":
    case "ready_meal":
      return "fridge";
    case "frozen":
      return "freezer";
    default:
      return "pantry";
  }
}

/** Open Food Facts category tags → our food category (first match wins). */
const OFF_RULES: Array<[RegExp, FoodCategory]> = [
  [/^en:(frozen|surgel)/, "frozen"],
  [/^en:(dairies|dairy|milks?|cheeses?|yogurts?|eggs|butters?|creams?)$/, "dairy"],
  [/^en:(meats?|fishes|fish|seafood|poultries|poultry|hams?|sausages?|cured-meats?)$/, "meat_fish"],
  [/^en:(fresh-vegetables|fresh-fruits|fruits|vegetables|salads?|fresh-foods)$/, "produce"],
  [/^en:(breads?|bakery|viennoiseries|pastries)$/, "bakery"],
  [/^en:(prepared-meals|meals|ready-meals|pizzas?)$/, "ready_meal"],
  [/^en:(beverages|drinks|waters?|juices?|sodas?|wines?|beers?)$/, "drinks"],
];

export function categoryFromOffTags(tags: readonly string[] | undefined): FoodCategory | null {
  if (!tags?.length) return null;
  for (const [pattern, category] of OFF_RULES) {
    if (tags.some((t) => pattern.test(t))) return category;
  }
  return "pantry";
}

export type PantryRef = { id: string; product_name: string; barcode: string | null };

/** A list row is «already in the pantry» when an active food has its barcode or else its name key. */
export function pantryMatch<T extends PantryRef>(row: { name: string; barcode: string | null }, pantry: readonly T[]): T | null {
  if (row.barcode) {
    const byCode = pantry.find((f) => f.barcode === row.barcode);
    if (byCode) return byCode;
  }
  const key = nameKey(row.name);
  return pantry.find((f) => nameKey(f.product_name) === key) ?? null;
}

// Recipe ingredients (C3) ----------------------------------------------------------------------

const QUANTITY = /^(\d+([.,]\d+)?|un|una|uno|mezzo|mezza|qualche|q\.?\s?b\.?)\s*/i;
const UNIT = /^(g|gr|grammi|kg|ml|cl|dl|l|litri?|cucchiai(ni|no)?|cucchiaio|tazz[ae]|bicchier[ei]|pizzico|spicchi?|fett[ae]|pz|confezion[ei]|vasett[oi]|bustin[ae])\b\.?\s*/i;
const LINK = /^(di|d'|del|della|dello|dei|degli|delle)\s*/i;

/** «200 g di farina» → «farina»; «2 uova» → «uova». Heuristic, used only to propose. */
export function ingredientName(text: string): string {
  let rest = text.trim();
  rest = rest.replace(QUANTITY, "");
  rest = rest.replace(UNIT, "");
  rest = rest.replace(LINK, "");
  rest = rest.replace(/\s*[(,].*$/, "");
  return rest.trim() || text.trim();
}

/**
 * Ingredients that do not match anything in the pantry (by name key, either way contained).
 * The comparison is heuristic: the UI lets the user tick what to add, nothing is added alone.
 */
export function missingIngredients(ingredients: readonly string[], pantryNames: readonly string[]): string[] {
  const keys = pantryNames.map(nameKey).filter(Boolean);
  const seen = new Set<string>();
  const missing: string[] = [];
  for (const raw of ingredients) {
    const name = ingredientName(raw);
    const key = nameKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const present = keys.some((k) => k === key || (k.length >= 3 && key.includes(k)) || (key.length >= 3 && k.includes(key)));
    if (!present) missing.push(name);
  }
  return missing;
}
