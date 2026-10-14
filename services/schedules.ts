import "server-only";

import { z } from "zod";
import { DomainError, throwIfDbError } from "@/lib/errors";
import type { DietEntrySkip, Meal, MealSchedule } from "@/lib/db/types";
import type { ExecutionContext } from "@/lib/households/context";
import { SLOTS, portion } from "@/lib/nutrition";
import { addDays, isoWeekday } from "@/lib/dates";
import { listMealItems } from "@/services/meals";

const slot = z.enum(SLOTS.map((s) => s.id) as ["breakfast", "lunch", "dinner", "snack"], { error: "Scegli il pasto." });

export const scheduleSchema = z.object({
  meal_id: z.uuid({ error: "Scegli un pasto." }),
  slot,
  weekdays: z
    .array(z.coerce.number().int().min(1).max(7))
    .min(1, "Scegli almeno un giorno.")
    .max(7),
});

export async function createSchedule(ctx: ExecutionContext, input: z.infer<typeof scheduleSchema>): Promise<string> {
  const { data, error } = await ctx.supabase
    .from("meal_schedules")
    .insert({
      household_id: ctx.household.id,
      meal_id: input.meal_id,
      slot: input.slot,
      weekdays: input.weekdays,
    })
    .select("id")
    .single();
  throwIfDbError(error);
  return (data as { id: string }).id;
}

export async function deleteSchedule(ctx: ExecutionContext, id: string) {
  const { data, error } = await ctx.supabase
    .from("meal_schedules")
    .delete()
    .eq("id", id)
    .eq("household_id", ctx.household.id)
    .select("id");
  throwIfDbError(error);
  if (!data?.length) throw new DomainError("not_found");
}

export type ScheduleWithMeal = MealSchedule & { meal: Pick<Meal, "id" | "title"> };

/** Active schedules for a given ISO weekday (1=Mon … 7=Sun). */
export async function listActiveSchedules(ctx: ExecutionContext, wday: number): Promise<ScheduleWithMeal[]> {
  const { data, error } = await ctx.supabase
    .from("meal_schedules")
    .select("*, meal:meals(id, title)")
    .eq("household_id", ctx.household.id)
    .eq("owner_user_id", ctx.user.id)
    .eq("active", true)
    .contains("weekdays", [wday]);
  throwIfDbError(error);
  return (data ?? []) as unknown as ScheduleWithMeal[];
}

/** All active schedules for the user (for materialization). */
async function listAllActiveSchedules(ctx: ExecutionContext): Promise<ScheduleWithMeal[]> {
  const { data, error } = await ctx.supabase
    .from("meal_schedules")
    .select("*, meal:meals(id, title)")
    .eq("household_id", ctx.household.id)
    .eq("owner_user_id", ctx.user.id)
    .eq("active", true);
  throwIfDbError(error);
  return (data ?? []) as unknown as ScheduleWithMeal[];
}

/** List schedules for a specific meal. */
export async function listMealSchedules(ctx: ExecutionContext, mealId: string): Promise<MealSchedule[]> {
  const { data, error } = await ctx.supabase
    .from("meal_schedules")
    .select("*")
    .eq("household_id", ctx.household.id)
    .eq("owner_user_id", ctx.user.id)
    .eq("meal_id", mealId)
    .eq("active", true);
  throwIfDbError(error);
  return (data ?? []) as MealSchedule[];
}

// ── Skip management ─────────────────────────────────────────────────────

/** Record that a recurring meal occurrence was skipped for a specific day. */
export async function skipScheduleDay(ctx: ExecutionContext, scheduleId: string, day: string) {
  const { error } = await ctx.supabase.from("diet_entry_skips").insert({
    household_id: ctx.household.id,
    schedule_id: scheduleId,
    skipped_on: day,
  });
  // Ignore unique constraint violations (already skipped)
  if (error && !error.message.includes("duplicate key")) throwIfDbError(error);
}

