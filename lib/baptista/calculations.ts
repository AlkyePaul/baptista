/**
 * Calculations on request from the Baptista tab (B-6, B-7 spending_comparison): exact sums, then
 * a sentence from a template. Pure; amounts are never summed across currencies.
 */

import { formatMonth } from "@/lib/dates";
import { formatMoney, totalsByCurrency } from "@/lib/money";

export type Spend = { occurred_on: string; currency: string; total: number | string; category_id: string | null };

/** «Questo mese in Spesa alimentare: 234,50 €.» */
export function categorySentence(rows: Spend[], categoryId: string | null, categoryName: string): string {
  const totals = totalsByCurrency(rows.filter((r) => r.category_id === categoryId));
  if (!totals.length) return `Questo mese non c'è ancora nessuna spesa in ${categoryName}.`;
  return `Questo mese in ${categoryName}: ${totals.map((t) => formatMoney(t.total, t.currency)).join(" e ")}.`;
}

/**
 * Month to date vs the previous month up to the same day of the month (per currency).
 * @param today local civil date
 */
export function spendingComparison(current: Spend[], previous: Spend[], today: string, previousMonth: string): string {
  const day = Number(today.slice(8, 10));
  const name = formatMonth(previousMonth).split(" ")[0];
  const now = totalsByCurrency(current.filter((r) => r.occurred_on <= today));
  const before = totalsByCurrency(previous.filter((r) => Number(r.occurred_on.slice(8, 10)) <= day));
  if (!now.length && !before.length) return "Non ci sono spese registrate fino a oggi, né questo mese né il precedente.";
  const parts = (now.length ? now : before).map((t) => {
    const cur = now.find((x) => x.currency === t.currency)?.total ?? 0;
    const old = before.find((x) => x.currency === t.currency)?.total ?? 0;
    if (old === 0) return `finora ${formatMoney(cur, t.currency)}; a ${name}, allo stesso punto, non c'era nessuna spesa`;
    const pct = Math.round(((cur - old) / old) * 100);
    if (pct === 0) return `finora ${formatMoney(cur, t.currency)}, come ${name} allo stesso punto`;
    return `finora ${formatMoney(cur, t.currency)}, ${Math.abs(pct)}% ${pct > 0 ? "in più" : "in meno"} di ${name} allo stesso punto`;
  });
  const sentence = parts.join("; ");
  return sentence.charAt(0).toUpperCase() + sentence.slice(1) + ".";
}
