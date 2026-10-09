import { strict as assert } from "node:assert";
import { test } from "node:test";
import { compareByExpiry, effectiveExpiry, expiryState } from "./food";
import { toFoodFacts } from "./openfoodfacts-parse";
import { parseItalianNumber } from "./goals";
import { addAmounts, budgetUsage, monthElapsedShare, monthRange, parseEstimateLines, totalsByCurrency } from "./money";
import { diaryTotals, mealTotals, portion, slotForHour, targetProgress } from "./nutrition";

test("explicit expiry wins over the estimate; states mirror the SQL detector windows", () => {
  const today = "2026-09-16";
  assert.deepEqual(effectiveExpiry({ explicit_expires_on: "2026-09-20", estimated_expires_on: "2026-09-17" }), { date: "2026-09-20", estimated: false });
  assert.deepEqual(effectiveExpiry({ explicit_expires_on: null, estimated_expires_on: "2026-09-17" }), { date: "2026-09-17", estimated: true });
  const s = (d: string | null) => expiryState({ explicit_expires_on: d, estimated_expires_on: null }, today);
  assert.equal(s("2026-09-15"), "expired");
  assert.equal(s("2026-09-16"), "today");
  assert.equal(s("2026-09-18"), "soon");
  assert.equal(s("2026-09-19"), "ok");
  assert.equal(s(null), "none");
  const items = [
    { product_name: "Zucchine", explicit_expires_on: null, estimated_expires_on: null },
    { product_name: "Latte", explicit_expires_on: "2026-09-20", estimated_expires_on: null },
    { product_name: "Uva", explicit_expires_on: null, estimated_expires_on: "2026-09-17" },
    { product_name: "Aglio", explicit_expires_on: null, estimated_expires_on: null },
  ];
  assert.deepEqual([...items].sort(compareByExpiry).map((i) => i.product_name), ["Uva", "Latte", "Aglio", "Zucchine"]);
});

test("portions and meal totals; unknown macros stay unknown", () => {
  assert.deepEqual(portion({ kcal_100g: 360, protein_100g: 12, carbs_100g: 72, fat_100g: 1.5 }, 80), { kcal: 288, protein: 9.6, carbs: 57.6, fat: 1.2 });
  const total = mealTotals([
    { id: "1", name: "Pasta", grams: 80, kcal_100g: 360, protein_100g: 12, carbs_100g: 72, fat_100g: 1.5 },
    { id: "2", name: "Olio", grams: 10, kcal_100g: 884, protein_100g: 0, carbs_100g: 0, fat_100g: 100 },
  ]);
  assert.deepEqual(total, { kcal: 376, protein: 9.6, carbs: 57.6, fat: 11.2 });
  const partial = mealTotals([
    { id: "1", name: "Pasta", grams: 100, kcal_100g: 360, protein_100g: 12 },
    { id: "2", name: "Sugo", grams: 100, kcal_100g: 50, protein_100g: null },
  ]);
  assert.equal(partial.kcal, 410);
  assert.equal(partial.protein, null, "one unknown makes the sum unknown, not smaller");
  assert.deepEqual(mealTotals([]), { kcal: 0, protein: 0, carbs: 0, fat: 0 });
});

test("diary totals and daily target", () => {
  const t = diaryTotals([
    { kcal: "650.0", protein_g: "20.5", carbs_g: "90", fat_g: "15" },
    { kcal: 350, protein_g: 10, carbs_g: 40, fat_g: 12 },
  ]);
  assert.deepEqual(t, { kcal: 1000, protein: 30.5, carbs: 130, fat: 27 });
  assert.deepEqual(targetProgress(1000, 2000), { percent: 50, left: 1000 });
  assert.deepEqual(targetProgress(2300, 2000), { percent: 100, left: -300 });
  assert.deepEqual(targetProgress(500, null), { percent: 0, left: null });
  assert.equal(slotForHour(8), "breakfast");
  assert.equal(slotForHour(13), "lunch");
  assert.equal(slotForHour(20), "dinner");
  assert.equal(slotForHour(16), "snack");
});

test("money: cents-exact sums, never across currencies", () => {
  assert.equal(addAmounts([0.1, 0.2]), 0.3);
  assert.equal(addAmounts(["19.99", "0.01", 5]), 25);
  assert.deepEqual(
    totalsByCurrency([
      { currency: "EUR", total: "10.10" },
      { currency: "CHF", total: 50 },
      { currency: "EUR", total: 0.2 },
    ]),
    [
      { currency: "CHF", total: 50 },
      { currency: "EUR", total: 10.3 },
    ],
  );
  assert.deepEqual(budgetUsage(150, 400), { spent: 150, budget: 400, percent: 38, left: 250, over: false });
  assert.deepEqual(budgetUsage(450.5, 400), { spent: 450.5, budget: 400, percent: 100, left: -50.5, over: true });
});

test("months: range and elapsed share (leap year)", () => {
  assert.deepEqual(monthRange("2028-02"), { from: "2028-02-01", to: "2028-02-29" });
  assert.deepEqual(monthRange("2026-09"), { from: "2026-09-01", to: "2026-09-30" });
  assert.equal(monthElapsedShare("2026-09-15"), 0.5);
});

test("estimate lines typed as text", () => {
  const { lines, invalid } = parseEstimateLines("Volo 300\nHotel: 1.250,50\n\nCena di gala - 80 €\nsolo testo\n42", parseItalianNumber);
  assert.deepEqual(lines, [
    { label: "Volo", amount: 300 },
    { label: "Hotel", amount: 1250.5 },
    { label: "Cena di gala", amount: 80 },
  ]);
  assert.deepEqual(invalid, [5, 6]);
});

test("Open Food Facts parsing: Italian name first, kJ fallback, out-of-range values dropped", () => {
  const facts = toFoodFacts({
    code: "3017620422003",
    product_name: "Nutella",
    product_name_it: "Nutella crema",
    brands: "Nutella, Ferrero",
    nutriments: { "energy-kcal_100g": 539, proteins_100g: 6.3, carbohydrates_100g: "57.5", fat_100g: 30.9 },
  });
  assert.deepEqual(facts, {
    barcode: "3017620422003",
    name: "Nutella crema",
    brand: "Nutella",
    kcal_100g: 539,
    protein_100g: 6.3,
    carbs_100g: 57.5,
    fat_100g: 30.9,
  });
  const kj = toFoodFacts({ product_name: "Pane", nutriments: { energy_100g: 1046, fat_100g: 250, proteins_100g: -1 } });
  assert.equal(kj?.kcal_100g, 250);
  assert.equal(kj?.fat_100g, null);
  assert.equal(kj?.protein_100g, null);
  assert.equal(kj?.barcode, null);
  assert.equal(toFoodFacts({ product_name: "  " }), null);
  assert.equal(toFoodFacts("<html>"), null);
});
