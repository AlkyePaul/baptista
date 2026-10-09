import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { DomainError, throwIfDbError } from "@/lib/errors";
import type { Budget, EstimateLine, Expense, ExpenseCategory, ExpenseItem, FinanceGoal } from "@/lib/db/types";
import { HEX_COLOR } from "@/lib/categories";
import { parseItalianNumber } from "@/lib/goals";
import type { ExecutionContext } from "@/lib/households/context";
import { uuidSchema, visibilitySchema } from "@/lib/households/permissions";
import { CURRENCIES, monthRange, parseEstimateLines } from "@/lib/money";
import {
  civilDate,
  decimal,
  getRecord,
  optionalCivilDate,
  optionalDecimal,
  optionalText,
  requiredText,
  updateVersioned,
  versionField,
} from "@/services/shared";

const currency = z.enum(CURRENCIES, { error: "Scegli una valuta." });
const optionalUuid = z.union([z.undefined(), uuidSchema]).transform((v) => v ?? null);

// Categories ---------------------------------------------------------------------------------

/** Lists the household categories, creating the defaults the first time (idempotent in SQL). */
export async function listExpenseCategories(ctx: ExecutionContext): Promise<ExpenseCategory[]> {
  const select = () =>
    ctx.supabase
      .from("expense_categories")
      .select("id, name, color, parent_id, version")
      .eq("household_id", ctx.household.id)
      .order("name")
      .limit(200);
  let { data, error } = await select();
  throwIfDbError(error);
  if (!data?.length) {
    const { error: rpcError } = await ctx.supabase.rpc("ensure_expense_categories", { p_household_id: ctx.household.id });
    throwIfDbError(rpcError);
    ({ data, error } = await select());
    throwIfDbError(error);
  }
  return (data ?? []) as ExpenseCategory[];
}

export const expenseCategorySchema = z.object({
  name: requiredText(40, "Dai un nome alla categoria."),
  color: z.string({ error: "Scegli un colore." }).regex(HEX_COLOR, "Scegli un colore.").transform((c) => c.toLowerCase()),
});

export async function createExpenseCategory(ctx: ExecutionContext, input: z.infer<typeof expenseCategorySchema>) {
  const { error } = await ctx.supabase.from("expense_categories").insert({ household_id: ctx.household.id, ...input });
  if (error?.code === "23505") throw new DomainError("category_exists");
  throwIfDbError(error);
}

export async function deleteExpenseCategory(ctx: ExecutionContext, id: string) {
  const { data, error } = await ctx.supabase
    .from("expense_categories")
    .delete()
    .eq("id", id)
    .eq("household_id", ctx.household.id)
    .select("id");
  throwIfDbError(error);
  if (!data?.length) throw new DomainError("not_found");
}

// Expenses -----------------------------------------------------------------------------------

const expenseFields = {
  total: decimal("Importo", { max: 999_999_999 }),
  currency,
  occurred_on: civilDate("Indica la data."),
  merchant: optionalText(120),
  description: optionalText(200),
  category_id: optionalUuid,
  goal_id: optionalUuid,
  payment_method: z.enum(["cash", "card", "transfer", "other"]).optional().transform((v) => v ?? null),
  notes: optionalText(2000),
  visibility: visibilitySchema,
};

const needsLabel = (v: { merchant: string | null; description: string | null }, ctx: z.RefinementCtx) => {
  if (!v.merchant && !v.description) {
    ctx.addIssue({ code: "custom", path: ["merchant"], message: "Indica dove o per cosa hai speso." });
  }
};

export const expenseSchema = z.object(expenseFields).superRefine(needsLabel);
export const updateExpenseSchema = z.object({ ...expenseFields, version: versionField }).superRefine(needsLabel);

export async function createExpense(ctx: ExecutionContext, input: z.infer<typeof expenseSchema>) {
  const { error } = await ctx.supabase.from("expenses").insert({ household_id: ctx.household.id, ...input });
  throwIfDbError(error);
}

export async function updateExpense(ctx: ExecutionContext, id: string, input: z.infer<typeof updateExpenseSchema>) {
  const { version, ...patch } = input;
  await updateVersioned(ctx, "expenses", id, version, patch);
}

