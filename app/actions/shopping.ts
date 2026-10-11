"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { run } from "@/lib/actions";
import { isCivilDate } from "@/lib/dates";
import { messageFor, toActionState, type ActionState } from "@/lib/errors";
import { requireExecutionContext } from "@/lib/households/context";
import { uuidSchema } from "@/lib/households/permissions";
import { parseForm } from "@/services/shared";
import * as shopping from "@/services/shopping";

const id = (value: string) => uuidSchema.parse(value);
const version = (value: number) => z.number().int().positive().parse(value);
const idList = z.array(uuidSchema).min(1).max(200);

/** Result of a stocking gesture: what entered the pantry, for the «Annulla» toast. */
export type StockState = ActionState & { stocked?: Array<{ id: string; foodItemId: string; name: string; storage: string }> };

async function stockResult(fn: () => Promise<shopping.StockResult | null>): Promise<StockState> {
  let result: shopping.StockResult | null = null;
  try {
    result = await fn();
  } catch (error) {
    return toActionState(error);
  }
  revalidatePath("/", "layout");
  return { ok: true, stocked: (result?.items ?? []).map((i) => ({ id: i.id, foodItemId: i.food_item_id, name: i.name, storage: i.storage })) };
}

export async function addShoppingItemAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(shopping.addShoppingSchema, formData);
  if (!parsed.ok) return parsed.state;
  const ctx = await requireExecutionContext();
  return run(() => shopping.addShoppingItem(ctx, parsed.data));
}

/** Tick: food → bought and in the pantry (bulk = false); «Altro» → done. */
export async function tickShoppingItemAction(itemId: string, itemVersion: number): Promise<StockState> {
  const ctx = await requireExecutionContext();
  return stockResult(() => shopping.tickItem(ctx, id(itemId), version(itemVersion)));
}

/** «Tutto in dispensa»: the open food rows the user is looking at (the visible list confirms). */
export async function stockAllAction(itemIds: string[]): Promise<StockState> {
  const parsed = idList.safeParse(itemIds);
  if (!parsed.success) return { ok: false, message: messageFor("invalid") };
  const ctx = await requireExecutionContext();
  return stockResult(() => shopping.stockItems(ctx, parsed.data, true));
}

export async function undoStockAction(itemIds: string[]): Promise<ActionState> {
  const parsed = idList.safeParse(itemIds);
  if (!parsed.success) return { ok: false, message: messageFor("invalid") };
  const ctx = await requireExecutionContext();
  const state = await run(() => shopping.unstockItems(ctx, parsed.data));
  if (!state.ok && state.message === messageFor("conflict")) {
    return { ok: false, message: "Non posso annullare: nel frattempo qualcuno ha modificato questi alimenti in dispensa." };
  }
  return state;
}

export async function setShoppingStatusAction(itemId: string, itemVersion: number, status: string): Promise<ActionState> {
  const parsed = z.enum(["open", "done", "removed"]).safeParse(status);
  if (!parsed.success) return { ok: false, message: messageFor("invalid") };
  const ctx = await requireExecutionContext();
  return run(() => shopping.setItemStatus(ctx, id(itemId), version(itemVersion), parsed.data));
}

export async function setShoppingStorageAction(itemId: string, itemVersion: number, storage: string): Promise<ActionState> {
  const ctx = await requireExecutionContext();
  return run(() => shopping.setItemStorage(ctx, id(itemId), version(itemVersion), storage));
}

const foodsSchema = z.object({
  food: z.preprocess((v) => (v === undefined ? [] : Array.isArray(v) ? v : [v]), z.array(uuidSchema).max(100)),
});

/** C3: only the ingredients the user ticked go to the list (deduplicated by the database). */
export async function addIngredientsAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(foodsSchema, formData);
  if (!parsed.ok) return parsed.state;
  if (!parsed.data.food.length) return { ok: false, message: "Spunta almeno un ingrediente." };
  const ctx = await requireExecutionContext();
  const n = parsed.data.food.length;
  return run(
    () => shopping.addFoods(ctx, parsed.data.food),
    n === 1 ? "Aggiunto alla Lista della spesa." : `${n} ingredienti aggiunti alla Lista della spesa.`,
  );
}

/** «Aggiungi scadenze» after «Tutto in dispensa»: `exp:<foodId>:<version>` = date. */
export async function setExpiriesAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const dates: Array<{ id: string; version: number; date: string }> = [];
  for (const [key, value] of formData.entries()) {
    const match = /^exp:([0-9a-f-]{36}):(\d+)$/.exec(key);
    if (!match || typeof value !== "string" || !value) continue;
    if (!isCivilDate(value) || !uuidSchema.safeParse(match[1]).success) return { ok: false, message: messageFor("invalid") };
    dates.push({ id: match[1], version: Number(match[2]), date: value });
  }
  if (!dates.length) return { ok: false, message: "Inserisci almeno una data." };
  const ctx = await requireExecutionContext();
  return run(() => shopping.setExpiries(ctx, dates), "Scadenze salvate.");
}
