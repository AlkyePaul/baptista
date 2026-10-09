import "server-only";

import { z } from "zod";
import { isCivilDate } from "@/lib/dates";
import { throwIfDbError } from "@/lib/errors";
import type { Task } from "@/lib/db/types";
import type { ExecutionContext } from "@/lib/households/context";
import { visibilitySchema } from "@/lib/households/permissions";
import { optionalText, PAGE_SIZE, requiredText, updateVersioned, versionField } from "@/services/shared";

export const taskSchema = z.object({
  title: requiredText(200, "Scrivi cosa c'è da fare."),
  notes: optionalText(2000),
  due_date: z.string().refine(isCivilDate, "Data non valida.").optional().transform((v) => v ?? null),
  visibility: visibilitySchema,
});

export const updateTaskSchema = taskSchema.extend({ version: versionField });

export async function createTask(ctx: ExecutionContext, input: z.infer<typeof taskSchema>) {
  const { error } = await ctx.supabase.from("tasks").insert({ household_id: ctx.household.id, ...input });
  throwIfDbError(error);
}

export async function updateTask(ctx: ExecutionContext, id: string, input: z.infer<typeof updateTaskSchema>) {
  const { version, ...patch } = input;
  await updateVersioned(ctx, "tasks", id, version, patch);
}

/** Completion/reopen; the database emits `task.completed` in the same transaction. */
export async function setTaskStatus(ctx: ExecutionContext, id: string, version: number, completed: boolean) {
  await updateVersioned(ctx, "tasks", id, version, { status: completed ? "completed" : "open" });
}

export async function listOpenTasks(ctx: ExecutionContext, limit = PAGE_SIZE): Promise<Task[]> {
  const { data, error } = await ctx.supabase
    .from("tasks")
    .select("*")
    .eq("household_id", ctx.household.id)
    .eq("status", "open")
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: true })
    .limit(limit);
  throwIfDbError(error);
  return (data ?? []) as Task[];
}

export async function listRecentlyCompleted(ctx: ExecutionContext, limit = 10): Promise<Task[]> {
  const { data, error } = await ctx.supabase
    .from("tasks")
    .select("*")
    .eq("household_id", ctx.household.id)
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(limit);
  throwIfDbError(error);
  return (data ?? []) as Task[];
}

/** Tasks (open and completed) with a due date in [fromDay, toDay] (inclusive, civil dates). */
export async function listTasksDueBetween(ctx: ExecutionContext, fromDay: string, toDay: string): Promise<Task[]> {
  const { data, error } = await ctx.supabase
    .from("tasks")
    .select("*")
    .eq("household_id", ctx.household.id)
    .gte("due_date", fromDay)
    .lte("due_date", toDay)
    .order("due_date")
    .order("status")
    .limit(500);
  throwIfDbError(error);
  return (data ?? []) as Task[];
}
