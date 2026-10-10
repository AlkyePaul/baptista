"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { run } from "@/lib/actions";
import { messageFor, toActionState, type ActionState } from "@/lib/errors";
import { requireExecutionContext } from "@/lib/households/context";
import { uuidSchema } from "@/lib/households/permissions";
import { parseForm, versionField } from "@/services/shared";
import * as wardrobe from "@/services/wardrobe";

const id = (value: string) => uuidSchema.parse(value);
const version = (value: number) => z.number().int().positive().parse(value);

/** The optional photo field: an empty file input arrives as a 0-byte File. */
function photoFrom(formData: FormData): File | null {
  const file = formData.get("photo");
  return file instanceof File && file.size > 0 ? file : null;
}

export async function createWardrobeItemAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(wardrobe.wardrobeSchema, formData);
  if (!parsed.ok) return parsed.state;
  const ctx = await requireExecutionContext();
  let itemId = "";
  try {
    const file = photoFrom(formData);
    const photo = file ? await wardrobe.preparePhoto(file) : null;
    itemId = await wardrobe.createWardrobeItem(ctx, parsed.data, photo);
  } catch (error) {
    return toActionState(error);
  }
  revalidatePath("/", "layout");
  redirect(`/stanze/guardaroba/capi/${itemId}`);
}

export async function updateWardrobeItemAction(itemId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(wardrobe.updateWardrobeSchema, formData);
  if (!parsed.ok) return parsed.state;
  const ctx = await requireExecutionContext();
  return run(() => wardrobe.updateWardrobeItem(ctx, id(itemId), parsed.data), "Salvato.");
}

export async function replacePhotoAction(itemId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(z.object({ version: versionField }), formData);
  if (!parsed.ok) return parsed.state;
  const file = photoFrom(formData);
  if (!file) return { ok: false, message: "Scegli una foto." };
  const ctx = await requireExecutionContext();
  return run(async () => wardrobe.replacePhoto(ctx, id(itemId), parsed.data.version, await wardrobe.preparePhoto(file)), "Foto aggiornata.");
}

export async function setWardrobeStatusAction(itemId: string, itemVersion: number, status: string): Promise<ActionState> {
  if (status !== "active" && status !== "archived") return { ok: false, message: messageFor("invalid") };
  const ctx = await requireExecutionContext();
  return run(() => wardrobe.setWardrobeStatus(ctx, id(itemId), version(itemVersion), status));
}

export async function deleteWardrobeItemAction(itemId: string): Promise<ActionState> {
  const ctx = await requireExecutionContext();
  const state = await run(() => wardrobe.deleteWardrobeItem(ctx, id(itemId)));
  if (state.ok) redirect("/stanze/guardaroba/capi");
  return state;
}

// Acquisition (Phase 04.1, A-2) --------------------------------------------------------------

export async function registerPurchaseAction(itemId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(wardrobe.purchaseSchema, formData);
  if (!parsed.ok) return parsed.state;
  const ctx = await requireExecutionContext();
  return run(
    () => wardrobe.registerPurchase(ctx, id(itemId), parsed.data),
    parsed.data.price === null ? "Segnato come acquisto, senza spesa." : "Fatto: spesa registrata in Finanze.",
  );
}

export async function setAcquisitionAction(itemId: string, itemVersion: number, acquisition: string): Promise<ActionState> {
  const parsed = z.enum(["gift", "owned_before", "unknown"]).safeParse(acquisition);
  if (!parsed.success) return { ok: false, message: messageFor("invalid") };
  const ctx = await requireExecutionContext();
  return run(() => wardrobe.setAcquisition(ctx, id(itemId), version(itemVersion), parsed.data));
}

const bulkSchema = z.object({
  item: z.preprocess((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]), z.array(uuidSchema).max(500)),
});

/** «Erano già miei» for 7 or more selected items. */
export async function markOwnedBeforeAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(bulkSchema, formData);
  if (!parsed.ok) return parsed.state;
  const ctx = await requireExecutionContext();
  const n = new Set(parsed.data.item).size;
  return run(() => wardrobe.markOwnedBefore(ctx, parsed.data.item), `${n} capi segnati come già tuoi.`);
}
