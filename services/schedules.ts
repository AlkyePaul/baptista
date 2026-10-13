import "server-only";

import { z } from "zod";
import { DomainError, throwIfDbError } from "@/lib/errors";
import type { Meal, MealSchedule } from "@/lib/db/types";
import type { ExecutionContext } from "@/lib/households/context";
import { SLOTS } from "@/lib/nutrition";
import { FOOD_SELECT, normaliseFood } from "@/services/catalog";
import { listMealItems } from "@/services/meals";
import { portion } from "@/lib/nutrition";

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
export async function listActiveSchedules(ctx: ExecutionContext, isoWeekday: number): Promise<ScheduleWithMeal[]> {
  const { data, error } = await ctx.supabase
    .from("meal_schedules")
    .select("*, meal:meals(id, title)")
    .eq("household_id", ctx.household.id)
    .eq("owner_user_id", ctx.user.id)
    .eq("active", true)
    .contains("weekdays", [isoWeekday]);
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

/**
 * Confirm a scheduled meal: create one diet_entry per meal_item, each with the schedule_id.
 * Returns the number of entries created.
 */
export async function confirmSchedule(
  ctx: ExecutionContext,
  scheduleId: string,
  day: string,
  slot: string,
): Promise<number> {
  // Load the schedule
  const { data: schedule, error: schedErr } = await ctx.supabase
    .from("meal_schedules")
    .select("*, meal:meals(id, title)")
    .eq("id", scheduleId)
    .eq("household_id", ctx.household.id)
    .eq("owner_user_id", ctx.user.id)
    .maybeSingle();
  throwIfDbError(schedErr);
  if (!schedule) throw new DomainError("not_found");

  const mealId = (schedule as unknown as ScheduleWithMeal).meal.id;
  const items = await listMealItems(ctx, [mealId]);
  if (!items.length) throw new DomainError("invalid", "Il pasto non ha alimenti.");

  const rows = items
    .filter((item) => item.food.kcal_100g !== null)
    .map((item) => {
      const t = portion({ ...item.food, kcal_100g: item.food.kcal_100g! }, item.grams);
      return {
        household_id: ctx.household.id,
        eaten_on: day,
        slot,
        label: item.food.name,
        grams: item.grams || null,
        kcal: t.kcal,
        protein_g: t.protein,
        carbs_g: t.carbs,
        fat_g: t.fat,
        meal_id: mealId,
        schedule_id: scheduleId,
      };
    });

  if (!rows.length) throw new DomainError("invalid", "Nessun alimento con calorie note nel pasto.");

  const { error } = await ctx.supabase.from("diet_entries").insert(rows);
  throwIfDbError(error);
  return rows.length;
}
