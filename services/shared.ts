import "server-only";

import { z } from "zod";
import { isCivilDate } from "@/lib/dates";
import { DomainError, throwIfDbError, type ActionState } from "@/lib/errors";
import { parseItalianNumber } from "@/lib/goals";
import type { ExecutionContext } from "@/lib/households/context";

export const PAGE_SIZE = 50;

type Parsed<T> = { ok: true; data: T } | { ok: false; state: ActionState };

/** Validates FormData with a zod schema; empty strings become `undefined`. */
export function parseForm<S extends z.ZodType>(schema: S, formData: FormData): Parsed<z.infer<S>> {
  const raw: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("$")) continue; // React internal fields
    const v = typeof value === "string" && value.trim() === "" ? undefined : value;
    if (v === undefined) continue;
    // Repeated keys (checkbox groups) become arrays.
    raw[key] = key in raw ? [...(Array.isArray(raw[key]) ? (raw[key] as unknown[]) : [raw[key]]), v] : v;
  }
  const result = schema.safeParse(raw);
  if (result.success) return { ok: true, data: result.data };
  const fieldErrors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? "_");
    fieldErrors[key] ??= issue.message;
  }
  return { ok: false, state: { ok: false, message: "Controlla i campi evidenziati.", fieldErrors } };
}

export const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());
export const optionalText = (max: number) =>
  z.string().trim().max(max, `Massimo ${max} caratteri.`).optional().transform((v) => v || null);
export const requiredText = (max: number, label = "Campo obbligatorio.") =>
  z.string({ error: label }).trim().min(1, label).max(max, `Massimo ${max} caratteri.`);
export const versionField = z.coerce.number().int().positive();

/**
 * Number typed the Italian way ("85,5", "1.250"), within [min, max], rounded to `decimals`.
 * Empty input is `undefined` (see parseForm), so wrap with `.optional()` when not required.
 */
export const decimal = (label: string, { min = 0, max = 999_999_999, decimals = 2, exclusiveMin = false } = {}) =>
  z
    .unknown()
    .refine((v) => v !== undefined, `${label}: campo obbligatorio.`)
    .transform((v) => parseItalianNumber(v))
    .refine((n) => Number.isFinite(n), `${label}: inserisci un numero (es. 12 o 12,5).`)
    .refine((n) => (exclusiveMin ? n > min : n >= min), `${label}: valore troppo basso.`)
    .refine((n) => n <= max, `${label}: valore troppo alto.`)
    .transform((n) => Math.round(n * 10 ** decimals) / 10 ** decimals);

export const optionalDecimal = (label: string, options?: Parameters<typeof decimal>[1]) =>
  z.union([z.undefined(), decimal(label, options)]).transform((v) => (v === undefined ? null : v));

export const civilDate = (message = "Data non valida.") => z.string().refine(isCivilDate, message);
export const optionalCivilDate = civilDate().optional().transform((v) => v ?? null);

export type Table =
  | "calendar_events"
  | "tasks"
  | "notes"
  | "goals"
  | "habits"
  | "food_items"
  | "meals"
  | "recipes"
  | "diet_entries"
  | "expenses"
  | "finance_goals"
  | "wardrobe_items"
  | "looks"
  | "meal_schedules";

/** Optimistic update scoped to the current household; 0 rows means changed, gone or forbidden. */
export async function updateVersioned(
  ctx: ExecutionContext,
  table: Table,
  id: string,
  version: number,
  patch: Record<string, unknown>,
) {
  const { data, error } = await ctx.supabase
    .from(table)
    .update(patch)
    .eq("id", id)
    .eq("household_id", ctx.household.id)
    .eq("version", version)
    .select("id");
  throwIfDbError(error);
  if (!data?.length) throw new DomainError("conflict");
}

export async function deleteRecord(ctx: ExecutionContext, table: Table, id: string) {
  const { data, error } = await ctx.supabase
    .from(table)
    .delete()
    .eq("id", id)
    .eq("household_id", ctx.household.id)
    .select("id");
  throwIfDbError(error);
  if (!data?.length) throw new DomainError("not_found");
}

export async function getRecord<T>(ctx: ExecutionContext, table: Table, id: string): Promise<T | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const { data, error } = await ctx.supabase
    .from(table)
    .select("*")
    .eq("id", id)
    .eq("household_id", ctx.household.id)
    .maybeSingle();
  throwIfDbError(error);
  return (data as T | null) ?? null;
}
