import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { addExpenseItemAction, deleteFinanceRecordAction, removeExpenseItemAction, updateExpenseAction } from "@/app/actions/finance";
import { ActionButton, ActionForm, Field, SubmitButton } from "@/components/forms";
import { ExpenseFields, Money } from "@/components/finance";
import { Card, PageHeader, Section, TextLink } from "@/components/ui";
import type { Expense } from "@/lib/db/types";
import { formatLongDay, localDate, monthOf } from "@/lib/dates";
import { formatItalianNumber } from "@/lib/goals";
import { requireExecutionContext } from "@/lib/households/context";
import { addAmounts } from "@/lib/money";
import { listExpenseCategories, listExpenseItems, listFinanceGoals } from "@/services/finance";
import { getRecord } from "@/services/shared";

export const metadata: Metadata = { title: "Spesa" };

export default async function ExpensePage({ params }: PageProps<"/stanze/finanze/spese/[id]">) {
  const { id } = await params;
  const ctx = await requireExecutionContext();
  const expense = await getRecord<Expense>(ctx, "expenses", id);
  if (!expense) notFound();
  const [items, categories, goals] = await Promise.all([listExpenseItems(ctx, expense.id), listExpenseCategories(ctx), listFinanceGoals(ctx, true)]);
  const today = localDate(new Date(), ctx.household.timezone);
  const isOwner = expense.owner_user_id === ctx.user.id;
  const linesTotal = addAmounts(items.map((i) => i.line_total));
  const mismatch = items.length > 0 && Math.abs(linesTotal - Number(expense.total)) >= 0.01;

  return (
    <>
      <TextLink href={`/stanze/finanze/spese?mese=${monthOf(expense.occurred_on)}`}>← Spese</TextLink>
      <PageHeader
        title={expense.merchant ?? expense.description ?? "Spesa"}
        subtitle={formatLongDay(expense.occurred_on)}
        action={<Money amount={expense.total} currency={expense.currency} className="text-2xl font-semibold" />}
      />

      <Section title="Righe" action={items.length ? <Money amount={linesTotal} currency={expense.currency} className="text-sm text-muted" /> : undefined}>
        {items.length ? (
          <Card>
            <ul className="divide-y divide-border">
              {items.map((item) => (
                <li key={item.id} className="flex items-center gap-3 py-2 pr-2 pl-4">
                  <span className="flex flex-1 flex-col">
                    <span>{item.description}</span>
                    {item.quantity ? <span className="text-sm text-muted">× {formatItalianNumber(item.quantity)}</span> : null}
                  </span>
                  <Money amount={item.line_total} currency={expense.currency} />
                  <ActionButton action={removeExpenseItemAction.bind(null, item.id)} label={`Rimuovi: ${item.description}`} className="size-11 px-0">
                    <span aria-hidden>×</span>
                  </ActionButton>
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <p className="text-sm text-muted">Facoltative: dettaglio di cosa hai comprato. Il totale resta quello della spesa.</p>
        )}
        {mismatch ? (
          <p role="status" className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">
            Le righe sommano <Money amount={linesTotal} currency={expense.currency} />, il totale è <Money amount={expense.total} currency={expense.currency} />.
            Può dipendere da sconti o arrotondamenti: controlla.
          </p>
        ) : null}
        <ActionForm action={addExpenseItemAction.bind(null, expense.id)} className="grid grid-cols-[1fr_6rem_auto] items-end gap-2">
          <Field label="Voce" name="description" placeholder="Es. Latte" />
          <Field label="Importo" name="line_total" inputMode="decimal" />
          <SubmitButton pendingLabel="…" className="px-4">
            +
          </SubmitButton>
        </ActionForm>
      </Section>

      <details className="rounded-2xl border border-border bg-surface">
        <summary className="flex min-h-12 cursor-pointer items-center px-4 font-medium">Modifica</summary>
        <div className="border-t border-border p-4">
          <ActionForm action={updateExpenseAction.bind(null, expense.id)} resetOnSuccess={false} successMessage>
            <input type="hidden" name="version" value={expense.version} />
            <ExpenseFields expense={expense} categories={categories} goals={goals} today={today} />
            {isOwner ? null : <p className="text-xs text-muted">Solo chi l&apos;ha registrata può cambiarne la visibilità.</p>}
            <SubmitButton>Salva</SubmitButton>
          </ActionForm>
        </div>
      </details>

      <div className="flex justify-end">
        <ActionButton action={deleteFinanceRecordAction.bind(null, "expenses", expense.id)} variant="danger" confirmLabel="Conferma eliminazione">
          Elimina spesa
        </ActionButton>
      </div>
    </>
  );
}
