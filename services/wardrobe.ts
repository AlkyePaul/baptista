import "server-only";

import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import type { WardrobeItem } from "@/lib/db/types";
import { DomainError, throwIfDbError } from "@/lib/errors";
import type { ExecutionContext } from "@/lib/households/context";
import { visibilitySchema } from "@/lib/households/permissions";
import { EXTENSION, MAX_PIXELS, type ImageMime } from "@/lib/image-check";
import { BAPTISTA_BUCKETS } from "@/lib/supabase/schema";
import { CLOTHING_TYPES, COLORS, FORMALITIES, parseTags, PATTERNS, SEASONS } from "@/lib/wardrobe";
import { checkImage } from "@/services/images";
import { getRecord, optionalCivilDate, optionalDecimal, optionalText, requiredText, updateVersioned, versionField } from "@/services/shared";

const BUCKET = BAPTISTA_BUCKETS.wardrobe;
/** Short-lived links, issued after authorization and never stored (SECURITY.md). */
const SIGNED_URL_TTL = 600;

const ids = <T extends readonly { id: string }[]>(list: T) => list.map((x) => x.id) as [T[number]["id"], ...T[number]["id"][]];
const many = <S extends z.ZodType>(item: S) =>
  z.preprocess((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]), z.array(item));
const optionalEnum = <T extends readonly { id: string }[]>(list: T) =>
  z.enum(ids(list)).optional().transform((v) => v ?? null);

const wardrobeFields = {
  name: requiredText(120, "Dai un nome al capo."),
  type: z.enum(ids(CLOTHING_TYPES), { error: "Scegli il tipo di capo." }),
  subtype: optionalText(60),
  primary_color: optionalEnum(COLORS),
  secondary_colors: many(z.enum(ids(COLORS))).refine((v) => v.length <= 5, "Al massimo 5 colori secondari."),
  pattern: optionalEnum(PATTERNS),
  material: optionalText(60),
  seasons: many(z.enum(ids(SEASONS))),
  formality: optionalEnum(FORMALITIES),
  brand: optionalText(60),
  size: optionalText(20),
  tags: z.string().optional().transform(parseTags),
  notes: optionalText(1000),
  visibility: visibilitySchema,
};

export const wardrobeSchema = z.object({
  ...wardrobeFields,
  /** C5: the item is born from a clothing expense (a purchase by definition). */
  expense_id: z.uuid().optional().transform((v) => v ?? null),
});
export const updateWardrobeSchema = z.object({ ...wardrobeFields, version: versionField });

// Photos -------------------------------------------------------------------------------------

type PreparedPhoto = { original: Uint8Array; mime: ImageMime; thumb: Buffer };

/**
 * Validates the real bytes (not the declared type), size and pixels, then makes the thumbnail:
 * auto-rotated, at most 800 px, WebP, without EXIF/GPS (sharp drops metadata by default).
 */
