import "server-only";

import { z } from "zod";
import { selectThread, isHidden, type Candidate } from "@/lib/baptista/attention";
import { dailyLine } from "@/lib/baptista/daily";
import { DONE_TEXT, openingFor, QUESTION_TYPES, SCRIPTS, type ObservationInput, type VoiceContext } from "@/lib/baptista/scripts";
import { firstName, headerFor, quietLine } from "@/lib/baptista/templates";
import type { AnswerState, ConversationView, ThreadView, Thumb, UndoToken } from "@/lib/baptista/view";
import { addDays, localDate, localHour, zonedToUtc } from "@/lib/dates";
import type { FoodItem, Presentation, Task, WardrobeItem } from "@/lib/db/types";
import { DomainError, throwIfDbError } from "@/lib/errors";
import type { ExecutionContext } from "@/lib/households/context";
import { visualFor } from "@/lib/intelligence/briefing";
import { formatMoney } from "@/lib/money";
import { SLOTS } from "@/lib/nutrition";
import type { RoomId } from "@/lib/rooms";
import * as diet from "@/services/diet";
import { refreshObservations } from "@/services/intelligence";
import { decimal, getRecord, parseForm, updateVersioned } from "@/services/shared";
import * as shopping from "@/services/shopping";
import * as wardrobe from "@/services/wardrobe";

/**
 * Baptista deterministic layer (Phase 04.1, step B): observations → script → template → thread
 * with an attention budget, and the execution of the options a script declares. No model is
 * involved anywhere; confirmations exist only after a successful write.
 */

const OBS_SELECT = "id, type, title, description, source_type, source_id, dedupe_key, priority_score, confidence, data, created_at";
const PRESENTATION_SELECT = "key, observation_id, first_shown_at, last_shown_at, show_count, last_variant, outcome, snoozed_until, script_step, result_text, updated_at";

export const obsKey = (dedupeKey: string) => `obs:${dedupeKey}`;

type Row = ObservationInput;

async function listObservations(ctx: ExecutionContext, limit = 60): Promise<Row[]> {
  const { data, error } = await ctx.supabase
    .from("observations")
    .select(OBS_SELECT)
    .eq("household_id", ctx.household.id)
    .eq("state", "active")
    .order("priority_score", { ascending: false })
    .order("created_at", { ascending: true })
    .limit(limit);
  throwIfDbError(error);
  return ((data ?? []) as Row[]).map((o) => ({ ...o, priority_score: Number(o.priority_score), confidence: Number(o.confidence) }));
}

async function getObservation(ctx: ExecutionContext, id: string): Promise<Row | null> {
  const { data, error } = await ctx.supabase
    .from("observations")
    .select(OBS_SELECT)
    .eq("id", id)
    .eq("household_id", ctx.household.id)
    .eq("state", "active")
    .maybeSingle();
  throwIfDbError(error);
  return (data as Row | null) ?? null;
}

type PresentationRow = Presentation & { updated_at: string };

async function listPresentations(ctx: ExecutionContext): Promise<Map<string, PresentationRow>> {
  const { data, error } = await ctx.supabase
    .from("baptista_presentations")
    .select(PRESENTATION_SELECT)
    .eq("household_id", ctx.household.id)
    .eq("user_id", ctx.user.id)
    .order("last_shown_at", { ascending: false })
    .limit(500);
  throwIfDbError(error);
  return new Map(((data ?? []) as PresentationRow[]).map((p) => [p.key, p]));
}

export async function recordPresentation(
  ctx: ExecutionContext,
  key: string,
  fields: { observationId?: string | null; variant?: string | null; outcome?: Presentation["outcome"] | null; snoozedUntil?: Date | null; step?: string | null; resultText?: string | null },
) {
  const { error } = await ctx.supabase.rpc("record_presentation", {
    p_household_id: ctx.household.id,
    p_key: key,
    p_observation_id: fields.observationId ?? null,
    p_variant: fields.variant ?? null,
    p_outcome: fields.outcome ?? null,
    p_snoozed_until: fields.snoozedUntil ? fields.snoozedUntil.toISOString() : null,
    p_step: fields.step ?? null,
    p_result_text: fields.resultText ?? null,
  });
  throwIfDbError(error);
}

