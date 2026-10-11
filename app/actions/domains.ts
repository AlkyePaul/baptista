"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { run } from "@/lib/actions";
import type { ActionState } from "@/lib/errors";
import { requireExecutionContext } from "@/lib/households/context";
import { uuidSchema } from "@/lib/households/permissions";
import * as calendar from "@/services/calendar";
import * as goals from "@/services/goals";
import * as habits from "@/services/habits";
import * as notes from "@/services/notes";
import { deleteRecord, parseForm } from "@/services/shared";
import * as tasks from "@/services/tasks";

const id = (value: string) => uuidSchema.parse(value);
const version = (value: number) => z.number().int().positive().parse(value);

// Calendar -----------------------------------------------------------------------------------

export async function createEventAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(calendar.calendarEventSchema, formData);
  if (!parsed.ok) return parsed.state;
  const ctx = await requireExecutionContext();
  return run(() => calendar.createCalendarEvent(ctx, parsed.data), "Evento aggiunto.");
}

export async function updateEventAction(eventId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(calendar.updateCalendarEventSchema, formData);
  if (!parsed.ok) return parsed.state;
  const ctx = await requireExecutionContext();
  const state = await run(() => calendar.updateCalendarEvent(ctx, id(eventId), parsed.data));
  if (state.ok) redirect(`/calendario?giorno=${parsed.data.all_day ? parsed.data.start_date : parsed.data.starts_at!.slice(0, 10)}`);
  return state;
}

// Tasks --------------------------------------------------------------------------------------

export async function createTaskAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(tasks.taskSchema, formData);
  if (!parsed.ok) return parsed.state;
  const ctx = await requireExecutionContext();
  return run(() => tasks.createTask(ctx, parsed.data));
}

export async function updateTaskAction(taskId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(tasks.updateTaskSchema, formData);
  if (!parsed.ok) return parsed.state;
  const ctx = await requireExecutionContext();
  const state = await run(() => tasks.updateTask(ctx, id(taskId), parsed.data));
  if (state.ok) redirect("/aggiungi?tipo=attivita");
  return state;
}

export async function toggleTaskAction(taskId: string, taskVersion: number, completed: boolean): Promise<ActionState> {
  const ctx = await requireExecutionContext();
  return run(() => tasks.setTaskStatus(ctx, id(taskId), version(taskVersion), completed));
}

// Notes & lists ------------------------------------------------------------------------------

export async function createNoteAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(notes.noteSchema, formData);
  if (!parsed.ok) return parsed.state;
  const ctx = await requireExecutionContext();
  let noteId = "";
  const state = await run(async () => {
    noteId = await notes.createNote(ctx, parsed.data);
  }, "Nota salvata.");
  // A new list opens right away so items can be checked off; a note stays on the Add page.
  if (state.ok && parsed.data.kind === "list") redirect(`/aggiungi/note/${noteId}`);
  return state;
}

export async function updateNoteAction(noteId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(notes.updateNoteSchema, formData);
  if (!parsed.ok) return parsed.state;
  const ctx = await requireExecutionContext();
  return run(() => notes.updateNote(ctx, id(noteId), parsed.data), "Salvato.");
}

export async function addItemAction(noteId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(notes.itemTextSchema, formData);
  if (!parsed.ok) return parsed.state;
  const ctx = await requireExecutionContext();
  return run(() => notes.addItem(ctx, id(noteId), parsed.data.version, parsed.data.text));
}

export async function toggleItemAction(noteId: string, noteVersion: number, itemId: string): Promise<ActionState> {
  const ctx = await requireExecutionContext();
  return run(() => notes.toggleItem(ctx, id(noteId), version(noteVersion), id(itemId)));
}

export async function removeItemAction(noteId: string, noteVersion: number, itemId: string): Promise<ActionState> {
  const ctx = await requireExecutionContext();
  return run(() => notes.removeItem(ctx, id(noteId), version(noteVersion), id(itemId)));
}

export async function clearDoneItemsAction(noteId: string, noteVersion: number): Promise<ActionState> {
  const ctx = await requireExecutionContext();
  return run(() => notes.clearDoneItems(ctx, id(noteId), version(noteVersion)));
}

// Goals --------------------------------------------------------------------------------------

export async function createGoalAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(goals.goalSchema, formData);
  if (!parsed.ok) return parsed.state;
  const ctx = await requireExecutionContext();
  return run(() => goals.createGoal(ctx, parsed.data), "Obiettivo creato.");
}

export async function updateGoalAction(goalId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(goals.updateGoalSchema, formData);
  if (!parsed.ok) return parsed.state;
  const ctx = await requireExecutionContext();
  const state = await run(() => goals.updateGoal(ctx, id(goalId), parsed.data));
  if (state.ok) redirect("/abitudini#obiettivi");
  return state;
}

export async function goalProgressAction(goalId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(goals.progressSchema, formData);
  if (!parsed.ok) return parsed.state;
  const ctx = await requireExecutionContext();
  return run(() => goals.setGoalProgress(ctx, id(goalId), parsed.data), "Progresso aggiornato.");
}

// Habits -------------------------------------------------------------------------------------

export async function createHabitAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(habits.habitSchema, formData);
  if (!parsed.ok) return parsed.state;
  const ctx = await requireExecutionContext();
  return run(() => habits.createHabit(ctx, parsed.data), "Abitudine creata.");
}

export async function updateHabitAction(habitId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(habits.updateHabitSchema, formData);
  if (!parsed.ok) return parsed.state;
  const ctx = await requireExecutionContext();
  const state = await run(() => habits.updateHabit(ctx, id(habitId), parsed.data));
  if (state.ok) redirect("/abitudini");
  return state;
}

export async function toggleHabitDayAction(habitId: string, day: string): Promise<ActionState> {
  const parsed = habits.entrySchema.safeParse({ day });
  if (!parsed.success) return { ok: false, message: "Data non valida." };
  const ctx = await requireExecutionContext();
  return run(() => habits.toggleEntry(ctx, id(habitId), parsed.data.day));
}

// Observations -------------------------------------------------------------------------------


// Delete (generic, scoped to the current household; RLS decides) -----------------------------

const DELETE_TARGETS = {
  calendar_events: "/calendario",
  tasks: "/aggiungi?tipo=attivita",
  notes: "/aggiungi?tipo=nota",
  goals: "/abitudini#obiettivi",
  habits: "/abitudini",
} as const;

export async function deleteRecordAction(table: keyof typeof DELETE_TARGETS, recordId: string): Promise<ActionState> {
  if (!(table in DELETE_TARGETS)) return { ok: false, message: "Operazione non valida." };
  const ctx = await requireExecutionContext();
  const state = await run(() => deleteRecord(ctx, table, id(recordId)));
  if (state.ok) redirect(DELETE_TARGETS[table]);
  return state;
}