/** Expenses of a month readable by the caller (RLS applies visibility). */
export async function listMonthExpenses(ctx: ExecutionContext, month: string): Promise<Expense[]> {
  const { from, to } = monthRange(month);
  const { data, error } = await ctx.supabase
    .from("expenses")
    .select("*")
    .eq("household_id", ctx.household.id)
    .gte("occurred_on", from)
    .lte("occurred_on", to)
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1000);
  throwIfDbError(error);
  return (data ?? []) as Expense[];
}

export async function listGoalExpenses(ctx: ExecutionContext, goalId: string): Promise<Expense[]> {
  const { data, error } = await ctx.supabase
    .from("expenses")
    .select("*")
    .eq("household_id", ctx.household.id)
    .eq("goal_id", goalId)
    .order("occurred_on", { ascending: false })
    .limit(500);
  throwIfDbError(error);
  return (data ?? []) as Expense[];
}

/** Spent per goal (same currency as the goal only), from expenses the caller can read. */
export async function spentByGoal(ctx: ExecutionContext): Promise<Array<{ goal_id: string; currency: string; total: number }>> {
  const { data, error } = await ctx.supabase
    .from("expenses")
    .select("goal_id, currency, total")
    .eq("household_id", ctx.household.id)
    .not("goal_id", "is", null)
    .limit(5000);
  throwIfDbError(error);
  return (data ?? []) as Array<{ goal_id: string; currency: string; total: number }>;
}

// Lines --------------------------------------------------------------------------------------

export const expenseItemSchema = z.object({
  description: requiredText(200, "Descrivi la voce."),
  line_total: decimal("Importo", { min: -999_999_999, max: 999_999_999 }),
  quantity: optionalDecimal("Quantità", { max: 999_999, decimals: 3 }),
});

export async function listExpenseItems(ctx: ExecutionContext, expenseId: string): Promise<ExpenseItem[]> {
  const { data, error } = await ctx.supabase
    .from("expense_items")
    .select("id, expense_id, position, description, quantity, unit_price, line_total, category_id")
    .eq("household_id", ctx.household.id)
    .eq("expense_id", expenseId)
    .order("position")
    .order("created_at")
    .limit(500);
  throwIfDbError(error);
  return (data ?? []) as ExpenseItem[];
}

export async function addExpenseItem(ctx: ExecutionContext, expenseId: string, input: z.infer<typeof expenseItemSchema>) {
  const items = await listExpenseItems(ctx, expenseId);
  const { error } = await ctx.supabase.from("expense_items").insert({
    household_id: ctx.household.id,
    expense_id: expenseId,
    position: Math.min(1000, items.length),
    ...input,
  });
  throwIfDbError(error);
}

export async function removeExpenseItem(ctx: ExecutionContext, itemId: string) {
  const { data, error } = await ctx.supabase
    .from("expense_items")
    .delete()
    .eq("id", itemId)
    .eq("household_id", ctx.household.id)
    .select("id");
  throwIfDbError(error);
  if (!data?.length) throw new DomainError("not_found");
}

// Budgets ------------------------------------------------------------------------------------

export const budgetSchema = z.object({
  category_id: optionalUuid,
  currency,
  monthly_amount: decimal("Budget mensile", { min: 0, exclusiveMin: true }),
});

export async function listBudgets(ctx: ExecutionContext): Promise<Budget[]> {
  const { data, error } = await ctx.supabase
    .from("budgets")
    .select("id, category_id, currency, monthly_amount, version")
    .eq("household_id", ctx.household.id)
    .limit(500);
  throwIfDbError(error);
  return (data ?? []) as Budget[];
}

/** Sets the budget of a category (or the overall one): insert or update the existing row. */
export async function setBudget(ctx: ExecutionContext, input: z.infer<typeof budgetSchema>) {
  const existing = (await listBudgets(ctx)).find((b) => b.category_id === input.category_id && b.currency === input.currency);
  if (existing) {
    const { data, error } = await ctx.supabase
      .from("budgets")
      .update({ monthly_amount: input.monthly_amount })
      .eq("id", existing.id)
      .eq("household_id", ctx.household.id)
      .eq("version", existing.version)
      .select("id");
    throwIfDbError(error);
    if (!data?.length) throw new DomainError("conflict");
    return;
  }
  const { error } = await ctx.supabase.from("budgets").insert({ household_id: ctx.household.id, ...input });
  throwIfDbError(error);
}