/** List skips for a date range. */
async function listSkips(ctx: ExecutionContext, from: string, to: string): Promise<DietEntrySkip[]> {
  const { data, error } = await ctx.supabase
    .from("diet_entry_skips")
    .select("*")
    .eq("household_id", ctx.household.id)
    .eq("owner_user_id", ctx.user.id)
    .gte("skipped_on", from)
    .lte("skipped_on", to);
  throwIfDbError(error);
  return (data ?? []) as DietEntrySkip[];
}

// ── Concurrency-safe materialization ────────────────────────────────────

/**
 * Materialize recurring meal entries for a rolling window of days.
 *
 * Concurrency safety relies on the `diet_materializations` table whose PK is
 * `(owner_user_id, schedule_id, materialized_on)`.  For each candidate pair the
 * function attempts an INSERT.  If two devices hit the same pair at the same
 * time, only one INSERT wins — the other gets a PK conflict and is silently
 * skipped, so the diet_entries are created exactly once.
 *
 * Skip records (`diet_entry_skips`) are checked first: a day the user explicitly
 * removed is never re-materialized regardless of the marker table.
 *
 * Returns the number of new diet_entries created.
 */
export async function materializeSchedules(
  ctx: ExecutionContext,
  from: string,
  to: string,
): Promise<number> {
  const schedules = await listAllActiveSchedules(ctx);
  if (!schedules.length) return 0;

  // Load skips for the window
  const skips = await listSkips(ctx, from, to);
  const skippedSet = new Set(skips.map((s) => `${s.schedule_id}:${s.skipped_on}`));

  // Determine all candidate (schedule, day) pairs
  type Candidate = { schedule: ScheduleWithMeal; day: string };
  const candidates: Candidate[] = [];

  for (const schedule of schedules) {
    let day = from;
    while (day <= to) {
      const wday = isoWeekday(day);
      if (schedule.weekdays.includes(wday) && !skippedSet.has(`${schedule.id}:${day}`)) {
        candidates.push({ schedule, day });
      }
      day = addDays(day, 1);
    }
  }
  if (!candidates.length) return 0;

  // Try to claim each candidate via the materializations table.
  // The PK prevents any concurrent request from claiming the same pair.
  const claimed: Candidate[] = [];

  for (const c of candidates) {
    const { data, error } = await ctx.supabase
      .from("diet_materializations")
      .insert({ schedule_id: c.schedule.id, materialized_on: c.day })
      .select("schedule_id")
      .maybeSingle();

    // PK conflict → already materialized (by us or another request).  Skip.
    if (error) {
      if (error.code === "23505") continue; // unique_violation
      throwIfDbError(error);
    }
    if (data) claimed.push(c);
  }

  if (!claimed.length) return 0;

  // Load meal items for claimed meals (deduplicated)
  const mealIds = [...new Set(claimed.map((c) => c.schedule.meal.id))];
  const allItems = await listMealItems(ctx, mealIds);
  const itemsByMeal = new Map<string, typeof allItems>();
  for (const id of mealIds) {
    itemsByMeal.set(id, allItems.filter((i) => i.meal_id === id));
  }

  // Build diet_entry rows
  const rows: Array<Record<string, unknown>> = [];
  for (const { schedule, day } of claimed) {
    const items = itemsByMeal.get(schedule.meal.id) ?? [];
    for (const item of items.filter((i) => i.food.kcal_100g !== null && i.grams > 0)) {
      const t = portion({ ...item.food, kcal_100g: item.food.kcal_100g! }, item.grams);
      rows.push({
        household_id: ctx.household.id,
        eaten_on: day,
        slot: schedule.slot,
        food_id: item.food_id,
        label: item.food.name,
        grams: item.grams || null,
        kcal: t.kcal,
        protein_g: t.protein,
        carbs_g: t.carbs,
        fat_g: t.fat,
        meal_id: schedule.meal.id,
        schedule_id: schedule.id,
      });
    }
  }

  if (!rows.length) return 0;

  // Insert in batches
  let created = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    const { error } = await ctx.supabase.from("diet_entries").insert(batch);
    throwIfDbError(error);
    created += batch.length;
  }
  return created;
}

