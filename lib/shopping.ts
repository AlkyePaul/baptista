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
