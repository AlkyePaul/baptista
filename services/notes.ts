import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { DomainError, throwIfDbError } from "@/lib/errors";
import type { ChecklistItem, Note } from "@/lib/db/types";
import type { ExecutionContext } from "@/lib/households/context";
import { visibilitySchema } from "@/lib/households/permissions";
import { getRecord, optionalText, PAGE_SIZE, requiredText, updateVersioned, versionField } from "@/services/shared";

export const MAX_ITEMS = 200;

export const noteSchema = z.object({
  title: requiredText(120, "Inserisci un titolo."),
  kind: z.enum(["note", "list"]),
  body: optionalText(10000),
  /** Lists: initial items, one per line. */
  items_text: z
    .string()
    .optional()
    .transform((v) =>
      (v ?? "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean),
    )
    .refine((lines) => lines.length <= MAX_ITEMS, `Al massimo ${MAX_ITEMS} elementi.`)
    .refine((lines) => lines.every((l) => l.length <= 200), "Ogni elemento può avere al massimo 200 caratteri."),
  visibility: visibilitySchema,
});

export const updateNoteSchema = z.object({
  title: requiredText(120, "Inserisci un titolo."),
  body: optionalText(10000),
  visibility: visibilitySchema,
  version: versionField,
});

export const itemTextSchema = z.object({
  text: requiredText(200, "Scrivi l'elemento."),
  version: versionField,
});

export async function createNote(ctx: ExecutionContext, input: z.infer<typeof noteSchema>) {
  const { items_text, ...note } = input;
  const items: ChecklistItem[] =
    note.kind !== "note" ? items_text.map((text) => ({ id: randomUUID(), text, done: false })) : [];
  const { data, error } = await ctx.supabase
    .from("notes")
    .insert({ household_id: ctx.household.id, ...note, items })
    .select("id")
    .single();
  throwIfDbError(error);
  return (data as { id: string }).id;
}

export async function updateNote(ctx: ExecutionContext, id: string, input: z.infer<typeof updateNoteSchema>) {
  const { version, ...patch } = input;
  await updateVersioned(ctx, "notes", id, version, patch);
}

export async function listNotes(
  ctx: ExecutionContext,
  limit = PAGE_SIZE,
  kind?: Note["kind"],
): Promise<Note[]> {
  let query = ctx.supabase.from("notes").select("*").eq("household_id", ctx.household.id);
  if (kind) query = query.eq("kind", kind);
  const { data, error } = await query
    .order("updated_at", { ascending: false })
    .limit(limit);
  throwIfDbError(error);
  return (data ?? []) as Note[];
}

/** Checklist mutations rewrite `items` with the version read by the user (no lost updates). */
async function mutateItems(
  ctx: ExecutionContext,
  id: string,
  version: number,
  change: (items: ChecklistItem[]) => ChecklistItem[],
) {
  const note = await getRecord<Note>(ctx, "notes", id);
  if (!note) throw new DomainError("not_found");
  if (note.version !== version) throw new DomainError("conflict");
  const items = change(note.items ?? []);
  if (items.length > MAX_ITEMS) throw new DomainError("invalid");
  await updateVersioned(ctx, "notes", id, version, { items });
}

export function addItem(ctx: ExecutionContext, id: string, version: number, text: string) {
  return mutateItems(ctx, id, version, (items) => [...items, { id: randomUUID(), text, done: false }]);
}

export function toggleItem(ctx: ExecutionContext, id: string, version: number, itemId: string) {
  return mutateItems(ctx, id, version, (items) =>
    items.map((item) => (item.id === itemId ? { ...item, done: !item.done } : item)),
  );
}

export function removeItem(ctx: ExecutionContext, id: string, version: number, itemId: string) {
  return mutateItems(ctx, id, version, (items) => items.filter((item) => item.id !== itemId));
}

export function clearDoneItems(ctx: ExecutionContext, id: string, version: number) {
  return mutateItems(ctx, id, version, (items) => items.filter((item) => !item.done));
}
