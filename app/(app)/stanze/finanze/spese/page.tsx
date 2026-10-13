import type { Metadata } from "next";
import Link from "next/link";
import { deleteBudgetAction } from "@/app/actions/finance";
import { BudgetBar, Money } from "@/components/finance";
import { ActionButton } from "@/components/forms";
import { Icon } from "@/components/icons";
import { buttonClass, Card, cx, EmptyState, PrivateMark, Section } from "@/components/ui";
import type { Expense } from "@/lib/db/types";
import { addMonths, formatMonth, isMonth, localDate, monthOf, relativeDay } from "@/lib/dates";
import { requireExecutionContext } from "@/lib/households/context";
import { BaptistaRoom } from "@/components/baptista/room";
import { addAmounts, budgetUsage, totalsByCurrency } from "@/lib/money";
import { listBudgets, listExpenseCategories, listMonthExpenses } from "@/services/finance";

export const metadata: Metadata = { title: "Spese" };

/** Expenses of a month; adding (manual, optionally with the receipt photo) happens in Aggiungi. */
export default async function ExpensesPage({ searchParams }: PageProps<"/stanze/finanze/spese">) {
  const ctx = await requireExecutionContext();
  const params = await searchParams;
  const today = localDate(new Date(), ctx.household.timezone);
  const thisMonth = monthOf(today);
  const month = typeof params.mese === "string" && isMonth(params.mese) && params.mese <= thisMonth ? params.mese : thisMonth;

  const [expenses, categories, budgets] = await Promise.all([listMonthExpenses(ctx, month), listExpenseCategories(ctx), listBudgets(ctx)]);
  const totals = totalsByCurrency(expenses);
  const main = totals[0]?.currency ?? "EUR";
  const overall = budgets.find((b) => b.category_id === null && b.currency === main);
  const mainTotal = totals.find((t) => t.currency === main)?.total ?? 0;
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const byCategory = [...groupBy(expenses.filter((e) => e.currency === main), (e) => e.category_id ?? "none").entries()]
    .map(([id, list]) => ({ id, total: addAmounts(list.map((e) => e.total)) }))
    .sort((a, b) => b.total - a.total);
  const byDay = groupBy(expenses, (e) => e.occurred_on);

  return (
    <>
      <header className="flex items-center justify-between gap-2">
        <Link href={`/stanze/finanze/spese?mese=${addMonths(month, -1)}`} className={cx(buttonClass.ghost, "size-11 px-0")} aria-label="Mese precedente">
          ‹
        </Link>
        <div className="flex flex-col items-center">
          <h1 className="text-3xl font-semibold tracking-tight">Spese</h1>
          <p className="text-sm text-muted first-letter:uppercase">{formatMonth(month)}</p>
        </div>
        {month < thisMonth ? (
          <Link href={`/stanze/finanze/spese?mese=${addMonths(month, 1)}`} className={cx(buttonClass.ghost, "size-11 px-0")} aria-label="Mese successivo">
            ›
          </Link>
        ) : (
          <span className="size-11" />
        )}
      </header>

      <BaptistaRoom ctx={ctx} room="finanze" />

      <Card className="flex flex-col gap-4 p-4">
        {totals.length ? (
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            {totals.map((t, i) => (
              <Money key={t.currency} amount={t.total} currency={t.currency} className={i === 0 ? "text-3xl font-semibold" : "text-lg text-muted"} />
            ))}
          </div>
        ) : (
          <p className="text-muted">Nessuna spesa registrata in questo mese.</p>
        )}
        {/* The overall monthly budget lives here (user 2026-10-11); the Budget page keeps the categories. */}
        {overall ? (
          <div className="flex flex-col gap-1.5">
            <BudgetBar usage={budgetUsage(mainTotal, Number(overall.monthly_amount))} color="#3f9d8c" label="Budget del mese" />
            <div className="flex items-center justify-between gap-2 text-sm text-muted">
              <p>
                Budget <Money amount={overall.monthly_amount} currency={main} />
                {" · "}
                {mainTotal > Number(overall.monthly_amount) ? "superato" : <>restano <Money amount={Number(overall.monthly_amount) - mainTotal} currency={main} /></>}
              </p>
              <span className="flex items-center">
                <Link href="/stanze/finanze/aggiungi?tipo=budget" className="min-h-9 px-2 font-medium text-accent">
                  Modifica
                </Link>
                <ActionButton action={deleteBudgetAction.bind(null, overall.id)} label="Rimuovi il budget del mese" confirmLabel="Rimuovi?" className="min-h-9 px-2 text-xs">
                  ×
                </ActionButton>
              </span>
            </div>
          </div>
        ) : (
          <Link href="/stanze/finanze/aggiungi?tipo=budget" className="text-sm font-medium text-accent">
            Imposta un budget del mese
          </Link>
        )}
        {byCategory.length ? (
          <ul className="flex flex-col gap-2">
            {byCategory.slice(0, 6).map((c) => {
              const cat = categoryById.get(c.id);
              const share = mainTotal > 0 ? Math.round((100 * c.total) / mainTotal) : 0;
              return (
                <li key={c.id} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 text-sm">
                  <span className="flex items-center gap-2">
                    <span aria-hidden className="size-2.5 rounded-full" style={{ backgroundColor: cat?.color ?? "#8f8a80" }} />
                    {cat?.name ?? "Senza categoria"}
                  </span>
                  <Money amount={c.total} currency={main} className="text-muted" />
                  <span className="col-span-2 h-1.5 overflow-hidden rounded-full bg-foreground/5">
                    <span className="block h-full rounded-full" style={{ width: `${share}%`, backgroundColor: cat?.color ?? "#8f8a80" }} />
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}
        {totals.length > 1 ? <p className="text-xs text-muted">Valute diverse sono mostrate separatamente, mai sommate.</p> : null}
      </Card>

      <Link href="/stanze/finanze/aggiungi?tipo=spesa" className={cx(buttonClass.primary, "w-full")}>
        + Aggiungi spesa
      </Link>

      <Section title="Movimenti">
        {byDay.size ? (
          <div className="flex flex-col gap-3">
            {[...byDay.entries()].map(([day, list]) => (
              <div key={day} className="flex flex-col gap-1.5">
                <h3 className="px-1 text-sm font-medium text-muted first-letter:uppercase">{relativeDay(day, today)}</h3>
                <Card>
                  <ul className="divide-y divide-border">
                    {list.map((e) => (
                      <ExpenseRow key={e.id} expense={e} category={e.category_id ? categoryById.get(e.category_id) : undefined} />
                    ))}
                  </ul>
                </Card>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState>Niente in questo mese.</EmptyState>
        )}
      </Section>
    </>
  );
}

function ExpenseRow({ expense, category }: { expense: Expense; category?: { name: string; color: string } }) {
  return (
    <li>
      <Link href={`/stanze/finanze/spese/${expense.id}`} className="flex min-h-14 items-center gap-3 px-4 py-2">
        <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: category?.color ?? "#8f8a80" }} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate">{expense.merchant ?? expense.description}</span>
          <span className="truncate text-sm text-muted">
            {[category?.name, expense.merchant ? expense.description : null].filter(Boolean).join(" · ") || "Senza categoria"}
          </span>
        </span>
        <PrivateMark visibility={expense.visibility} />
        {expense.receipt_path ? (
          <span className="shrink-0 text-muted">
            <Icon name="receipt" className="size-4" />
            <span className="sr-only">Con scontrino</span>
          </span>
        ) : null}
        <Money amount={expense.total} currency={expense.currency} className="font-medium" />
      </Link>
    </li>
  );
}

function groupBy<T>(list: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of list) map.set(key(item), [...(map.get(key(item)) ?? []), item]);
  return map;
}
