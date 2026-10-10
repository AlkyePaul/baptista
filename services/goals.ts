import "server-only";

import { z } from "zod";
import { isCivilDate } from "@/lib/dates";
import { throwIfDbError } from "@/lib/errors";
import type { Goal } from "@/lib/db/types";
import { parseItalianNumber } from "@/lib/goals";
import type { ExecutionContext } from "@/lib/households/context";
import { visibilitySchema } from "@/lib/households/permissions";
import { categoryField } from "@/services/categories";
import { optionalText, PAGE_SIZE, requiredText, updateVersioned, versionField } from "@/services/shared";

const MAX_VALUE = 999_999_999_999.99; // numeric(14, 2)

/** Non-negative amount typed the Italian way ("85,5", "1.250"); at most two decimals. */
const amount = (label: string) =>
  z
    .unknown()
    .transform((v) => parseItalianNumber(v))
    .refine((n) => Number.isFinite(n), `${label}: inserisci un numero (es. 85 o 85,5).`)
    .refine((n) => n >= 0, `${label}: il valore non può essere negativo.`)
    .refine((n) => n <= MAX_VALUE, `${label}: numero troppo grande.`)
    .transform((n) => Math.round(n * 100) / 100);

const optionalAmount = (label: string) =>
  z.union([z.undefined(), amount(label)]);

const goalFields = {
  title: requiredText(120, "Inserisci l'obiettivo."),
  start_value: optionalAmount("Punto di partenza"),
  target_value: amount("Traguardo"),
  current_value: optionalAmount("Valore attuale"),
  unit: optionalText(20),
  target_date: z.string().refine(isCivilDate, "Data non valida.").optional().transform((v) => v ?? null),
  category_id: categoryField,
  /** C9: progress counted from this habit's entries; the database computes it. */
  habit_id: z.uuid({ error: "Abitudine non valida." }).optional().transform((v) => v ?? null),
  visibility: visibilitySchema,
};

/**
 * A goal goes from a start value to a target, up or down (85 → 70 kg is valid). The current value
 * defaults to the start value: a new goal is never shown as already completed.
 */
export const goalSchema = z
  .object(goalFields)
  .transform((g) => {
    const start = g.start_value ?? 0;
    return { ...g, start_value: start, current_value: g.current_value ?? start };
  })
  .superRefine((g, ctx) => {
    if (g.target_value === g.start_value) {
      ctx.addIssue({ code: "custom", path: ["target_value"], message: "Il traguardo deve essere diverso dal punto di partenza." });
    }
  });

export const updateGoalSchema = z
  .object({ ...goalFields, version: versionField })
  .transform((g) => {
    const start = g.start_value ?? 0;
    return { ...g, start_value: start, current_value: g.current_value ?? start };
  })
  .superRefine((g, ctx) => {
    if (g.target_value === g.start_value) {
      ctx.addIssue({ code: "custom", path: ["target_value"], message: "Il traguardo deve essere diverso dal punto di partenza." });
    }
  });

export const progressSchema = z.object({
  current_value: amount("Valore attuale"),
  version: versionField,
});

/** A goal linked to a habit has one source of progress: start and current values are not sent. */
function withoutManualProgress<T extends { habit_id: string | null; start_value: number; current_value: number }>(input: T) {
  if (!input.habit_id) return input;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- dropped on purpose
  const { start_value, current_value, ...rest } = input;
  return rest;
}

export async function createGoal(ctx: ExecutionContext, input: z.infer<typeof goalSchema>) {
  const { error } = await ctx.supabase.from("goals").insert({ household_id: ctx.household.id, ...withoutManualProgress(input) });
  throwIfDbError(error);
}

export async function updateGoal(ctx: ExecutionContext, id: string, input: z.infer<typeof updateGoalSchema>) {
  const { version, ...patch } = input;
  await updateVersioned(ctx, "goals", id, version, withoutManualProgress(patch));
}

/** The database emits `goal.progress_changed` when the value actually changes. */
export async function setGoalProgress(ctx: ExecutionContext, id: string, input: z.infer<typeof progressSchema>) {
  await updateVersioned(ctx, "goals", id, input.version, { current_value: input.current_value });
}

const GOAL_SELECT = "*, category:categories(id, name, color)";

/** Numeric columns arrive from PostgREST as strings or numbers: normalise once, here. */
function normalise(row: Record<string, unknown>): Goal {
  return {
    ...(row as Goal),
    start_value: Number(row.start_value),
    current_value: Number(row.current_value),
    target_value: Number(row.target_value),
  };
}

export async function listGoals(ctx: ExecutionContext, limit = PAGE_SIZE): Promise<Goal[]> {
  const { data, error } = await ctx.supabase
    .from("goals")
    .select(GOAL_SELECT)
    .eq("household_id", ctx.household.id)
    .order("created_at", { ascending: true })
    .limit(limit);
  throwIfDbError(error);
  return (data ?? []).map(normalise);
}

export async function getGoal(ctx: ExecutionContext, id: string): Promise<Goal | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const { data, error } = await ctx.supabase
    .from("goals")
    .select(GOAL_SELECT)
    .eq("id", id)
    .eq("household_id", ctx.household.id)
    .maybeSingle();
  throwIfDbError(error);
  return data ? normalise(data) : null;
}
