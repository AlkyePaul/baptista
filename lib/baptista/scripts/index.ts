/**
 * Registry: observation type → script (B-3). Every type the detectors produce has exactly one
 * script; the server executes only the options declared here (services/baptista.ts).
 */

import type { RoomId } from "@/lib/rooms";
import { expressionFor, type Expression } from "../expressions";
import { pick } from "../select";
import { dietLog, foodCheck, foodExpiry, restock, shoppingExpense, stapleSuggestion, staplesMissing } from "./kitchen";
import { calendarOverlap, goalProgress, habitProgress, missedHabit, overdueTask, upcomingCalendar } from "./living";
import type { ObservationInput, OptionSpec, Script, VoiceContext } from "./types";
import { budgetThreshold, wardrobeAcquisition, wardrobeFromExpense } from "./wardrobe-finance";

export type { FieldSpec, ObservationInput, OptionSpec, Script, VoiceContext } from "./types";

export const SCRIPTS: Record<string, Script> = {
  food_expiry: foodExpiry,
  old_food: foodCheck,
  food_opened: foodCheck,
  restock_question: restock,
  diet_log_question: dietLog,
  shopping_expense_question: shoppingExpense,
  staple_suggestion: stapleSuggestion,
  staples_missing: staplesMissing,
  overdue_task: overdueTask,
  upcoming_calendar: upcomingCalendar,
  calendar_overlap: calendarOverlap,
  habit_progress: habitProgress,
  missed_habit: missedHabit,
  goal_progress: goalProgress,
  wardrobe_acquisition: wardrobeAcquisition,
  wardrobe_from_expense: wardrobeFromExpense,
  budget_threshold: budgetThreshold,
};

/** Connection questions (A-3): placed first right after the user's gesture. */
export const QUESTION_TYPES = new Set([
  "wardrobe_acquisition",
  "shopping_expense_question",
  "restock_question",
  "diet_log_question",
  "wardrobe_from_expense",
  "staple_suggestion",
]);

/** What Baptista says when opening a conversation, ready to render. */
export type Opening = {
  text: string;
  /** Template id shown (type + alternative index), remembered per viewer. */
  variant: string;
  expression: Expression;
  options: OptionSpec[];
  detail: string | null;
  room: RoomId;
};

/** Pure: same observation, viewer and day → same sentence on every device. */
export function openingFor(o: ObservationInput, v: VoiceContext): Opening | null {
  const script = SCRIPTS[o.type];
  if (!script) return null;
  const alternatives = script.opening(o, v).filter((t) => t.trim().length > 0);
  if (!alternatives.length) return null;
  const { value, index } = pick(alternatives, `${o.dedupe_key}|${v.today}`);
  return {
    text: value,
    variant: `${o.type}:${index}`,
    expression: expressionFor(o.type, "opening", script.facts?.(o)),
    options: script.options(o, v),
    detail: script.detail?.(o) ?? null,
    room: script.room,
  };
}

/** Texts after a successful action (B-3): only shown when the server answered ok. */
export const DONE_TEXT: Record<string, string> = {
  "food:eaten": "Fatto, segnato come consumato.",
  "food:thrown": "Fatto, segnato come buttato.",
  "task:done": "Fatto. Una cosa in meno.",
  "task:tomorrow": "Spostata a domani.",
  "habit:today": "Segnato. Un passo in più.",
  "restock:add": "Aggiunto alla Lista della spesa.",
  "staple:yes": "Segnato come abituale. Ti avviso quando manca.",
  "staple:never": "Va bene, non te lo chiedo più.",
  "staples:add": "Aggiunti alla Lista della spesa.",
  "wardrobe:owned": "Va bene, era già tuo.",
  "wardrobe:gift": "Un regalo: segnato.",
};

export const ERROR_TEXT = {
  failed: "Non sono riuscito a farlo. Riprovo?",
  conflict: "Qualcuno l'ha appena modificato. Ricarico la situazione.",
} as const;
