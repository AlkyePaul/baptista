import { strict as assert } from "node:assert";
import { test } from "node:test";
import { formatItalianNumber, goalPercent, goalRemaining, isDecreasing, parseItalianNumber } from "./goals";

test("increasing goal progress", () => {
  assert.equal(goalPercent({ start_value: 0, current_value: 12.5, target_value: 100 }), 12);
  assert.equal(goalPercent({ start_value: 0, current_value: 150, target_value: 100 }), 100);
  assert.equal(goalPercent({ start_value: "0.00", current_value: "50.00", target_value: "100.00" }), 50);
});

test("decreasing goal is not complete at the start (the reported bug)", () => {
  const goal = { start_value: 85, current_value: 85, target_value: 70 };
  assert.equal(goalPercent(goal), 0);
  assert.equal(isDecreasing(goal), true);
  assert.equal(goalRemaining(goal), 15);
  assert.equal(goalPercent({ ...goal, current_value: 80 }), 33);
  assert.equal(goalPercent({ ...goal, current_value: 90 }), 0);
  assert.equal(goalPercent({ ...goal, current_value: 70 }), 100);
  assert.equal(goalRemaining({ ...goal, current_value: 68 }), 0);
});

test("degenerate goals never divide by zero", () => {
  assert.equal(goalPercent({ start_value: 10, current_value: 10, target_value: 10 }), 0);
  assert.equal(goalPercent({ start_value: "x", current_value: 1, target_value: 2 }), 0);
});

test("Italian number parsing", () => {
  assert.equal(parseItalianNumber("85"), 85);
  assert.equal(parseItalianNumber("85,5"), 85.5);
  assert.equal(parseItalianNumber("1.000"), 1000);
  assert.equal(parseItalianNumber("1.250,75"), 1250.75);
  assert.equal(parseItalianNumber("12.5"), 12.5);
  assert.equal(parseItalianNumber(" 1 250 "), 1250);
  assert.ok(Number.isNaN(parseItalianNumber("1,2,3")));
  assert.ok(Number.isNaN(parseItalianNumber("abc")));
  assert.ok(Number.isNaN(parseItalianNumber("")));
  assert.equal(formatItalianNumber(1250.5), "1.250,5");
  assert.equal(formatItalianNumber(85.5, false), "85,5");
  assert.equal(parseItalianNumber(formatItalianNumber(12345.67)), 12345.67);
});
