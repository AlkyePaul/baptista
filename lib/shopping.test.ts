import { strict as assert } from "node:assert";
import { test } from "node:test";
import { categoryFromOffTags, nameKey, storageFor } from "./shopping";

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
