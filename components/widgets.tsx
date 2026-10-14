import Link from "next/link";
import { BudgetBar, Money } from "@/components/finance";
import { ProgressRing } from "@/components/progress-ring";
import { Card } from "@/components/ui";
import { localDate, monthOf } from "@/lib/dates";
import { formatItalianNumber } from "@/lib/goals";
import type { ExecutionContext } from "@/lib/households/context";
import { budgetUsage, totalsByCurrency } from "@/lib/money";
import { diaryTotals, targetProgress } from "@/lib/nutrition";
import { getKcalTarget, listDay } from "@/services/diet";
import { listBudgets, listMonthExpenses } from "@/services/finance";
import { listWardrobe, signedUrls } from "@/services/wardrobe";
import { WardrobeGrid } from "@/components/wardrobe-grid";

/**
 * Widget registry: maps widget IDs (from features.ts) to their async server components.
 * Each widget receives ExecutionContext and renders compact, self-contained content.
 * Every widget is wrapped in a try/catch so a failing widget shows a fallback
 * instead of crashing the entire page.
 */

function WidgetError({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="block">
      <Card className="flex items-center gap-3 p-4 text-sm text-muted">
        <span>{label}</span>
      </Card>
    </Link>
  );
}

export async function DietTodayWidget({ ctx }: { ctx: ExecutionContext }) {
  try {
    const today = localDate(new Date(), ctx.household.timezone);
    const [entries, target] = await Promise.all([listDay(ctx, today), getKcalTarget(ctx)]);
    const kcal = diaryTotals(entries).kcal;
    const progress = targetProgress(kcal, target);

    return (
      <Link href="/stanze/cucina/pasti" className="block">
        <Card className="flex items-center gap-4 p-4">
          <ProgressRing percent={progress.percent} color="#3f9d8c" label={`${kcal} kcal oggi`}>
            <span className="text-sm font-semibold">{formatItalianNumber(kcal)}</span>
          </ProgressRing>
          <span className="flex flex-col">
            <span className="text-sm font-medium">{formatItalianNumber(kcal)} kcal oggi</span>
            <span className="text-xs text-muted">
              {progress.left === null
                ? "Nessun obiettivo"
                : progress.left >= 0
                  ? `Restano ${formatItalianNumber(progress.left)} kcal`
                  : `${formatItalianNumber(-progress.left)} kcal oltre`}
            </span>
          </span>
        </Card>
      </Link>
    );
  } catch (e) {
    console.error("[widget] diet-today failed:", e);
    return <WidgetError href="/stanze/cucina/pasti" label="Diario alimentare" />;
  }
}

export async function FinanceMonthWidget({ ctx }: { ctx: ExecutionContext }) {
  try {
    const today = localDate(new Date(), ctx.household.timezone);
    const month = monthOf(today);
    const [expenses, budgets] = await Promise.all([listMonthExpenses(ctx, month), listBudgets(ctx)]);
    const totals = totalsByCurrency(expenses);
    const main = totals[0]?.currency ?? "EUR";
    const mainTotal = totals[0]?.total ?? 0;
    const overall = budgets.find((b) => b.category_id === null && b.currency === main);

    return (
      <Link href="/stanze/finanze/spese" className="block">
        <Card className="flex flex-col gap-2 p-4">
          <span className="flex items-baseline gap-2">
            <Money amount={mainTotal} currency={main} className="text-lg font-semibold" />
            <span className="text-xs text-muted">questo mese</span>
          </span>
          {overall ? (
            <BudgetBar
              usage={budgetUsage(mainTotal, Number(overall.monthly_amount))}
              color="#3f9d8c"
              label="Budget del mese"
            />
          ) : null}
        </Card>
      </Link>
    );
  } catch (e) {
    console.error("[widget] finance-month failed:", e);
    return <WidgetError href="/stanze/finanze/spese" label="Spese del mese" />;
  }
}

export async function WardrobeRecentWidget({ ctx }: { ctx: ExecutionContext }) {
  try {
    const items = await listWardrobe(ctx);
    const recent = items.slice(0, 4);
    if (!recent.length) {
      return (
        <Link href="/stanze/guardaroba/capi" className="block">
          <Card className="p-4 text-center text-sm text-muted">
            Nessun capo nel guardaroba.
          </Card>
        </Link>
      );
    }
    const urls = await signedUrls(ctx, recent.map((i) => i.thumb_path));

    return (
      <div>
        <WardrobeGrid items={recent} urls={urls} />
      </div>
    );
  } catch (e) {
    console.error("[widget] wardrobe-recent failed:", e);
    return <WidgetError href="/stanze/guardaroba/capi" label="Guardaroba" />;
  }
}

/** Renders the appropriate widget for a given widgetId. Returns null if unknown. */
export async function Widget({ widgetId, ctx }: { widgetId: string; ctx: ExecutionContext }) {
  switch (widgetId) {
    case "diet-today":
      return <DietTodayWidget ctx={ctx} />;
    case "finance-month":
      return <FinanceMonthWidget ctx={ctx} />;
    case "wardrobe-recent":
      return <WardrobeRecentWidget ctx={ctx} />;
    default:
      return null;
  }
}