export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  const { bytes: original, mime: kind } = await checkImage(file);
  const thumb = await sharp(original, { limitInputPixels: MAX_PIXELS })
    .rotate()
    .resize({ width: 800, height: 800, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();
  return { original, mime: kind, thumb };
}

/** Uploads into <household>/<user>/<upload>/ with server-generated names; never overwrites. */
async function uploadPhoto(ctx: ExecutionContext, photo: PreparedPhoto) {
  const folder = `${ctx.household.id}/${ctx.user.id}/${randomUUID()}`;
  const paths = { original_path: `${folder}/original.${EXTENSION[photo.mime]}`, thumb_path: `${folder}/thumb.webp` };
  const bucket = ctx.supabase.storage.from(BUCKET);
  const first = await bucket.upload(paths.original_path, photo.original, { contentType: photo.mime, upsert: false });
  if (first.error) throw new DomainError("upload_failed");
  const second = await bucket.upload(paths.thumb_path, photo.thumb, { contentType: "image/webp", upsert: false });
  if (second.error) {
    await bucket.remove([paths.original_path]);
    throw new DomainError("upload_failed");
  }
  return paths;
}

async function removePhotos(ctx: ExecutionContext, paths: Array<string | null>) {
  const list = paths.filter((p): p is string => Boolean(p));
  if (list.length) await ctx.supabase.storage.from(BUCKET).remove(list);
}

// CRUD ---------------------------------------------------------------------------------------

/** Upload first, then the row; if the row fails the files are removed (no orphan promises). */
export async function createWardrobeItem(ctx: ExecutionContext, input: z.infer<typeof wardrobeSchema>, photo: PreparedPhoto | null) {
  const paths = photo ? await uploadPhoto(ctx, photo) : { original_path: null, thumb_path: null };
  const { data, error } = await ctx.supabase
    .from("wardrobe_items")
    .insert({ household_id: ctx.household.id, ...input, ...(input.expense_id ? { acquisition: "purchased" } : {}), ...paths })
    .select("id")
    .single();
  if (error) {
    await removePhotos(ctx, [paths.original_path, paths.thumb_path]);
    throwIfDbError(error);
  }
  return (data as { id: string }).id;
}

export async function updateWardrobeItem(ctx: ExecutionContext, id: string, input: z.infer<typeof updateWardrobeSchema>) {
  const { version, ...patch } = input;
  await updateVersioned(ctx, "wardrobe_items", id, version, patch);
}

/** New photo: upload, point the item at it, then remove the old files. */
export async function replacePhoto(ctx: ExecutionContext, id: string, version: number, photo: PreparedPhoto) {
  const item = await getRecord<WardrobeItem>(ctx, "wardrobe_items", id);
  if (!item) throw new DomainError("not_found");
  const paths = await uploadPhoto(ctx, photo);
  try {
    await updateVersioned(ctx, "wardrobe_items", id, version, paths);
  } catch (error) {
    await removePhotos(ctx, [paths.original_path, paths.thumb_path]);
    throw error;
  }
  await removePhotos(ctx, [item.original_path, item.thumb_path]);
}

export async function setWardrobeStatus(ctx: ExecutionContext, id: string, version: number, status: "active" | "archived") {
  await updateVersioned(ctx, "wardrobe_items", id, version, { status });
}

/** Photos first (allowed while the item is readable), then the item. */
export async function deleteWardrobeItem(ctx: ExecutionContext, id: string) {
  const item = await getRecord<WardrobeItem>(ctx, "wardrobe_items", id);
  if (!item) throw new DomainError("not_found");
  await removePhotos(ctx, [item.original_path, item.thumb_path, item.processed_path]);
  const { data, error } = await ctx.supabase.from("wardrobe_items").delete().eq("id", id).eq("household_id", ctx.household.id).select("id");
  throwIfDbError(error);
  if (!data?.length) throw new DomainError("not_found");
}

export async function listWardrobe(ctx: ExecutionContext, status: "active" | "archived" = "active"): Promise<WardrobeItem[]> {
  const { data, error } = await ctx.supabase
    .from("wardrobe_items")
    .select("*")
    .eq("household_id", ctx.household.id)
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(500);
  throwIfDbError(error);
  return (data ?? []) as WardrobeItem[];
}

/** Signed URLs for the given paths (RLS on storage decides); missing ones are simply absent. */
export async function signedUrls(ctx: ExecutionContext, paths: Array<string | null>): Promise<Map<string, string>> {
  const list = [...new Set(paths.filter((p): p is string => Boolean(p)))];
  const map = new Map<string, string>();
  if (!list.length) return map;
  const { data } = await ctx.supabase.storage.from(BUCKET).createSignedUrls(list, SIGNED_URL_TTL);
  for (const row of data ?? []) if (row.path && row.signedUrl && !row.error) map.set(row.path, row.signedUrl);
  return map;
}

// Acquisition (Phase 04.1, A-2) --------------------------------------------------------------

export const MIN_BULK_OWNED = 7;

export const purchaseSchema = z.object({
  price: optionalDecimal("Prezzo", { max: 999_999_999, exclusiveMin: true }),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Valuta non valida.").default("EUR"),
  occurred_on: optionalCivilDate,
  merchant: optionalText(120),
  visibility: visibilitySchema,
  version: versionField,
});

/** «Sì, l'ho comprato»: with a price one linked expense in «Abbigliamento»; without, none. */
export async function registerPurchase(ctx: ExecutionContext, id: string, input: z.infer<typeof purchaseSchema>) {
  const { data, error } = await ctx.supabase.rpc("register_wardrobe_purchase", {
    p_item_id: id,
    p_version: input.version,
    p_price: input.price,
    p_currency: input.currency,
    p_occurred_on: input.occurred_on,
    p_merchant: input.merchant,
    p_visibility: input.visibility,
  });
  throwIfDbError(error);
  return (data as string | null) ?? null;
}

/** «Era già mio» / «È un regalo» (or a correction back to unknown). */
export async function setAcquisition(ctx: ExecutionContext, id: string, version: number, acquisition: "gift" | "owned_before" | "unknown") {
  await updateVersioned(ctx, "wardrobe_items", id, version, { acquisition });
}

/** «Erano già miei» in bulk: at least 7 own unanswered items (also enforced by the database). */
export async function markOwnedBefore(ctx: ExecutionContext, itemIds: string[]) {
  if (new Set(itemIds).size < MIN_BULK_OWNED) throw new DomainError("too_few");
  const { error } = await ctx.supabase.rpc("mark_wardrobe_owned_before", { p_household_id: ctx.household.id, p_ids: itemIds });
  throwIfDbError(error);
}

export type LinkedExpense = { id: string; total: number; currency: string; occurred_on: string };

export async function getLinkedExpense(ctx: ExecutionContext, expenseId: string | null): Promise<LinkedExpense | null> {
  if (!expenseId) return null;
  const { data, error } = await ctx.supabase.from("expenses").select("id, total, currency, occurred_on").eq("id", expenseId).maybeSingle();
  throwIfDbError(error);
  return data ? { ...(data as LinkedExpense), total: Number((data as LinkedExpense).total) } : null;
}
