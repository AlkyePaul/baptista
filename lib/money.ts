/**
 * Money helpers (Finanze, D26). Amounts are kept per ISO currency: nothing here ever adds two
 * different currencies together (DATABASE.md), there is no declared conversion.
 */

export const CURRENCIES = ["EUR", "CHF", "USD", "GBP"] as const;

/** Cents-exact sum (amounts have at most two decimals). */
export function addAmounts(values: Array<number | string>): number {
  return values.reduce<number>((acc, v) => acc + Math.round(Number(v) * 100), 0) / 100;
}

/** Totals grouped by currency, largest first. */
export function totalsByCurrency(rows: Array<{ currency: string; total: number | string }>): Array<{ currency: string; total: number }> {
  const map = new Map<string, number[]>();
  for (const row of rows) map.set(row.currency, [...(map.get(row.currency) ?? []), Number(row.total)]);
  return [...map.entries()]
    .map(([currency, values]) => ({ currency, total: addAmounts(values) }))
    .sort((a, b) => b.total - a.total || a.currency.localeCompare(b.currency));
}

export function formatMoney(amount: number | string, currency: string): string {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    Number(amount),
  );
}

export type BudgetUsage = { spent: number; budget: number; percent: number; left: number; over: boolean };

/** Spent vs monthly budget in one currency; percent is capped at 100 for drawing only. */
export function budgetUsage(spent: number, budget: number): BudgetUsage {
  const left = addAmounts([budget, -spent]);
  return {
    spent,
    budget,
    percent: budget > 0 ? Math.max(0, Math.min(100, Math.round((100 * spent) / budget))) : 0,
    left,
    over: spent > budget,
  };
}

/**
 * Pace of the month: share of the month elapsed on `today` (inclusive). Used to say "in linea"
 * vs "sopra il ritmo" without predicting anything.
 */
export function monthElapsedShare(today: string): number {
  const [y, m, d] = today.split("-").map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return d / days;
}

/** First and last civil day of a `YYYY-MM` month. */
export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(days).padStart(2, "0")}` };
}

/**
 * Lines typed as text, one per line, amount at the end: "Volo 300", "Hotel: 1.250,50".
 * Returns the parsed lines and the 1-based numbers of the lines that could not be read.
 */
export function parseEstimateLines(text: string, parse: (raw: string) => number): { lines: Array<{ label: string; amount: number }>; invalid: number[] } {
  const lines: Array<{ label: string; amount: number }> = [];
  const invalid: number[] = [];
  text.split(/\r?\n/).forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    const match = /^(.*?)[\s:=-]+(\d[\d.,\s]*)\s*(€|eur|euro)?$/i.exec(line);
    const amount = match ? parse(match[2]) : Number.NaN;
    const label = match?.[1].trim().replace(/[:=-]+$/, "").trim() ?? "";
    if (!match || !label || !Number.isFinite(amount) || amount < 0) invalid.push(i + 1);
    else lines.push({ label: label.slice(0, 120), amount: Math.round(amount * 100) / 100 });
  });
  return { lines, invalid };
}
