"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { run } from "@/lib/actions";
import { messageFor, type ActionState } from "@/lib/errors";
import { requireExecutionContext } from "@/lib/households/context";
import { uuidSchema } from "@/lib/households/permissions";
import * as finance from "@/services/finance";
import * as receipts from "@/services/receipts";
import { deleteRecord, parseForm, versionField } from "@/services/shared";

const id = (value: string) => uuidSchema.parse(value);
const version = (value: number) => z.number().int().positive().parse(value);

/** The optional receipt field: an empty file input arrives as a 0-byte File. */
function receiptFrom(formData: FormData): File | null {
  const file = formData.get("receipt");
  return file instanceof File && file.size > 0 ? file : null;
}

// Expenses -----------------------------------------------------------------------------------

export async function createExpenseAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(finance.expenseSchema, formData);
  if (!parsed.ok) return parsed.state;
  const ctx = await requireExecutionContext();
  const file = receiptFrom(formData);
  return run(
    async () => receipts.createExpenseWithReceipt(ctx, parsed.data, file ? await receipts.prepareReceipt(file) : null),
    file ? "Spesa registrata con lo scontrino." : "Spesa registrata.",
  );
}

export async function replaceReceiptAction(expenseId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(z.object({ version: versionField }), formData);
  if (!parsed.ok) return parsed.state;
  const file = receiptFrom(formData);
  if (!file) return { ok: false, message: "Scegli la foto dello scontrino." };
  const ctx = await requireExecutionContext();
  return run(async () => receipts.replaceReceipt(ctx, id(expenseId), parsed.data.version, await receipts.prepareReceipt(file)), "Scontrino salvato.");
}

export async function removeReceiptAction(expenseId: string, expenseVersion: number): Promise<ActionState> {
  const ctx = await requireExecutionContext();
  return run(() => receipts.removeReceipt(ctx, id(expenseId), version(expenseVersion)), "Scontrino rimosso.");
}

export async function updateExpenseAction(expenseId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(finance.updateExpenseSchema, formData);
  if (!parsed.ok) return parsed.state;
  const ctx = await requireExecutionContext();
  return run(() => finance.updateExpense(ctx, id(expenseId), parsed.data), "Salvato.");
}

export async function addExpenseItemAction(expenseId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(finance.expenseItemSchema, formData);
  if (!parsed.ok) return parsed.state;
  const ctx = await requireExecutionContext();
  return run(() => finance.addExpenseItem(ctx, id(expenseId), parsed.data));
}

export async function removeExpenseItemAction(itemId: string): Promise<ActionState> {
  const ctx = await requireExecutionContext();
  return run(() => finance.removeExpenseItem(ctx, id(itemId)));
}

// Categories and budgets ---------------------------------------------------------------------

export async function createExpenseCategoryAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(finance.expenseCategorySchema, formData);
  if (!parsed.ok) return parsed.state;
  const ctx = await requireExecutionContext();
  return run(() => finance.createExpenseCategory(ctx, parsed.data), "Categoria creata.");
}

export async function deleteExpenseCategoryAction(categoryId: string): Promise<ActionState> {
  const ctx = await requireExecutionContext();
  return run(() => finance.deleteExpenseCategory(ctx, id(categoryId)));
}

export async function setBudgetAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(finance.budgetSchema, formData);
  if (!parsed.ok) return parsed.state;
  const ctx = await requireExecutionContext();
  return run(() => finance.setBudget(ctx, parsed.data), "Budget salvato.");
}

export async function deleteBudgetAction(budgetId: string): Promise<ActionState> {
  const ctx = await requireExecutionContext();
  return run(() => finance.deleteBudget(ctx, id(budgetId)));
}

// Spending projects («Progetti») -----------------------------------------------------------------------------

export async function createFinanceGoalAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(finance.financeGoalSchema, formData);
  if (!parsed.ok) return parsed.state;
  const ctx = await requireExecutionContext();
  let goalId = "";
  const state = await run(async () => {
    goalId = await finance.createFinanceGoal(ctx, parsed.data);
  });
  if (state.ok) redirect(`/stanze/finanze/budget/progetti/${goalId}`);
  return state;
}

export async function updateFinanceGoalAction(goalId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(finance.updateFinanceGoalSchema, formData);
  if (!parsed.ok) return parsed.state;
  const ctx = await requireExecutionContext();
  return run(() => finance.updateFinanceGoal(ctx, id(goalId), parsed.data), "Salvato.");
}

export async function addEstimateLineAction(goalId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(finance.estimateLineSchema, formData);
  if (!parsed.ok) return parsed.state;
  const ctx = await requireExecutionContext();
  return run(() => finance.addEstimateLine(ctx, id(goalId), parsed.data));
}

export async function removeEstimateLineAction(goalId: string, goalVersion: number, lineId: string): Promise<ActionState> {
  const ctx = await requireExecutionContext();
  return run(() => finance.removeEstimateLine(ctx, id(goalId), version(goalVersion), id(lineId)));
}

// Delete -------------------------------------------------------------------------------------

const DELETE_TARGETS = {
  expenses: "/stanze/finanze/spese",
  finance_goals: "/stanze/finanze/budget#progetti",
} as const;

export async function deleteFinanceRecordAction(table: keyof typeof DELETE_TARGETS, recordId: string): Promise<ActionState> {
  if (!(table in DELETE_TARGETS)) return { ok: false, message: messageFor("invalid") };
  const ctx = await requireExecutionContext();
  // An expense takes its receipt photo with it.
  const state = await run(() => (table === "expenses" ? receipts.deleteExpense(ctx, id(recordId)) : deleteRecord(ctx, table, id(recordId))));
  if (state.ok) redirect(DELETE_TARGETS[table]);
  return state;
}
