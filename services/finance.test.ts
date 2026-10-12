import { strict as assert } from "node:assert";
import { test } from "node:test";
import { budgetSchema, expenseSchema } from "./finance";

test("budget without category (monthly total) is accepted; category id is still validated", () => {
  // Regression 2026-10-12: «Tutte le spese» sends no category_id and failed with «expected nonoptional».
  assert.deepEqual(budgetSchema.parse({ currency: "EUR", monthly_amount: "400" }).category_id, null);
  assert.equal(budgetSchema.safeParse({ currency: "EUR", monthly_amount: "400", category_id: "x" }).success, false);
  // Same field type on expenses: no category and no project.
  const expense = expenseSchema.parse({ total: "12,50", currency: "EUR", occurred_on: "2026-10-12", merchant: "Bar", visibility: "household" });
  assert.equal(expense.category_id, null);
  assert.equal(expense.goal_id, null);
});