function voiceFor(ctx: ExecutionContext, now: Date, extra: Partial<VoiceContext> = {}): VoiceContext {
  const tz = ctx.household.timezone;
  return {
    viewerName: firstName(ctx.displayName),
    useName: false,
    today: localDate(now, tz),
    hour: localHour(now, tz),
    timeZone: tz,
    seenBefore: false,
    ...extra,
  };
}

/** Current version of the records the scripts can change (food, tasks, wardrobe items). */
async function sourceVersions(ctx: ExecutionContext, rows: Row[]): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const groups: Array<[string, "food_items" | "tasks" | "wardrobe_items"]> = [
    ["food_item", "food_items"],
    ["task", "tasks"],
    ["wardrobe_item", "wardrobe_items"],
  ];
  await Promise.all(
    groups.map(async ([sourceType, table]) => {
      const ids = rows.filter((r) => r.source_type === sourceType).map((r) => r.source_id);
      if (!ids.length) return;
      const { data, error } = await ctx.supabase.from(table).select("id, version").in("id", ids);
      throwIfDbError(error);
      for (const r of (data ?? []) as Array<{ id: string; version: number }>) map.set(r.id, r.version);
    }),
  );
  return map;
}

async function thumbsFor(ctx: ExecutionContext, rows: Row[]): Promise<Map<string, Thumb>> {
  const map = new Map<string, Thumb>();
  const photos = rows.filter((r) => typeof r.data.thumb_path === "string");
  const urls = photos.length ? await wardrobe.signedUrls(ctx, photos.map((r) => r.data.thumb_path as string)) : new Map<string, string>();
  for (const r of rows) {
    const path = typeof r.data.thumb_path === "string" ? r.data.thumb_path : null;
    const url = path ? urls.get(path) : undefined;
    if (url) {
      map.set(r.id, { kind: "photo", src: url, alt: typeof r.data.name === "string" ? r.data.name : "" });
      continue;
    }
    const visual = visualFor(r);
    if (visual.kind !== "generic") map.set(r.id, { kind: "visual", visual, sourceId: r.source_id });
  }
  return map;
}

type ConversationCandidate = Candidate & { row: Row; room: RoomId };

function candidatesFrom(rows: Row[], room: RoomId | "all"): ConversationCandidate[] {
  const out: ConversationCandidate[] = [];
  for (const row of rows) {
    const script = SCRIPTS[row.type];
    if (!script) continue;
    if (room !== "all" && script.room !== room) continue;
    out.push({
      key: obsKey(row.dedupe_key),
      observationId: row.id,
      sourceId: row.source_id,
      priority: row.priority_score,
      createdAt: row.created_at,
      question: QUESTION_TYPES.has(row.type),
      row,
      room: script.room,
    });
  }
  return out;
}

async function toViews(
  ctx: ExecutionContext,
  list: ConversationCandidate[],
  all: ConversationCandidate[],
  presentations: Map<string, PresentationRow>,
  now: Date,
  { nameOnFirst }: { nameOnFirst: boolean },
): Promise<ConversationView[]> {
  if (!list.length) return [];
  const rows = list.map((c) => c.row);
  const [versions, thumbs] = await Promise.all([sourceVersions(ctx, rows), thumbsFor(ctx, rows)]);
  const perRoom = new Map<RoomId, number>();
  for (const c of all) if (!isHidden(presentations.get(c.key), now)) perRoom.set(c.room, (perRoom.get(c.room) ?? 0) + 1);
  const views: ConversationView[] = [];
  list.forEach((c, i) => {
    const p = presentations.get(c.key);
    const opening = openingFor(c.row, voiceFor(ctx, now, { useName: nameOnFirst && i === 0 && !p, seenBefore: Boolean(p) }));
    if (!opening) return;
    views.push({
      key: c.key,
      observationId: c.observationId,
      type: c.row.type,
      room: opening.room,
      header: headerFor(opening.room, perRoom.get(opening.room) ?? 1),
      text: opening.text,
      variant: opening.variant,
      expression: opening.expression,
      detail: opening.detail,
      options: opening.options,
      thumb: thumbs.get(c.row.id) ?? null,
      sourceVersion: versions.get(c.row.source_id) ?? null,
      typed: Boolean(p),
      resume: p && p.outcome === "shown" ? p.script_step : null,
    });
  });
  return views;
}

