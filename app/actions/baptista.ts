"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { run } from "@/lib/actions";
import type { AnswerState, UndoToken } from "@/lib/baptista/view";
import { DomainError, messageFor, toActionState, type ActionState } from "@/lib/errors";
import { requireExecutionContext } from "@/lib/households/context";
import { uuidSchema } from "@/lib/households/permissions";
import * as baptista from "@/services/baptista";

const payloadSchema = z.record(z.string().max(40), z.union([z.string().max(500), z.array(z.string().max(500)).max(100)]));
const optionSchema = z.string().regex(/^[a-z_]{1,30}$/);

/**
 * The user's answer to a Baptista conversation. Only options declared by the observation's script
 * run; the confirmation text comes back only after the write succeeded (B-3).
 */
export async function answerAction(observationId: string, optionId: string, version: number | null, payload: Record<string, string | string[]> = {}): Promise<AnswerState> {
  const parsed = z
    .object({ id: uuidSchema, option: optionSchema, version: z.number().int().positive().nullable(), payload: payloadSchema })
    .safeParse({ id: observationId, option: optionId, version, payload });
  if (!parsed.success) return { ok: false, message: messageFor("invalid") };
  const ctx = await requireExecutionContext();
  let state: AnswerState;
  try {
    state = await baptista.answer(ctx, parsed.data.id, parsed.data.option, parsed.data.version, parsed.data.payload);
  } catch (error) {
    if (error instanceof DomainError && error.code === "invalid" && error.message !== "invalid") return { ok: false, message: error.message };
    if (error instanceof DomainError && error.code === "conflict") return { ok: false, conflict: true, message: "Qualcuno l'ha appena modificato." };
    return { ok: false, message: toActionState(error).message };
  }
  revalidatePath("/", "layout");
  return state;
}

const undoSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("food_status"), id: uuidSchema, version: z.number().int().positive(), status: z.enum(["available", "opened"]) }),
  z.object({ kind: z.literal("task_open"), id: uuidSchema, version: z.number().int().positive() }),
]);

export async function undoAction(token: UndoToken): Promise<ActionState> {
  const parsed = undoSchema.safeParse(token);
  if (!parsed.success) return { ok: false, message: messageFor("invalid") };
  const ctx = await requireExecutionContext();
  const state = await run(() => baptista.undo(ctx, parsed.data));
  if (!state.ok && state.message === messageFor("conflict")) return { ok: false, message: "Non posso annullare: nel frattempo è cambiato qualcosa." };
  return state;
}

/** «Ora no»: personal dismissal (the fact stays for the other members). */
export async function dismissForMeAction(observationId: string): Promise<ActionState> {
  const ctx = await requireExecutionContext();
  return run(() => baptista.dismissForMe(ctx, uuidSchema.parse(observationId)));
}

/** Called when the typing of a message ends: it will not be typed again for this viewer. */
export async function markShownAction(key: string, observationId: string | null, variant: string | null): Promise<void> {
  const parsed = z
    .object({ key: z.string().min(1).max(300), id: uuidSchema.nullable(), variant: z.string().max(80).nullable() })
    .safeParse({ key, id: observationId, variant });
  if (!parsed.success) return;
  const ctx = await requireExecutionContext();
  try {
    await baptista.markShown(ctx, parsed.data.key, parsed.data.id, parsed.data.variant);
  } catch {
    // Presentation memory is best effort: never break the conversation for it.
  }
}

export async function saveStepAction(observationId: string, step: string | null): Promise<void> {
  const parsed = z
    .object({ id: uuidSchema, step: z.string().regex(/^(confirming|form):[a-z_]{1,30}$/).nullable() })
    .safeParse({ id: observationId, step });
  if (!parsed.success) return;
  const ctx = await requireExecutionContext();
  try {
    await baptista.saveStep(ctx, parsed.data.id, parsed.data.step);
  } catch {
    // best effort
  }
}

export async function closeDailyAction(): Promise<ActionState> {
  const ctx = await requireExecutionContext();
  return run(() => baptista.closeDaily(ctx));
}
