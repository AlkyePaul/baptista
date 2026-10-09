import type { Metadata } from "next";
import Link from "next/link";
import {
  createExpenseCategoryAction,
  createFinanceGoalAction,
  deleteBudgetAction,
  deleteExpenseCategoryAction,
  setBudgetAction,
} from "@/app/actions/finance";
import { ActionButton, ActionForm, ColorField, Field, SelectField, SubmitButton, VisibilityField } from "@/components/forms";
import { BudgetBar, Money } from "@/components/finance";
import { Modal } from "@/components/modal";
import { Badge, buttonClass, Card, cx, EmptyState, PrivateMark, Section } from "@/components/ui";
import { CATEGORY_COLORS } from "@/lib/categories";
import type { Budget, ExpenseCategory, FinanceGoal } from "@/lib/db/types";
import { formatDay, formatMonth, localDate, monthOf } from "@/lib/dates";
import { requireExecutionContext } from "@/lib/households/context";
import { addAmounts, budgetUsage, CURRENCIES, monthElapsedShare } from "@/lib/money";
import { listBudgets, listExpenseCategories, listFinanceGoals, listMonthExpenses, spentByGoal } from "@/services/finance";

export const metadata: Metadata = { title: "Budget e obiettivi" };

/** Monthly budgets per category + spending goals with a revisable estimate (D26). */
export default async function BudgetPage() {
  const ctx = await requireExecutionContext();
  const today = localDate(new Date(), ctx.household.timezone);
  const month = monthOf(today);
  const [budgets, categories, expenses, goals, goalSpending] = await Promise.all([
    listBudgets(ctx),
    listExpenseCategories(ctx),
    listMonthExpenses(ctx, month),
    listFinanceGoals(ctx),
    spentByGoal(ctx),
  ]);
  const spent = (categoryId: string | null, currency: string) =>
    addAmounts(expenses.filter((e) => e.currency === currency && (categoryId === null || e.category_id === categoryId)).map((e) => e.total));
  const categoryById = new Map(categories.map((c) => [c.id, c]));
  const overall = budgets.filter((b) => b.category_id === null);
  const perCategory = budgets
    .filter((b) => b.category_id !== null)
    .sort((a, b) => (categoryById.get(a.category_id!)?.name ?? "").localeCompare(categoryById.get(b.category_id!)?.name ?? "", "it"));
  const elapsed = Math.round(100 * monthElapsedShare(today));

  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">Budget e obiettivi</h1>
        <p className="text-muted first-letter:uppercase">
          {formatMonth(month)} · trascorso il {elapsed}% del mese
        </p>
      </header>

      <Section
        title="Budget del mese"
        action={
          <Modal trigger="Imposta" title="Budget mensile" triggerClassName={cx(buttonClass.secondary, "min-h-10 px-4 text-sm")}>
            <ActionForm action={setBudgetAction} successMessage>
              <SelectField
                label="Per"
                name="category_id"
                options={[{ value: "", label: "Tutte le spese (totale)" }, ...categories.map((c) => ({ value: c.id, label: c.name }))]}
              />
              <div className="grid grid-cols-[1fr_6.5rem] gap-3">
                <Field label="Importo al mese" name="monthly_amount" inputMode="decimal" placeholder="Es. 400" />
                <SelectField label="Valuta" name="currency" defaultValue="EUR" options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
              </div>
              <p className="text-xs text-muted">Se esiste già un budget per questa voce viene aggiornato. È condiviso con la casa.</p>
              <SubmitButton>Salva budget</SubmitButton>
            </ActionForm>
          </Modal>
        }
      >
        {budgets.length ? (
          <Card>
            <ul className="divide-y divide-border">
              {[...overall, ...perCategory].map((b) => (
                <BudgetRow key={b.id} budget={b} category={b.category_id ? categoryById.get(b.category_id) : undefined} spent={spent(b.category_id, b.currency)} elapsed={elapsed} />
              ))}
            </ul>
          </Card>
        ) : (
          <EmptyState>Nessun budget. Impostane uno totale o per categoria per vedere come stai spendendo.</EmptyState>
        )}
        <p className="text-xs text-muted">Contano le spese che puoi vedere; le spese private degli altri membri non sono incluse.</p>
      </Section>

      <Section
        title="Progetti di spesa"
        id="progetti"
        action={
          <Modal trigger="+ Nuovo" title="Nuovo progetto" triggerClassName={cx(buttonClass.secondary, "min-h-10 px-4 text-sm")}>
            <ActionForm action={createFinanceGoalAction}>
              <Field label="Progetto" name="title" placeholder="Es. Vacanza in Puglia" required />
              <div className="grid grid-cols-[1fr_6.5rem] gap-3">
                <Field label="Entro il" name="target_date" type="date" hint="Facoltativo" />
                <SelectField label="Valuta" name="currency" defaultValue="EUR" options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
              </div>
              <Field label="Preventivo" name="estimate_lines" multiline hint="Una voce per riga con l'importo alla fine, es. «Volo 300», «Hotel 1.250». Potrai cambiarlo nel tempo." />
              <VisibilityField />
              <SubmitButton>Crea progetto</SubmitButton>
            </ActionForm>
          </Modal>
        }
      >
        {goals.length ? (
          <ul className="flex flex-col gap-2">
            {goals.map((g) => (
              <GoalCard key={g.id} goal={g} spent={addAmounts(goalSpending.filter((s) => s.goal_id === g.id && s.currency === g.currency).map((s) => s.total))} />
            ))}
          </ul>
        ) : (
          <EmptyState>Vacanze, lavori in casa, regali: crea un progetto con il suo preventivo e collega le spese.</EmptyState>
        )}
      </Section>

      <details className="rounded-2xl border border-border bg-surface">
        <summary className="flex min-h-12 cursor-pointer items-center px-4 font-medium">Categorie di spesa ({categories.length})</summary>
        <div className="flex flex-col gap-4 border-t border-border p-4">
          <ul className="flex flex-wrap gap-2">
            {categories.map((c) => (
              <li key={c.id} className="flex items-center gap-1 rounded-full border border-border bg-surface pl-3 text-sm">
                <span aria-hidden className="size-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                {c.name}
                <ActionButton action={deleteExpenseCategoryAction.bind(null, c.id)} label={`Elimina categoria ${c.name}`} confirmLabel="Elimina?" className="min-h-9 px-2 text-xs">
                  ×
                </ActionButton>
              </li>
            ))}
          </ul>
          <ActionForm action={createExpenseCategoryAction} successMessage>
            <Field label="Nuova categoria" name="name" placeholder="Es. Animali" />
            <ColorField colors={CATEGORY_COLORS} />
            <SubmitButton>Crea categoria</SubmitButton>
          </ActionForm>
          <p className="text-xs text-muted">Le categorie sono condivise con la casa. Eliminandone una, le spese restano senza categoria e il suo budget viene rimosso.</p>
        </div>
      </details>
    </>
  );
}

