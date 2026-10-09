/**
 * Goal arithmetic shared by UI and services. Mirrors `baptista.goal_percent` in SQL exactly:
 * progress = (current - start) / (target - start), floored and clamped to [0, 100].
 * Works for increasing goals (0 → 100 km) and decreasing ones (85 → 70 kg).
 */

export type GoalValues = { start_value: number | string; current_value: number | string; target_value: number | string };

export function goalPercent(goal: GoalValues): number {
  const start = Number(goal.start_value);
  const current = Number(goal.current_value);
  const target = Number(goal.target_value);
  if (![start, current, target].every(Number.isFinite) || target === start) return 0;
  return Math.max(0, Math.min(100, Math.floor((100 * (current - start)) / (target - start))));
}

export function isDecreasing(goal: GoalValues): boolean {
  return Number(goal.target_value) < Number(goal.start_value);
}

/** How much is left to reach the target (0 when reached or passed). */
export function goalRemaining(goal: GoalValues): number {
  const current = Number(goal.current_value);
  const target = Number(goal.target_value);
  const left = isDecreasing(goal) ? current - target : target - current;
  return Math.max(0, Math.round(left * 100) / 100);
}

/**
 * Parses numbers typed the Italian way: "85", "85,5", "1.250", "1.250,75", " 1 250 ".
 * A dot alone is a decimal separator only when it cannot be a thousands separator ("12.5").
 * Returns NaN for anything else, so validation can reject it.
 */
export function parseItalianNumber(raw: unknown): number {
  if (typeof raw === "number") return raw;
  if (typeof raw !== "string") return Number.NaN;
  const value = raw.trim().replace(/\s+/g, "");
  if (!value) return Number.NaN;
  let normalized: string;
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(value)) {
    normalized = value.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d+(,\d+)?$/.test(value)) {
    normalized = value.replace(",", ".");
  } else if (/^-?\d+\.\d+$/.test(value)) {
    normalized = value;
  } else {
    return Number.NaN;
  }
  return Number(normalized);
}

/** Display with Italian separators and at most two decimals: 1250.5 → "1.250,5". */
export function formatItalianNumber(value: number | string, grouping = true): string {
  return Number(value).toLocaleString("it-IT", { maximumFractionDigits: 2, useGrouping: grouping });
}
