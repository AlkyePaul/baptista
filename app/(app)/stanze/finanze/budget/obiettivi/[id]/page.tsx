import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { addEstimateLineAction, deleteFinanceRecordAction, removeEstimateLineAction, updateFinanceGoalAction } from "@/app/actions/finance";
import { ActionButton, ActionForm, Field, SelectField, SubmitButton, VisibilityField } from "@/components/forms";
import { BudgetBar, Money } from "@/components/finance";
import { Card, EmptyState, PageHeader, Section, TextLink } from "@/components/ui";
import type { FinanceGoal } from "@/lib/db/types";
import { formatDay, localDate, relativeDay } from "@/lib/dates";
import { requireExecutionContext } from "@/lib/households/context";
import { addAmounts, budgetUsage } from "@/lib/money";
import { listGoalExpenses } from "@/services/finance";
import { getRecord } from "@/services/shared";

export const metadata: Metadata = { title: "Progetto di spesa" };

/** Estimate ("preventivo") lines editable over time; the first total is kept for comparison. */
export default async function FinanceGoalPage({ params }: PageProps<"/stanze/finanze/budget/obiettivi/[id]">) {
  const { id } = await params;
  const ctx = await requireExecutionContext();
  const goal = await getRecord<FinanceGoal>(ctx, "finance_goals", id);
  if (!goal) notFound();
  const expenses = await listGoalExpenses(ctx, goal.id);
  const today = localDate(new Date(), ctx.household.timezone);
  const estimate = addAmounts(goal.estimate_lines.map((l) => l.amount));
  const sameCurrency = expenses.filter((e) => e.currency === goal.currency);
  const spent = addAmounts(sameCurrency.map((e) => e.total));
  const usage = budgetUsage(spent, estimate);
  const initial = Number(goal.initial_estimate);
  const isOwner = goal.owner_user_id === ctx.user.id;

  return (
    <>
      <TextLink href="/stanze/finanze/budget#progetti">← Budget e obiettivi</TextLink>
      <PageHeader title={goal.title} subtitle={goal.target_date ? `Entro ${formatDay(goal.target_date)}` : undefined} />

      <Card className="flex flex-col gap-3 p-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col">
            <span className="text-sm text-muted">Preventivo</span>
            <Money amount={estimate} currency={goal.currency} className="text-2xl font-semibold" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm text-muted">Speso</span>
            <Money amount={spent} currency={goal.currency} className="text-2xl font-semibold" />
          </div>
        </div>
        {estimate > 0 ? <BudgetBar usage={usage} color="#7a6fd0" label={`Speso ${usage.percent}% del preventivo`} /> : null}
        <p className="text-sm text-muted">
          {usage.over ? (
            <>
              Oltre il preventivo di <Money amount={-usage.left} currency={goal.currency} />.
            </>
          ) : (
            <>
              Restano <Money amount={usage.left} currency={goal.currency} /> nel preventivo.
            </>
          )}{" "}
          {Math.abs(initial - estimate) >= 0.01 ? (
            <>
              Preventivo iniziale <Money amount={initial} currency={goal.currency} /> ({estimate > initial ? "+" : "−"}
              <Money amount={Math.abs(estimate - initial)} currency={goal.currency} />
              ).
            </>
          ) : null}
        </p>
        {expenses.length > sameCurrency.length ? <p className="text-xs text-muted">Alcune spese sono in un&apos;altra valuta e non sono sommate.</p> : null}
      </Card>

      <Section title="Voci del preventivo">
        {goal.estimate_lines.length ? (
          <Card>
            <ul className="divide-y divide-border">
              {goal.estimate_lines.map((line) => (
                <li key={line.id} className="flex items-center gap-3 py-2 pr-2 pl-4">
                  <span className="flex-1">{line.label}</span>
                  <Money amount={line.amount} currency={goal.currency} />
                  <ActionButton action={removeEstimateLineAction.bind(null, goal.id, goal.version, line.id)} label={`Rimuovi: ${line.label}`} className="size-11 px-0">
                    <span aria-hidden>×</span>
                  </ActionButton>
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <EmptyState>Nessuna voce: aggiungi quanto prevedi di spendere.</EmptyState>
        )}
        <ActionForm action={addEstimateLineAction.bind(null, goal.id)} className="grid grid-cols-[1fr_6rem_auto] items-end gap-2">
          <input type="hidden" name="version" value={goal.version} />
          <Field label="Voce" name="label" placeholder="Es. Noleggio auto" />
          <Field label="Importo" name="amount" inputMode="decimal" />
          <SubmitButton pendingLabel="…" className="px-4">
            +
          </SubmitButton>
        </ActionForm>
      </Section>

      <Section title="Spese collegate">
        {expenses.length ? (
          <Card>
            <ul className="divide-y divide-border">
              {expenses.map((e) => (
                <li key={e.id}>
                  <Link href={`/stanze/finanze/spese/${e.id}`} className="flex min-h-12 items-center gap-3 px-4 py-2">
                    <span className="w-16 shrink-0 text-sm text-muted first-letter:uppercase">{relativeDay(e.occurred_on, today)}</span>
                    <span className="flex-1 truncate">{e.merchant ?? e.description}</span>
                    <Money amount={e.total} currency={e.currency} />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <p className="text-sm text-muted">Quando registri una spesa scegli questo progetto in «Progetto».</p>
        )}
      </Section>

      <details className="rounded-2xl border border-border bg-surface">
        <summary className="flex min-h-12 cursor-pointer items-center px-4 font-medium">Modifica</summary>
        <div className="border-t border-border p-4">
          <ActionForm action={updateFinanceGoalAction.bind(null, goal.id)} resetOnSuccess={false} successMessage>
            <input type="hidden" name="version" value={goal.version} />
            <Field label="Progetto" name="title" defaultValue={goal.title} required />
            <Field label="Entro il" name="target_date" type="date" defaultValue={goal.target_date} />
            <SelectField
              label="Stato"
              name="status"
              defaultValue={goal.status}
              options={[
                { value: "active", label: "In corso" },
                { value: "completed", label: "Concluso" },
                { value: "archived", label: "Archiviato" },
              ]}
            />
            <Field label="Note" name="notes" defaultValue={goal.notes} multiline />
            {isOwner ? <VisibilityField defaultValue={goal.visibility} /> : <input type="hidden" name="visibility" value={goal.visibility} />}
            <SubmitButton>Salva</SubmitButton>
          </ActionForm>
        </div>
      </details>

      <div className="flex justify-end">
        <ActionButton action={deleteFinanceRecordAction.bind(null, "finance_goals", goal.id)} variant="danger" confirmLabel="Conferma eliminazione">
          Elimina progetto
        </ActionButton>
      </div>
    </>
  );
}
