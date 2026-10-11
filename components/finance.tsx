import { CategoryField, Field, SelectField, VisibilityField } from "@/components/forms";
import { cx } from "@/components/ui";
import type { Expense, ExpenseCategory, FinanceGoal } from "@/lib/db/types";
import { formatItalianNumber } from "@/lib/goals";
import { CURRENCIES, formatMoney, type BudgetUsage } from "@/lib/money";

export const PAYMENT_LABELS = { card: "Carta", cash: "Contanti", transfer: "Bonifico", other: "Altro" } as const;

/** Fields shared by the add modal and the edit page. */
export function ExpenseFields({
  expense,
  categories,
  goals,
  today,
}: {
  expense?: Expense;
  categories: ExpenseCategory[];
  goals: FinanceGoal[];
  today: string;
}) {
  return (
    <>
      <div className="grid grid-cols-[1fr_6.5rem] gap-3">
        <Field label="Importo" name="total" inputMode="decimal" placeholder="0,00" defaultValue={expense ? formatItalianNumber(expense.total, false) : undefined} required />
        <SelectField label="Valuta" name="currency" defaultValue={expense?.currency ?? "EUR"} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Dove" name="merchant" placeholder="Es. Esselunga" defaultValue={expense?.merchant} />
        <Field label="Data" name="occurred_on" type="date" defaultValue={expense?.occurred_on ?? today} />
      </div>
      <Field label="Per cosa" name="description" placeholder="Es. Spesa settimanale" defaultValue={expense?.description} hint="Basta uno tra «Dove» e «Per cosa»." />
      <CategoryField categories={categories} defaultValue={expense?.category_id} />
      <div className="grid grid-cols-2 gap-3">
        <SelectField
          label="Pagamento"
          name="payment_method"
          defaultValue={expense?.payment_method ?? ""}
          options={[{ value: "", label: "—" }, ...Object.entries(PAYMENT_LABELS).map(([value, label]) => ({ value, label }))]}
        />
        <SelectField
          label="Progetto"
          name="goal_id"
          defaultValue={expense?.goal_id ?? ""}
          options={[{ value: "", label: "Nessuno" }, ...goals.filter((g) => g.status === "active" || g.id === expense?.goal_id).map((g) => ({ value: g.id, label: g.title }))]}
        />
      </div>
      <VisibilityField defaultValue={expense?.visibility} />
    </>
  );
}

/** Horizontal bar: spent vs budget; over budget turns red, the bar never exceeds 100%. */
export function BudgetBar({ usage, color, label }: { usage: BudgetUsage; color: string; label: string }) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={usage.percent}
      className="h-2.5 overflow-hidden rounded-full"
      style={{ backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)` }}
    >
      <div className={cx("h-full rounded-full transition-[width] duration-700")} style={{ width: `${usage.percent}%`, backgroundColor: usage.over ? "#c4553f" : color }} />
    </div>
  );
}

export function Money({ amount, currency, className }: { amount: number | string; currency: string; className?: string }) {
  return <span className={cx("tabular-nums", className)}>{formatMoney(amount, currency)}</span>;
}