export async function deleteBudget(ctx: ExecutionContext, id: string) {
  const { data, error } = await ctx.supabase.from("budgets").delete().eq("id", id).eq("household_id", ctx.household.id).select("id");
  throwIfDbError(error);
  if (!data?.length) throw new DomainError("not_found");
}

// Spending goals -----------------------------------------------------------------------------

const linesText = z
  .string()
  .optional()
  .transform((v, ctx) => {
    const { lines, invalid } = parseEstimateLines(v ?? "", parseItalianNumber);
    if (invalid.length) {
      ctx.addIssue({ code: "custom", message: `Riga ${invalid.join(", ")}: scrivi «voce importo», es. «Volo 300».` });
      return z.NEVER;
    }
    if (lines.length > 100) {
      ctx.addIssue({ code: "custom", message: "Al massimo 100 voci." });
      return z.NEVER;
    }
    return lines.map((l): EstimateLine => ({ id: randomUUID(), ...l }));
  });

export const financeGoalSchema = z.object({
  title: requiredText(120, "Dai un nome al progetto."),
  currency,
  target_date: optionalCivilDate,
  estimate_lines: linesText,
  notes: optionalText(2000),
  visibility: visibilitySchema,
});

export const updateFinanceGoalSchema = z.object({
  title: requiredText(120, "Dai un nome al progetto."),
  target_date: optionalCivilDate,
  notes: optionalText(2000),
  status: z.enum(["active", "completed", "archived"]),
  visibility: visibilitySchema,
  version: versionField,
});

export const estimateLineSchema = z.object({
  label: requiredText(120, "Descrivi la voce."),
  amount: decimal("Importo", { max: 999_999_999 }),
  version: versionField,
});

export async function createFinanceGoal(ctx: ExecutionContext, input: z.infer<typeof financeGoalSchema>) {
  const { data, error } = await ctx.supabase
    .from("finance_goals")
    .insert({ household_id: ctx.household.id, ...input })
    .select("id")
    .single();
  throwIfDbError(error);
  return (data as { id: string }).id;
}

export async function updateFinanceGoal(ctx: ExecutionContext, id: string, input: z.infer<typeof updateFinanceGoalSchema>) {
  const { version, ...patch } = input;
  await updateVersioned(ctx, "finance_goals", id, version, patch);
}

export async function listFinanceGoals(ctx: ExecutionContext, includeArchived = false): Promise<FinanceGoal[]> {
  let query = ctx.supabase.from("finance_goals").select("*").eq("household_id", ctx.household.id);
  if (!includeArchived) query = query.neq("status", "archived");
  const { data, error } = await query.order("status").order("created_at").limit(200);
  throwIfDbError(error);
  return (data ?? []) as FinanceGoal[];
}

async function mutateLines(ctx: ExecutionContext, id: string, version: number, change: (lines: EstimateLine[]) => EstimateLine[]) {
  const goal = await getRecord<FinanceGoal>(ctx, "finance_goals", id);
  if (!goal) throw new DomainError("not_found");
  if (goal.version !== version) throw new DomainError("conflict");
  await updateVersioned(ctx, "finance_goals", id, version, { estimate_lines: change(goal.estimate_lines) });
}

export async function addEstimateLine(ctx: ExecutionContext, id: string, input: z.infer<typeof estimateLineSchema>) {
  const { version, ...line } = input;
  await mutateLines(ctx, id, version, (lines) => {
    if (lines.length >= 100) throw new DomainError("limit_reached");
    return [...lines, { id: randomUUID(), ...line }];
  });
}

export async function removeEstimateLine(ctx: ExecutionContext, id: string, version: number, lineId: string) {
  await mutateLines(ctx, id, version, (lines) => lines.filter((l) => l.id !== lineId));
}