/**
 * The Baptista thread of a room (or of the whole home): at most one active conversation and two
 * queued bubbles, today's budget of openings, personal snoozes and «Ora no» (B-5).
 */
export async function loadThread(
  ctx: ExecutionContext,
  { room = "all", daily = false, eventsLeftToday = 0, now = new Date() }: { room?: RoomId | "all"; daily?: boolean; eventsLeftToday?: number; now?: Date } = {},
): Promise<ThreadView> {
  await refreshObservations(ctx);
  const [rows, presentations] = await Promise.all([listObservations(ctx), listPresentations(ctx)]);
  const tz = ctx.household.timezone;
  const today = localDate(now, tz);
  const all = candidatesFrom(rows, room);
  const selection = selectThread(all, presentations, now, zonedToUtc(`${today}T00:00`, tz));
  const shown = [selection.active, ...selection.queue].filter((c): c is ConversationCandidate => c !== null);
  const views = await toViews(ctx, shown, all, presentations, now, { nameOnFirst: true });
  const line = daily ? dailyLine(today) : null;
  const dailyMemory = line ? presentations.get(line.key) : undefined;
  return {
    active: views[0] ?? null,
    queue: views.slice(1),
    deferredCount: selection.deferred.length,
    daily: line && dailyMemory?.outcome !== "dismissed" ? { ...line, typed: Boolean(dailyMemory) } : null,
    quiet: views.length ? null : quietLine(localHour(now, tz), eventsLeftToday, today),
  };
}

/** Baptista tab «Da rispondere»: every open conversation for the viewer, snoozed ones included. */
export async function loadOpen(ctx: ExecutionContext, now = new Date()): Promise<ConversationView[]> {
  await refreshObservations(ctx);
  const [rows, presentations] = await Promise.all([listObservations(ctx), listPresentations(ctx)]);
  const all = candidatesFrom(rows, "all").filter((c) => {
    const p = presentations.get(c.key);
    return !p || (p.outcome !== "dismissed" && p.outcome !== "acted");
  });
  const views = await toViews(ctx, all.slice(0, 30), all, presentations, now, { nameOnFirst: false });
  return views.map((v) => ({ ...v, typed: true }));
}

/** «Fatto di recente»: confirmed outcomes of the last 7 days (texts written after a server success). */
export async function loadRecent(ctx: ExecutionContext, now = new Date()) {
  const presentations = await listPresentations(ctx);
  const since = now.getTime() - 7 * 86_400_000;
  return [...presentations.values()]
    .filter((p) => p.outcome === "acted" && p.result_text && Date.parse(p.updated_at) >= since)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    .slice(0, 20)
    .map((p) => ({ key: p.key, text: p.result_text as string, at: p.updated_at }));
}

// Answers ------------------------------------------------------------------------------------

function morning(ctx: ExecutionContext, now: Date): Date {
  const today = localDate(now, ctx.household.timezone);
  return zonedToUtc(`${addDays(today, 1)}T08:00`, ctx.household.timezone);
}

export type Payload = Record<string, string | string[]>;

function formDataOf(payload: Payload): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(payload)) {
    for (const item of Array.isArray(v) ? v : [v]) fd.append(k, item);
  }
  return fd;
}

function parsePayload<S extends z.ZodType>(schema: S, payload: Payload): z.infer<S> {
  const parsed = parseForm(schema, formDataOf(payload));
  if (!parsed.ok) throw new DomainError("invalid", Object.values(parsed.state.fieldErrors ?? {})[0]);
  return parsed.data;
}

type Executed = { text: string; undo?: UndoToken | null; snoozeUntil?: Date };

async function requireSource<T extends { version: number }>(ctx: ExecutionContext, table: "food_items" | "tasks" | "wardrobe_items", id: string, version: number | null): Promise<T> {
  const row = await getRecord<T>(ctx, table, id);
  if (!row) throw new DomainError("not_found");
  if (version !== null && row.version !== version) throw new DomainError("conflict");
  return row;
}

const dietSchema = z.object({
  grams: decimal("Grammi", { exclusiveMin: true, max: 10000, decimals: 1 }),
  slot: z.enum(SLOTS.map((s) => s.id) as ["breakfast", "lunch", "dinner", "snack"]),
});

