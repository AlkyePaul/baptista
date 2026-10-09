import "server-only";

import { z } from "zod";
import { isCivilDate, localDate, weekStart } from "@/lib/dates";
import { DomainError, throwIfDbError } from "@/lib/errors";
import type { Habit, HabitEntry } from "@/lib/db/types";
import type { ExecutionContext } from "@/lib/households/context";
import { visibilitySchema } from "@/lib/households/permissions";
import { categoryField } from "@/services/categories";
import { checkbox, PAGE_SIZE, requiredText, updateVersioned, versionField } from "@/services/shared";

export const habitSchema = z.object({
  title: requiredText(120, "Dai un nome all'abitudine."),
  target_per_week: z.coerce
    .number({ error: "Scegli quante volte a settimana." })
    .int()
    .min(1, "Almeno una volta a settimana.")
    .max(7, "Al massimo sette volte a settimana."),
  category_id: categoryField,
  visibility: visibilitySchema,
});

export const updateHabitSchema = habitSchema.extend({ active: checkbox, version: versionField });

export const entrySchema = z.object({
  day: z.string().refine(isCivilDate, "Data non valida."),
});

/** Category embedded through the FK; RLS lets members read the category of records they can read. */
export const HABIT_SELECT = "*, category:categories(id, name, color)";

export type HabitWeek = {
  habit: Habit;
  days: Set<string>;
  count: number;
  /** Shown capped at 100%; the real count is preserved. */
  percent: number;
  remaining: number;
};

export async function createHabit(ctx: ExecutionContext, input: z.infer<typeof habitSchema>) {
  const { error } = await ctx.supabase.from("habits").insert({
    household_id: ctx.household.id,
    ...input,
    starts_on: localDate(new Date(), ctx.household.timezone),
  });
  throwIfDbError(error);
}

export async function updateHabit(ctx: ExecutionContext, id: string, input: z.infer<typeof updateHabitSchema>) {
  const { version, ...patch } = input;
  await updateVersioned(ctx, "habits", id, version, patch);
}

export async function getHabit(ctx: ExecutionContext, id: string): Promise<Habit | null> {
  if (!z.uuid().safeParse(id).success) return null;
  const { data, error } = await ctx.supabase
    .from("habits")
    .select(HABIT_SELECT)
    .eq("id", id)
    .eq("household_id", ctx.household.id)
    .maybeSingle();
  throwIfDbError(error);
  return (data as Habit | null) ?? null;
}

export async function listHabits(ctx: ExecutionContext, { activeOnly = false } = {}): Promise<Habit[]> {
  let query = ctx.supabase.from("habits").select(HABIT_SELECT).eq("household_id", ctx.household.id);
  if (activeOnly) query = query.eq("active", true);
  const { data, error } = await query.order("active", { ascending: false }).order("created_at").limit(PAGE_SIZE);
  throwIfDbError(error);
  return (data ?? []) as Habit[];
}

/** Weekly progress (Monday–Sunday in the household timezone) with only *recorded* entries. */
export async function getHabitWeeks(ctx: ExecutionContext, habits: Habit[], today: string): Promise<HabitWeek[]> {
  if (!habits.length) return [];
  const start = weekStart(today);
  const { data, error } = await ctx.supabase
    .from("habit_entries")
    .select("id, habit_id, performed_on")
    .eq("household_id", ctx.household.id)
    .in("habit_id", habits.map((h) => h.id))
    .gte("performed_on", start)
    .lte("performed_on", today);
  throwIfDbError(error);
  const entries = (data ?? []) as HabitEntry[];
  return habits.map((habit) => {
    const days = new Set(entries.filter((e) => e.habit_id === habit.id).map((e) => e.performed_on));
    const count = days.size;
    return {
      habit,
      days,
      count,
      percent: Math.min(100, Math.round((100 * count) / habit.target_per_week)),
      remaining: Math.max(0, habit.target_per_week - count),
    };
  });
}

/** Idempotent toggle of a day's entry (one entry per habit per day). */
export async function toggleEntry(ctx: ExecutionContext, habitId: string, day: string) {
  const today = localDate(new Date(), ctx.household.timezone);
  if (day > today) throw new DomainError("future_entry");
  const { data: existing, error: readError } = await ctx.supabase
    .from("habit_entries")
    .select("id")
    .eq("household_id", ctx.household.id)
    .eq("habit_id", habitId)
    .eq("performed_on", day)
    .maybeSingle();
  throwIfDbError(readError);
  if (existing) {
    const { error } = await ctx.supabase.from("habit_entries").delete().eq("id", (existing as { id: string }).id);
    throwIfDbError(error);
    return false;
  }
  const { error } = await ctx.supabase
    .from("habit_entries")
    .insert({ household_id: ctx.household.id, habit_id: habitId, performed_on: day });
  // A concurrent identical insert is the same fact: treat the unique violation as success.
  if (error && error.code !== "23505") throwIfDbError(error);
  return true;
}