// ── Delete with skip ────────────────────────────────────────────────────

/**
 * Delete a diet entry.  If it came from a recurring schedule, also record a
 * skip so the materializer never re-creates it.
 */
export async function deleteDietEntryWithSkip(ctx: ExecutionContext, entryId: string) {
  const { data: entry, error: fetchErr } = await ctx.supabase
    .from("diet_entries")
    .select("id, schedule_id, eaten_on")
    .eq("id", entryId)
    .eq("household_id", ctx.household.id)
    .eq("owner_user_id", ctx.user.id)
    .maybeSingle();
  throwIfDbError(fetchErr);
  if (!entry) throw new DomainError("not_found");

  const { error: delErr } = await ctx.supabase
    .from("diet_entries")
    .delete()
    .eq("id", entryId)
    .eq("household_id", ctx.household.id)
    .eq("owner_user_id", ctx.user.id);
  throwIfDbError(delErr);

  // If this was a recurring entry, record a skip once the last entry for
  // this schedule+day is gone.
  if (entry.schedule_id) {
    const { data: remaining } = await ctx.supabase
      .from("diet_entries")
      .select("id")
      .eq("household_id", ctx.household.id)
      .eq("owner_user_id", ctx.user.id)
      .eq("schedule_id", entry.schedule_id)
      .eq("eaten_on", entry.eaten_on)
      .limit(1);

    if (!remaining?.length) {
      await skipScheduleDay(ctx, entry.schedule_id, entry.eaten_on);
    }
  }
}

// ── Save as recurring ───────────────────────────────────────────────────

/**
 * Create a saved meal from the current diet entries in a slot+day, then
 * schedule it as recurring on the selected weekdays.
 *
 * Returns the new schedule ID.
 */
export async function saveSlotAsRecurring(
  ctx: ExecutionContext,
  input: { day: string; slotId: string; title: string; weekdays: number[] },
): Promise<string> {
  const { day, slotId, title, weekdays } = input;

  // Fetch entries for this slot+day
  const { data: entries, error: entriesErr } = await ctx.supabase
    .from("diet_entries")
    .select("food_id, label, grams, kcal")
    .eq("household_id", ctx.household.id)
    .eq("owner_user_id", ctx.user.id)
    .eq("eaten_on", day)
    .eq("slot", slotId)
    .not("food_id", "is", null)
    .order("created_at");
  throwIfDbError(entriesErr);

  if (!entries?.length) throw new DomainError("invalid", "Nessun alimento con dati nel catalogo in questo pasto.");

  // Create the saved meal
  const { data: meal, error: mealErr } = await ctx.supabase
    .from("meals")
    .insert({ household_id: ctx.household.id, title })
    .select("id")
    .single();
  throwIfDbError(mealErr);
  const mealId = (meal as { id: string }).id;

  // Create meal items from the entries (only entries with food_id)
  const mealItems = (entries as Array<{ food_id: string; grams: number | null }>).map((e, i) => ({
    household_id: ctx.household.id,
    meal_id: mealId,
    food_id: e.food_id,
    grams: e.grams ?? 0,
    position: i + 1,
  }));
  const { error: itemsErr } = await ctx.supabase.from("meal_items").insert(mealItems);
  throwIfDbError(itemsErr);

  // Create the schedule
  const { data: sched, error: schedErr } = await ctx.supabase
    .from("meal_schedules")
    .insert({
      household_id: ctx.household.id,
      meal_id: mealId,
      slot: slotId,
      weekdays,
    })
    .select("id")
    .single();
  throwIfDbError(schedErr);
  return (sched as { id: string }).id;
}