function BudgetRow({ budget, category, spent, elapsed }: { budget: Budget; category?: ExpenseCategory; spent: number; elapsed: number }) {
  const usage = budgetUsage(spent, Number(budget.monthly_amount));
  const color = category?.color ?? "#3f9d8c";
  const name = category?.name ?? "Totale del mese";
  // Pace: spending share ahead of the month share by more than 10 points.
  const ahead = !usage.over && usage.percent > elapsed + 10;
  return (
    <li className="flex flex-col gap-2 py-3 pr-2 pl-4">
      <div className="flex items-center gap-2">
        <span aria-hidden className="size-2.5 rounded-full" style={{ backgroundColor: color }} />
        <span className={cx("flex-1", !category && "font-semibold")}>{name}</span>
        {usage.over ? <Badge tone="danger">Superato</Badge> : ahead ? <Badge tone="accent">Sopra il ritmo</Badge> : null}
        <ActionButton action={deleteBudgetAction.bind(null, budget.id)} label={`Rimuovi budget ${name}`} confirmLabel="Rimuovi?" className="min-h-9 px-2 text-xs">
          ×
        </ActionButton>
      </div>
      <BudgetBar usage={usage} color={color} label={`${name}: ${usage.percent}%`} />
      <p className="text-sm text-muted">
        <Money amount={spent} currency={budget.currency} /> di <Money amount={budget.monthly_amount} currency={budget.currency} />
        {" · "}
        {usage.over ? (
          <>
            oltre di <Money amount={-usage.left} currency={budget.currency} />
          </>
        ) : (
          <>
            restano <Money amount={usage.left} currency={budget.currency} />
          </>
        )}
      </p>
    </li>
  );
}

function GoalCard({ goal, spent }: { goal: FinanceGoal; spent: number }) {
  const estimate = addAmounts(goal.estimate_lines.map((l) => l.amount));
  const usage = budgetUsage(spent, estimate);
  const changed = Math.abs(estimate - Number(goal.initial_estimate)) >= 0.01;
  return (
    <li>
      <Link href={`/stanze/finanze/budget/obiettivi/${goal.id}`} className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4">
        <span className="flex items-start justify-between gap-2">
          <span className="font-medium">{goal.title}</span>
          <span className="flex gap-1">
            {goal.status === "completed" ? <Badge tone="accent">Concluso</Badge> : null}
            <PrivateMark visibility={goal.visibility} />
          </span>
        </span>
        {estimate > 0 ? <BudgetBar usage={usage} color="#7a6fd0" label={`${goal.title}: speso ${usage.percent}% del preventivo`} /> : null}
        <span className="text-sm text-muted">
          Speso <Money amount={spent} currency={goal.currency} /> su <Money amount={estimate} currency={goal.currency} />
          {changed ? (
            <>
              {" "}
              (all&apos;inizio <Money amount={goal.initial_estimate} currency={goal.currency} />)
            </>
          ) : null}
          {goal.target_date ? ` · entro ${formatDay(goal.target_date)}` : ""}
        </span>
      </Link>
    </li>
  );
}
