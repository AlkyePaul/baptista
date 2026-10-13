import "server-only";

import { randomUUID } from "node:crypto";
import sharp from "sharp";
import type { z } from "zod";
import type { Expense } from "@/lib/db/types";
import { DomainError, throwIfDbError } from "@/lib/errors";
import type { ExecutionContext } from "@/lib/households/context";
import { MAX_PIXELS } from "@/lib/image-check";
import { BAPTISTA_BUCKETS } from "@/lib/supabase/schema";
import { createExpense, type expenseSchema } from "@/services/finance";
import { checkImage } from "@/services/images";
import { getRecord, updateVersioned } from "@/services/shared";

/**
 * Receipt photo attached to an expense (phase 04): stored privately, shown on the expense, no
 * extraction (receipt reading arrives with the vision pipeline in phase 05 and starts from here).
 */

const BUCKET = BAPTISTA_BUCKETS.receipts;
/** Short-lived link, issued after authorization and never stored (SECURITY.md). */
const SIGNED_URL_TTL = 600;
/** Long side kept: enough to read small print later, small enough to stay well under the limit. */
const MAX_SIDE = 2400;

/**
 * Validates the real bytes, then re-encodes to JPEG: auto-rotated, at most 2400 px, without
 * EXIF/GPS (sharp drops metadata by default). Only this derivative is stored.
 */
export async function prepareReceipt(file: File): Promise<Buffer> {
  const { bytes } = await checkImage(file);
  try {
    return await sharp(bytes, { limitInputPixels: MAX_PIXELS })
      .rotate()
      .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();
  } catch {
    throw new DomainError("image_invalid");
  }
}

/** Uploads into <household>/<user>/<upload>/ with a server-generated name; never overwrites. */
async function upload(ctx: ExecutionContext, jpeg: Buffer) {
  const path = `${ctx.household.id}/${ctx.user.id}/${randomUUID()}/scontrino.jpg`;
  const { error } = await ctx.supabase.storage.from(BUCKET).upload(path, jpeg, { contentType: "image/jpeg", upsert: false });
  if (error) throw new DomainError("upload_failed");
  return path;
}

async function remove(ctx: ExecutionContext, path: string | null) {
  if (path) await ctx.supabase.storage.from(BUCKET).remove([path]);
}

/** Upload first, then the row; if the row fails the file is removed (no orphan promises). */
export async function createExpenseWithReceipt(ctx: ExecutionContext, input: z.infer<typeof expenseSchema>, receipt: Buffer | null) {
  const path = receipt ? await upload(ctx, receipt) : null;
  try {
    return await createExpense(ctx, input, path);
  } catch (error) {
    await remove(ctx, path);
    throw error;
  }
}

/** New receipt: upload, point the expense at it, then remove the old file. */
export async function replaceReceipt(ctx: ExecutionContext, id: string, version: number, receipt: Buffer) {
  const expense = await getRecord<Expense>(ctx, "expenses", id);
  if (!expense) throw new DomainError("not_found");
  const path = await upload(ctx, receipt);
  try {
    await updateVersioned(ctx, "expenses", id, version, { receipt_path: path });
  } catch (error) {
    await remove(ctx, path);
    throw error;
  }
  await remove(ctx, expense.receipt_path);
}

export async function removeReceipt(ctx: ExecutionContext, id: string, version: number) {
  const expense = await getRecord<Expense>(ctx, "expenses", id);
  if (!expense) throw new DomainError("not_found");
  await updateVersioned(ctx, "expenses", id, version, { receipt_path: null });
  await remove(ctx, expense.receipt_path);
}

/** Receipt first (allowed while the expense is readable), then the expense. */
export async function deleteExpense(ctx: ExecutionContext, id: string) {
  const expense = await getRecord<Expense>(ctx, "expenses", id);
  if (!expense) throw new DomainError("not_found");
  await remove(ctx, expense.receipt_path);
  const { data, error } = await ctx.supabase.from("expenses").delete().eq("id", id).eq("household_id", ctx.household.id).select("id");
  throwIfDbError(error);
  if (!data?.length) throw new DomainError("not_found");
}

/** Signed URL for an expense's receipt (storage RLS decides); null if missing or not readable. */
export async function receiptUrl(ctx: ExecutionContext, path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await ctx.supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL);
  return error ? null : data.signedUrl;
}
