"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { run } from "@/lib/actions";
import { toActionState, type ActionState } from "@/lib/errors";
import { requireExecutionContext } from "@/lib/households/context";
import { uuidSchema } from "@/lib/households/permissions";
import { parseForm, versionField } from "@/services/shared";
import * as looks from "@/services/looks";

const id = (value: string) => uuidSchema.parse(value);
const version = (value: number) => z.number().int().positive().parse(value);

export async function createLookAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(looks.lookSchema, formData);
  if (!parsed.ok) return parsed.state;
  const ctx = await requireExecutionContext();

  let lookId = "";
  try {
    // Parse items from JSON
    const itemsJson = formData.get("items");
    const items = itemsJson ? z.array(looks.lookItemSchema).parse(JSON.parse(String(itemsJson))) : [];

    // Parse preview file
    const previewFile = formData.get("preview");
    const preview = previewFile instanceof File && previewFile.size > 0
      ? new Uint8Array(await previewFile.arrayBuffer())
      : null;

    lookId = await looks.createLook(ctx, parsed.data, items, preview);
  } catch (error) {
    return toActionState(error);
  }
  revalidatePath("/", "layout");
  redirect(`/stanze/guardaroba/look/${lookId}`);
}

export async function updateLookAction(lookId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(looks.updateLookSchema, formData);
  if (!parsed.ok) return parsed.state;
  const ctx = await requireExecutionContext();
  return run(() => looks.updateLook(ctx, id(lookId), parsed.data), "Look salvato.");
}

export async function saveLookItemsAction(lookId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireExecutionContext();
  try {
    const itemsJson = formData.get("items");
    const items = z.array(looks.lookItemSchema).parse(JSON.parse(String(itemsJson ?? "[]")));
    await looks.saveLookItems(ctx, id(lookId), items);

    // Update preview if included
    const previewFile = formData.get("preview");
    if (previewFile instanceof File && previewFile.size > 0) {
      const versionStr = formData.get("version");
      const v = version(Number(versionStr));
      const preview = new Uint8Array(await previewFile.arrayBuffer());
      await looks.updatePreview(ctx, id(lookId), v, preview);
    }
  } catch (error) {
    return toActionState(error);
  }
  revalidatePath("/", "layout");
  return { ok: true, message: "Look salvato." };
}

export async function deleteLookAction(lookId: string): Promise<ActionState> {
  const ctx = await requireExecutionContext();
  const state = await run(() => looks.deleteLook(ctx, id(lookId)));
  if (state.ok) redirect("/stanze/guardaroba/look");
  return state;
}
