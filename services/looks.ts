import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Look, LookItem } from "@/lib/db/types";
import { DomainError, throwIfDbError } from "@/lib/errors";
import type { ExecutionContext } from "@/lib/households/context";
import { visibilitySchema } from "@/lib/households/permissions";
import { BAPTISTA_BUCKETS } from "@/lib/supabase/schema";
import { FORMALITIES, parseTags, SEASONS } from "@/lib/wardrobe";
import { getRecord, optionalText, requiredText, updateVersioned, versionField } from "@/services/shared";

const BUCKET = BAPTISTA_BUCKETS.wardrobe;

const ids = <T extends readonly { id: string }[]>(list: T) => list.map((x) => x.id) as [T[number]["id"], ...T[number]["id"][]];
const many = <S extends z.ZodType>(item: S) =>
  z.preprocess((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]), z.array(item));
const optionalEnum = <T extends readonly { id: string }[]>(list: T) =>
  z.enum(ids(list)).optional().transform((v) => v ?? null);

export const lookSchema = z.object({
  title: requiredText(120, "Dai un nome al look."),
  notes: optionalText(1000),
  tags: z.string().optional().transform(parseTags),
  seasons: many(z.enum(ids(SEASONS))),
  formality: optionalEnum(FORMALITIES),
  visibility: visibilitySchema,
});

export const updateLookSchema = z.object({
  title: requiredText(120, "Dai un nome al look."),
  notes: optionalText(1000),
  tags: z.string().optional().transform(parseTags),
  seasons: many(z.enum(ids(SEASONS))),
  formality: optionalEnum(FORMALITIES),
  visibility: visibilitySchema,
  version: versionField,
});

/** Validates one look item placement. */
export const lookItemSchema = z.object({
  wardrobe_item_id: z.uuid(),
  x: z.coerce.number().min(0).max(1),
  y: z.coerce.number().min(0).max(1),
  scale: z.coerce.number().min(0.1).max(3.0),
  rotation: z.coerce.number().min(-360).max(360),
  z_order: z.coerce.number().int(),
});
export type LookItemInput = z.infer<typeof lookItemSchema>;

// Preview upload/cleanup ----------------------------------------------------------------------

async function uploadPreview(ctx: ExecutionContext, lookId: string, previewBlob: Uint8Array): Promise<string> {
  const folder = `${ctx.household.id}/${ctx.user.id}/${lookId}`;
  const path = `${folder}/preview.jpg`;
  const bucket = ctx.supabase.storage.from(BUCKET);
  const { error } = await bucket.upload(path, previewBlob, { contentType: "image/jpeg", upsert: true });
  if (error) throw new DomainError("upload_failed");
  return path;
}

async function removePreview(ctx: ExecutionContext, path: string | null) {
  if (path) await ctx.supabase.storage.from(BUCKET).remove([path]);
}

// CRUD ----------------------------------------------------------------------------------------

export async function createLook(
  ctx: ExecutionContext,
  input: z.infer<typeof lookSchema>,
  items: LookItemInput[],
  preview: Uint8Array | null,
): Promise<string> {
  const lookId = randomUUID();
  let preview_path: string | null = null;
  if (preview) {
    preview_path = await uploadPreview(ctx, lookId, preview);
  }

  const { data, error } = await ctx.supabase
    .from("looks")
    .insert({
      id: lookId,
      household_id: ctx.household.id,
      ...input,
      ...(preview_path ? { preview_path } : {}),
    })
    .select("id")
    .single();
  if (error) {
    if (preview_path) await removePreview(ctx, preview_path);
    throwIfDbError(error);
  }

  if (items.length > 0) {
    await saveLookItems(ctx, lookId, items);
  }

  return (data as { id: string }).id;
}

export async function updateLook(ctx: ExecutionContext, id: string, input: z.infer<typeof updateLookSchema>): Promise<void> {
  const { version, ...patch } = input;
  await updateVersioned(ctx, "looks", id, version, patch);
}

/** Atomic replace: delete all existing items and insert new ones. */
export async function saveLookItems(ctx: ExecutionContext, lookId: string, items: LookItemInput[]): Promise<void> {
  // Delete existing items
  const { error: delError } = await ctx.supabase.from("look_items").delete().eq("look_id", lookId);
  throwIfDbError(delError);

  if (items.length === 0) return;

  const rows = items.map((item) => ({
    look_id: lookId,
    ...item,
  }));
  const { error } = await ctx.supabase.from("look_items").insert(rows);
  throwIfDbError(error);
}

/** Update preview image on an existing look. */
export async function updatePreview(ctx: ExecutionContext, id: string, version: number, preview: Uint8Array): Promise<void> {
  const look = await getRecord<Look>(ctx, "looks", id);
  if (!look) throw new DomainError("not_found");
  const preview_path = await uploadPreview(ctx, id, preview);
  try {
    await updateVersioned(ctx, "looks", id, version, { preview_path });
  } catch (error) {
    await removePreview(ctx, preview_path);
    throw error;
  }
  if (look.preview_path && look.preview_path !== preview_path) {
    await removePreview(ctx, look.preview_path);
  }
}

export async function listLooks(ctx: ExecutionContext): Promise<Look[]> {
  const { data, error } = await ctx.supabase
    .from("looks")
    .select("*")
    .eq("household_id", ctx.household.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(200);
  throwIfDbError(error);
  return (data ?? []) as Look[];
}

export async function getLookWithItems(ctx: ExecutionContext, id: string): Promise<{ look: Look; items: LookItem[] } | null> {
  const look = await getRecord<Look>(ctx, "looks", id);
  if (!look) return null;
  const { data, error } = await ctx.supabase
    .from("look_items")
    .select("*")
    .eq("look_id", id)
    .order("z_order", { ascending: true });
  throwIfDbError(error);
  return { look, items: (data ?? []) as LookItem[] };
}

export async function deleteLook(ctx: ExecutionContext, id: string): Promise<void> {
  const look = await getRecord<Look>(ctx, "looks", id);
  if (!look) throw new DomainError("not_found");
  await removePreview(ctx, look.preview_path);
  const { data, error } = await ctx.supabase.from("looks").delete().eq("id", id).eq("household_id", ctx.household.id).select("id");
  throwIfDbError(error);
  if (!data?.length) throw new DomainError("not_found");
}