async function execute(ctx: ExecutionContext, o: Row, option: string, version: number | null, payload: Payload, now: Date): Promise<Executed> {
  const today = localDate(now, ctx.household.timezone);
  const name = typeof o.data.name === "string" ? o.data.name : "";
  const barcode = typeof o.data.barcode === "string" ? o.data.barcode : null;
  switch (`${o.type}:${option}`) {
    case "food_expiry:eaten":
    case "old_food:eaten":
    case "food_opened:eaten":
    case "old_food:thrown":
    case "food_opened:thrown": {
      const food = await requireSource<FoodItem>(ctx, "food_items", o.source_id, version);
      if (food.status !== "available" && food.status !== "opened") throw new DomainError("conflict");
      await updateVersioned(ctx, "food_items", food.id, food.version, { status: option === "eaten" ? "consumed" : "discarded" });
      return {
        text: DONE_TEXT[`food:${option}`],
        undo: { kind: "food_status", id: food.id, version: food.version + 1, status: food.status },
      };
    }
    case "overdue_task:done": {
      const task = await requireSource<Task>(ctx, "tasks", o.source_id, version);
      await updateVersioned(ctx, "tasks", task.id, task.version, { status: "completed" });
      return { text: DONE_TEXT["task:done"], undo: { kind: "task_open", id: task.id, version: task.version + 1 } };
    }
    case "overdue_task:tomorrow": {
      const task = await requireSource<Task>(ctx, "tasks", o.source_id, version);
      await updateVersioned(ctx, "tasks", task.id, task.version, { due_date: addDays(today, 1) });
      return { text: DONE_TEXT["task:tomorrow"] };
    }
    case "habit_progress:today": {
      const { error } = await ctx.supabase.from("habit_entries").insert({ household_id: ctx.household.id, habit_id: o.source_id, performed_on: today });
      if (error && error.code !== "23505") throwIfDbError(error);
      return { text: DONE_TEXT["habit:today"], snoozeUntil: morning(ctx, now) };
    }
    case "restock_question:add":
      await shopping.addFoods(ctx, [{ name, barcode }]);
      return { text: DONE_TEXT["restock:add"] };
    case "diet_log_question:log": {
      const input = parsePayload(dietSchema, payload);
      const food = await requireSource<FoodItem>(ctx, "food_items", o.source_id, null);
      if (food.kcal_100g === null) throw new DomainError("invalid");
      await diet.addFoodEntry(ctx, {
        eaten_on: today,
        slot: input.slot,
        label: food.product_name,
        grams: input.grams,
        kcal_100g: Number(food.kcal_100g),
        protein_100g: food.protein_100g === null ? null : Number(food.protein_100g),
        carbs_100g: food.carbs_100g === null ? null : Number(food.carbs_100g),
        fat_100g: food.fat_100g === null ? null : Number(food.fat_100g),
      });
      const kcal = Math.round((Number(food.kcal_100g) * input.grams) / 100);
      return { text: `Aggiunto al diario: ${kcal} kcal.` };
    }
    case "shopping_expense_question:record": {
      const input = parsePayload(shopping.shoppingExpenseSchema, payload);
      await shopping.registerShoppingExpense(ctx, o.source_id, input);
      return { text: `Fatto: spesa di ${formatMoney(input.total, input.currency)} registrata.` };
    }
    case "staple_suggestion:yes":
    case "staple_suggestion:never":
      await shopping.setStaple(ctx, name, barcode, option === "yes" ? "staple" : "declined");
      return { text: DONE_TEXT[`staple:${option}`] };
    case "staples_missing:add": {
      const chosen = new Set(Array.isArray(payload.item) ? payload.item : payload.item ? [payload.item] : []);
      const items = (Array.isArray(o.data.items) ? (o.data.items as Array<{ id: string; name: string; barcode: string | null }>) : []).filter((i) => chosen.has(i.id));
      if (!items.length) throw new DomainError("invalid", "Spunta almeno un prodotto.");
      await shopping.addFoods(ctx, items.map((i) => ({ name: i.name, barcode: i.barcode })));
      return { text: DONE_TEXT["staples:add"] };
    }
    case "wardrobe_acquisition:bought": {
      const item = await requireSource<WardrobeItem>(ctx, "wardrobe_items", o.source_id, version);
      const input = parsePayload(wardrobe.purchaseSchema, { ...payload, version: String(item.version) });
      const expenseId = await wardrobe.registerPurchase(ctx, item.id, input);
      return {
        text: expenseId && input.price !== null ? `Fatto: ${formatMoney(input.price, input.currency)} registrati in Abbigliamento.` : "Segnato come acquisto, senza spesa.",
      };
    }
    case "wardrobe_acquisition:owned":
    case "wardrobe_acquisition:gift": {
      const item = await requireSource<WardrobeItem>(ctx, "wardrobe_items", o.source_id, version);
      await wardrobe.setAcquisition(ctx, item.id, item.version, option === "owned" ? "owned_before" : "gift");
      return { text: DONE_TEXT[`wardrobe:${option}`] };
    }
    default:
      throw new DomainError("invalid");
  }
}

