import { strict as assert } from "node:assert";
import { test } from "node:test";
import { ingredientName, missingIngredients, nameKey, pantryMatch, storageFor, categoryFromOffTags } from "./shopping";

test("name key mirrors baptista.name_key: case, Italian accents, spaces", () => {
  assert.equal(nameKey("  Caffè   Macinato "), "caffe macinato");
  assert.equal(nameKey("PERÒ"), "pero");
  assert.equal(nameKey("Uova"), nameKey("uova "));
});

test("storage proposed from the category; Open Food Facts tags mapped", () => {
  assert.equal(storageFor("dairy"), "fridge");
  assert.equal(storageFor("frozen"), "freezer");
  assert.equal(storageFor("pantry"), "pantry");
  assert.equal(storageFor(null), "pantry");
  assert.equal(categoryFromOffTags(["en:plant-based-foods", "en:fresh-vegetables"]), "produce");
  assert.equal(categoryFromOffTags(["en:pastas"]), "pantry");
  assert.equal(categoryFromOffTags([]), null);
});

test("already in the pantry: barcode first, then name key", () => {
  const pantry = [
    { id: "1", product_name: "Latte intero", barcode: "8000000000001" },
    { id: "2", product_name: "Caffè", barcode: null },
  ];
  assert.equal(pantryMatch({ name: "Latte parzialmente scremato", barcode: "8000000000001" }, pantry)?.id, "1");
  assert.equal(pantryMatch({ name: "caffe", barcode: null }, pantry)?.id, "2");
  assert.equal(pantryMatch({ name: "Tè", barcode: null }, pantry), null);
});

test("C3: recipe ingredients without quantities, missing ones only, never duplicated", () => {
  assert.equal(ingredientName("200 g di farina"), "farina");
  assert.equal(ingredientName("2 uova"), "uova");
  assert.equal(ingredientName("1 cucchiaio d'olio"), "olio");
  assert.equal(ingredientName("Sale q.b."), "Sale q.b.");
  assert.deepEqual(
    missingIngredients(["200 g di farina", "2 uova", "Uova", "100 ml di latte", "Lievito (una bustina)"], ["Farina 00", "Latte intero"]),
    ["uova", "Lievito"],
  );
});
