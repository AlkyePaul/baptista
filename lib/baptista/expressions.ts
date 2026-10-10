/**
 * Baptista's four expressions (B-1). One module maps a deterministic state to an expression:
 * never chosen at random. Assets: public/icons/baptista-icons/ (WebP derived at 192/384 px).
 */

export const EXPRESSIONS = ["alert", "thoughtful", "suggestion", "confirmation"] as const;
export type Expression = (typeof EXPRESSIONS)[number];

/** Short Italian description for screen readers (the image itself is decorative next to the text). */
export const EXPRESSION_ALT: Record<Expression, string> = {
  alert: "Baptista alza l'indice",
  thoughtful: "Baptista riflette",
  suggestion: "Baptista porge una proposta",
  confirmation: "Baptista fa un piccolo inchino",
};

export function expressionSrc(expression: Expression, size: 192 | 384 = 192): string {
  return `/icons/baptista-icons/baptista-${expression}-${size}.webp`;
}

/** Steps of a micro-conversation that change the face (B-3). */
export type ConversationPhase = "opening" | "proposing" | "done" | "failed";

/** Observation types whose opening is a known, relevant fact. */
const ALERTS = new Set(["food_expiry", "overdue_task", "budget_threshold", "calendar_overlap", "upcoming_calendar", "staples_missing"]);
/** Questions, or data that is only an estimate. */
const THOUGHTFUL = new Set(["wardrobe_acquisition", "old_food", "food_opened", "missed_habit", "staple_suggestion"]);

export function expressionFor(
  type: string,
  phase: ConversationPhase,
  facts: { estimated?: boolean; celebrate?: boolean } = {},
): Expression {
  if (phase === "done") return "confirmation";
  if (phase === "failed") return "thoughtful";
  if (phase === "proposing") return "suggestion";
  if (facts.celebrate) return "confirmation";
  if (facts.estimated) return "thoughtful";
  if (ALERTS.has(type)) return "alert";
  if (THOUGHTFUL.has(type)) return "thoughtful";
  return "suggestion";
}