/**
 * The user's answer to a conversation: only options declared by the observation's script are
 * accepted; identity and household come from the session, the record from RLS.
 */
export async function answer(
  ctx: ExecutionContext,
  observationId: string,
  optionId: string,
  version: number | null,
  payload: Payload,
  now = new Date(),
): Promise<AnswerState> {
  const o = await getObservation(ctx, observationId);
  if (!o) throw new DomainError("not_found");
  const script = SCRIPTS[o.type];
  const option = script?.options(o, voiceFor(ctx, now)).find((x) => x.id === optionId);
  if (!script || !option) throw new DomainError("invalid");
  const key = obsKey(o.dedupe_key);

  switch (option.kind) {
    case "snooze": {
      const until = option.snooze === "morning" ? morning(ctx, now) : new Date(now.getTime() + (option.snooze ?? 4) * 3_600_000);
      await recordPresentation(ctx, key, { observationId: o.id, outcome: "snoozed", snoozedUntil: until, step: option.id });
      return { ok: true, text: option.snoozeText };
    }
    case "dismiss":
      await recordPresentation(ctx, key, { observationId: o.id, outcome: "dismissed", step: option.id });
      return { ok: true };
    case "link":
      await recordPresentation(ctx, key, { observationId: o.id, outcome: "answered", step: option.id });
      return { ok: true };
    default: {
      const done = await execute(ctx, o, option.id, version, payload, now);
      await recordPresentation(ctx, key, {
        observationId: o.id,
        outcome: done.snoozeUntil ? "snoozed" : "acted",
        snoozedUntil: done.snoozeUntil ?? null,
        step: option.id,
        resultText: done.text,
      });
      return { ok: true, text: done.text, undo: done.undo ?? null };
    }
  }
}

/** «Ora no» (×): personal, the fact stays for the other members (B-4). */
export async function dismissForMe(ctx: ExecutionContext, observationId: string) {
  const o = await getObservation(ctx, observationId);
  if (!o) throw new DomainError("not_found");
  await recordPresentation(ctx, obsKey(o.dedupe_key), { observationId: o.id, outcome: "dismissed", step: "ora_no" });
}

/** The message was typed out once for this viewer (B-6.6); also counts today's openings. */
export async function markShown(ctx: ExecutionContext, key: string, observationId: string | null, variant: string | null) {
  if (observationId) {
    const o = await getObservation(ctx, observationId);
    if (!o || obsKey(o.dedupe_key) !== key) throw new DomainError("not_found");
  } else if (!/^daily:\d{4}-\d{2}-\d{2}$/.test(key)) {
    throw new DomainError("invalid");
  }
  await recordPresentation(ctx, key, { observationId, variant });
}

/** Where the conversation is (confirming/form), to resume on another device. */
export async function saveStep(ctx: ExecutionContext, observationId: string, step: string | null) {
  const o = await getObservation(ctx, observationId);
  if (!o) throw new DomainError("not_found");
  await recordPresentation(ctx, obsKey(o.dedupe_key), { observationId: o.id, step: step ?? "opening" });
}

/** Undo: the inverse of a verified action, again with version check and RLS. */
export async function undo(ctx: ExecutionContext, token: UndoToken) {
  if (token.kind === "food_status") {
    await updateVersioned(ctx, "food_items", token.id, token.version, { status: token.status });
  } else {
    await updateVersioned(ctx, "tasks", token.id, token.version, { status: "open" });
  }
}

/** «Chiudi fino a domani» on the daily line. */
export async function closeDaily(ctx: ExecutionContext, now = new Date()) {
  const line = dailyLine(localDate(now, ctx.household.timezone));
  await recordPresentation(ctx, line.key, { outcome: "dismissed" });
}
