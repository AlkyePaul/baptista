import Link from "next/link";
import { BudgetBar, Money } from "@/components/finance";
import { Icon } from "@/components/icons";
import { ExpiryBadge } from "@/components/kitchen";
import { ProgressRing } from "@/components/progress-ring";
import { Card, EmptyState, Section, TextLink } from "@/components/ui";
import { localDate, monthOf } from "@/lib/dates";
import { compareByExpiry, expiryState, STORAGES, label } from "@/lib/food";
import { formatItalianNumber } from "@/lib/goals";
import type { ExecutionContext } from "@/lib/households/context";
import { addAmounts, budgetUsage, totalsByCurrency } from "@/lib/money";
import { diaryTotals, targetProgress } from "@/lib/nutrition";
import type { IconName } from "@/lib/rooms";
import { getKcalTarget, listDay } from "@/services/diet";
import { listBudgets, listFinanceGoals, listMonthExpenses, spentByGoal } from "@/services/finance";
import { listPantry } from "@/services/food";

/** Home of each room: what matters today in that room, computed without any AI (D25/D26). */

function Shortcut({ href, icon, label: text }: { href: string; icon: IconName; label: string }) {
  return (
    <Link href={href} className="flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-2xl border border-border bg-surface text-sm font-medium">
      <Icon name={icon} />
      {text}
    </Link>
  );
}

export async function KitchenRoom({ ctx, now }: { ctx: ExecutionContext; now: Date }) {
  const today = localDate(now, ctx.household.timezone);
  const [pantry, entries, target] = await Promise.all([listPantry(ctx), listDay(ctx, today), getKcalTarget(ctx)]);
  const attention = pantry.filter((i) => ["expired", "today", "soon"].includes(expiryState(i, today))).sort(compareByExpiry);
  const kcal = diaryTotals(entries).kcal;
  const progress = targetProgress(kcal, target);

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        <Shortcut href="/stanze/cucina/aggiungi?tipo=alimento" icon="add" label="Alimento" />
        <Shortcut href="/stanze/cucina/aggiungi?tipo=ricetta" icon="receipt" label="Ricette" />
        <Shortcut href="/stanze/cucina/aggiungi?tipo=pasto" icon="cutlery" label="Pasti" />
      </div>

      <Section title="Da controllare in dispensa" action={<TextLink href="/stanze/cucina/dispensa">Dispensa</TextLink>}>
        {attention.length ? (
          <Card>
            <ul className="divide-y divide-border">
              {attention.slice(0, 5).map((item) => (
                <li key={item.id}>
                  <Link href={`/stanze/cucina/dispensa/${item.id}`} className="flex min-h-12 items-center justify-between gap-3 px-4 py-2">
                    <span className="flex flex-col">
                      <span>{item.product_name}</span>
                      <span className="text-sm text-muted">{label(STORAGES, item.storage)}</span>
                    </span>
                    <ExpiryBadge item={item} today={today} />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <EmptyState>{pantry.length ? "Niente in scadenza nei prossimi 2 giorni." : "La dispensa è vuota."}</EmptyState>
        )}
      </Section>

      <Section title="Oggi a tavola" action={<TextLink href="/stanze/cucina/dieta">Diario</TextLink>}>
        <Link href="/stanze/cucina/dieta" className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-4">
          <ProgressRing percent={progress.percent} color="#3f9d8c" label={`${kcal} kcal oggi`}>
            <span className="text-sm font-semibold">{formatItalianNumber(kcal)}</span>
          </ProgressRing>
          <span className="flex flex-col">
            <span className="font-medium">{formatItalianNumber(kcal)} kcal registrate</span>
            <span className="text-sm text-muted">
              {progress.left === null
                ? "Nessun obiettivo impostato"
                : progress.left >= 0
                  ? `Restano ${formatItalianNumber(progress.left)} kcal`
                  : `${formatItalianNumber(-progress.left)} kcal oltre l'obiettivo`}
            </span>
          </span>
        </Link>
      </Section>
    </>
  );
}

export async function FinanceRoom({ ctx, now }: { ctx: ExecutionContext; now: Date }) {
  const today = localDate(now, ctx.household.timezone);
  const month = monthOf(today);
  const [expenses, budgets, goals, goalSpending] = await Promise.all([listMonthExpenses(ctx, month), listBudgets(ctx), listFinanceGoals(ctx), spentByGoal(ctx)]);
  const totals = totalsByCurrency(expenses);
  const main = totals[0]?.currency ?? "EUR";
  const mainTotal = totals[0]?.total ?? 0;
  const overall = budgets.find((b) => b.category_id === null && b.currency === main);
  const activeGoals = goals.filter((g) => g.status === "active").slice(0, 3);

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        <Shortcut href="/stanze/finanze/spese" icon="add" label="Spesa" />
        <Shortcut href="/stanze/finanze/budget" icon="target" label="Budget" />
        <Shortcut href="/stanze/finanze/watchlist" icon="chart" label="Watchlist" />
      </div>

      <Section title="Questo mese" action={<TextLink href="/stanze/finanze/spese">Spese</TextLink>}>
        <Card className="flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-baseline gap-x-4">
            <Money amount={mainTotal} currency={main} className="text-3xl font-semibold" />
            {totals.slice(1).map((t) => (
              <Money key={t.currency} amount={t.total} currency={t.currency} className="text-muted" />
            ))}
          </div>
          {overall ? (
            <>
              <BudgetBar usage={budgetUsage(mainTotal, Number(overall.monthly_amount))} color="#3f9d8c" label="Budget del mese" />
              <p className="text-sm text-muted">
                su un budget di <Money amount={overall.monthly_amount} currency={main} />
              </p>
            </>
          ) : (
            <p className="text-sm text-muted">
              Nessun budget totale. <TextLink href="/stanze/finanze/budget">Impostalo</TextLink>
            </p>
          )}
        </Card>
      </Section>

      <Section title="Progetti" action={<TextLink href="/stanze/finanze/budget#progetti">Tutti</TextLink>}>
        {activeGoals.length ? (
          <ul className="flex flex-col gap-2">
            {activeGoals.map((g) => {
              const estimate = addAmounts(g.estimate_lines.map((l) => l.amount));
              const spent = addAmounts(goalSpending.filter((s) => s.goal_id === g.id && s.currency === g.currency).map((s) => s.total));
              return (
                <li key={g.id}>
                  <Link href={`/stanze/finanze/budget/obiettivi/${g.id}`} className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4">
                    <span className="flex justify-between gap-2 font-medium">
                      {g.title}
                      <span className="text-sm font-normal text-muted">
                        <Money amount={spent} currency={g.currency} /> / <Money amount={estimate} currency={g.currency} />
                      </span>
                    </span>
                    {estimate > 0 ? <BudgetBar usage={budgetUsage(spent, estimate)} color="#7a6fd0" label={g.title} /> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState>Nessun progetto di spesa in corso.</EmptyState>
        )}
      </Section>
    </>
  );
}
