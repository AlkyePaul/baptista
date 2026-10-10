import { strict as assert } from "node:assert";
import { test } from "node:test";
import { isHidden, selectThread, type Candidate } from "./attention";
import { spendingComparison } from "./calculations";
import { DAILY, dailyLine } from "./daily";
import { expressionFor } from "./expressions";
import { initialConversation, persistedStep, reduce, resumeFrom } from "./machine";
import { openingFor, QUESTION_TYPES, SCRIPTS, type ObservationInput, type VoiceContext } from "./scripts";
import { dayNumber, pick, stableHash } from "./select";
import { headerFor, quietLine } from "./templates";
import { MAX_TYPING_MS, typingSchedule, visibleCount } from "./typing";

const voice: VoiceContext = { viewerName: "Paolo", useName: false, today: "2026-10-10", hour: 9, timeZone: "Europe/Rome", seenBefore: false };

function obs(type: string, data: Record<string, unknown>, extra: Partial<ObservationInput> = {}): ObservationInput {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    type,
    title: "Titolo",
    description: "Descrizione",
    source_type: "x",
    source_id: "00000000-0000-4000-8000-000000000002",
    dedupe_key: `${type}:1`,
    confidence: 1,
    priority_score: 50,
    created_at: "2026-10-10T07:00:00Z",
    data,
    ...extra,
  };
}

/** One realistic sample per detector type (same keys as the SQL detectors). */
const SAMPLES: ObservationInput[] = [
  obs("food_expiry", { name: "Pollo", storage: "fridge", expires_on: "2026-10-11", days_left: 1, estimated: false }),
  obs("food_expiry", { name: "Uva", storage: "fridge", expires_on: "2026-10-11", days_left: 1, estimated: true }, { dedupe_key: "food_expiry:2" }),
  obs("food_expiry", { name: "Prosciutto", storage: "fridge", expires_on: "2026-10-08", days_left: -2, estimated: false }, { dedupe_key: "food_expiry:3" }),
  obs("old_food", { name: "Insalata", storage: "fridge", days: 9, estimated: true }),
  obs("food_opened", { name: "Passata", storage: "fridge", days: 4, estimated: true }),
  obs("restock_question", { name: "Latte", barcode: null, status: "consumed" }),
  obs("diet_log_question", { name: "Banana", kcal_100g: 89 }),
  obs("shopping_expense_question", { count: 5, stocked_on: "2026-10-10", names: [] }),
  obs("staple_suggestion", { name: "Uova", barcode: null, count: 3 }),
  obs("staples_missing", { items: [{ id: "a", name: "Uova", barcode: null }, { id: "b", name: "Pane", barcode: null }] }),
  obs("overdue_task", { due_date: "2026-10-08", days_overdue: 2, title: "Pagare la bolletta" }),
  obs("upcoming_calendar", { starts_at: "2026-10-10T16:00:00Z", all_day: false }, { title: "Dentista" }),
  obs("upcoming_calendar", { start_date: "2026-10-11", end_date: "2026-10-12", all_day: true }, { title: "Gita", dedupe_key: "uc:2" }),
  obs("calendar_overlap", { first: "Dentista", second: "Riunione", starts_at: "2026-10-10T16:00:00Z" }, { description: "sab 10/10: 18:00–19:00 e 18:30–20:00" }),
  obs("habit_progress", { title: "Passeggiata", logged: 4, target: 5, days_left: 3, done_today: false }),
  obs("habit_progress", { title: "Passeggiata", logged: 4, target: 5, days_left: 1, done_today: false }, { dedupe_key: "hp:2" }),
  obs("habit_progress", { title: "Lettura", logged: 0, target: 3, days_left: 5, done_today: true }, { dedupe_key: "hp:3" }),
  obs("missed_habit", { title: "Corsa", logged: 1, target: 3 }),
  obs("goal_progress", { title: "50 corse", percent: 40 }),
  obs("goal_progress", { title: "50 corse", percent: 100 }, { dedupe_key: "gp:2" }),
  obs("wardrobe_acquisition", { name: "Camicia di lino", type: "top", brand: null, thumb_path: null, private: false }),
  obs("wardrobe_from_expense", { label: "Scarpe", total: 80, currency: "EUR" }),
  obs("budget_threshold", { category: "Svago", spent: 85, budget: 100, currency: "EUR", percent: 85, level: 80, days_left: 12 }),
  obs("budget_threshold", { category: null, spent: 120, budget: 100, currency: "EUR", percent: 120, level: 100, days_left: 3 }, { dedupe_key: "bt:2" }),
];

test("every detector type has a script, and every sample produces a complete Italian sentence", () => {
  const detectorTypes = [
    "food_expiry", "old_food", "food_opened", "restock_question", "diet_log_question", "shopping_expense_question",
    "staple_suggestion", "staples_missing", "overdue_task", "upcoming_calendar", "calendar_overlap", "habit_progress",
    "missed_habit", "goal_progress", "wardrobe_acquisition", "wardrobe_from_expense", "budget_threshold",
  ];
  for (const t of detectorTypes) assert.ok(SCRIPTS[t], `script for ${t}`);
  for (const t of detectorTypes) assert.ok(SAMPLES.some((s) => s.type === t), `sample for ${t}`);
  for (const sample of SAMPLES) {
    const script = SCRIPTS[sample.type];
    // Every alternative is reachable and fillable: check them all, not only the picked one.
    for (const text of script.opening(sample, { ...voice, useName: true })) {
      assert.ok(text.length > 10, `${sample.type}: ${text}`);
      assert.doesNotMatch(text, /undefined|NaN|null|\{|\}|\[object/, `${sample.type}: ${text}`);
    }
    const options = script.options(sample, voice);
    assert.ok(options.length >= 2, `${sample.type} has explicit options`);
    assert.equal(new Set(options.map((o) => o.id)).size, options.length);
    for (const o of options) {
      assert.match(o.id, /^[a-z_]{1,30}$/);
      if (o.kind === "confirm") assert.ok(o.confirm?.text && o.confirm.button);
      if (o.kind === "form") assert.ok(o.form?.fields.length);
      if (o.kind === "link") assert.ok(o.href?.startsWith("/"));
    }
  }
});

test("mockup script: expiring chicken, «Sì, c'è ancora» / «L'abbiamo mangiato» / «Più tardi»", () => {
  const opening = openingFor(SAMPLES[0], voice)!;
  assert.match(opening.text, /Pollo scade domani/);
  assert.equal(opening.expression, "alert");
  assert.deepEqual(opening.options.map((o) => o.label), ["Sì, c'è ancora", "L'abbiamo mangiato", "Più tardi"]);
  assert.equal(opening.options[1].confirm?.text, "Lo segno come consumato?");
  assert.equal(opening.room, "cucina");
  // Estimates never sound like facts.
  const grape = openingFor(SAMPLES[1], voice)!;
  assert.match(grape.text, /stima/);
  assert.equal(grape.expression, "thoughtful");
});

test("template choice is stable for the same observation and day, and may change across days", () => {
  const a = openingFor(SAMPLES[0], voice)!;
  const b = openingFor(SAMPLES[0], voice)!;
  assert.deepEqual(a, b);
  const variants = new Set(Array.from({ length: 20 }, (_, i) => openingFor(SAMPLES[0], { ...voice, today: `2026-10-${String(i + 1).padStart(2, "0")}` })!.variant));
  assert.ok(variants.size > 1, "alternatives are used over time");
  assert.equal(stableHash("abc"), stableHash("abc"));
  assert.equal(pick(["x"], "seed").value, "x");
});

test("the viewer's name appears only when allowed (opening, once per session)", () => {
  assert.doesNotMatch(openingFor(SAMPLES[0], voice)!.text, /Paolo/);
  assert.match(openingFor(SAMPLES[0], { ...voice, useName: true })!.text, /^Paolo, /);
});

test("habit 4/5 example: one missing; last day; celebration on a reached goal", () => {
  assert.match(SCRIPTS.habit_progress.opening(SAMPLES[14], voice)[0], /quattro su 5 questa settimana\. Ne manca una\./);
  assert.match(SCRIPTS.habit_progress.opening(SAMPLES[15], voice)[0], /ancora una volta oggi e l'obiettivo della settimana è fatto/);
  assert.ok(!SCRIPTS.habit_progress.options(SAMPLES[16], voice).some((o) => o.id === "today"), "already logged today: nothing to log");
  assert.equal(openingFor(SAMPLES[19], voice)!.expression, "confirmation");
  assert.match(openingFor(SAMPLES[19], voice)!.text, /traguardo raggiunto|fatto/);
});

test("expressions are mapped deterministically from type and phase", () => {
  assert.equal(expressionFor("food_expiry", "opening"), "alert");
  assert.equal(expressionFor("food_expiry", "opening", { estimated: true }), "thoughtful");
  assert.equal(expressionFor("wardrobe_acquisition", "opening"), "thoughtful");
  assert.equal(expressionFor("restock_question", "opening"), "suggestion");
  assert.equal(expressionFor("anything", "proposing"), "suggestion");
  assert.equal(expressionFor("anything", "done"), "confirmation");
  assert.equal(expressionFor("anything", "failed"), "thoughtful");
  for (const t of QUESTION_TYPES) assert.ok(SCRIPTS[t]);
});

test("state machine: no confirmation without a successful execution; retry; conflict; resume", () => {
  let s = reduce(initialConversation, { type: "succeeded", text: "Fatto" });
  assert.equal(s.step, "opening", "success out of nowhere is ignored");
  s = reduce(s, { type: "choose", option: "eaten", next: "confirm" });
  assert.deepEqual(s, { step: "confirming", option: "eaten" });
  assert.equal(persistedStep(s), "confirming:eaten");
  assert.equal(reduce(s, { type: "succeeded", text: "x" }).step, "confirming", "no done before executing");
  s = reduce(s, { type: "confirm" });
  assert.equal(s.step, "executing");
  const failed = reduce(s, { type: "failed", message: "Non sono riuscito" });
  assert.equal(failed.step, "failed");
  assert.equal(reduce(failed, { type: "retry" }).step, "executing");
  const conflict = reduce(s, { type: "failed", message: "x", conflict: true });
  assert.equal(reduce(conflict, { type: "retry" }).step, "failed", "a conflict needs a reload, not a retry");
  const done = reduce(s, { type: "succeeded", text: "Fatto, segnato come consumato.", undo: true });
  assert.deepEqual(done, { step: "done", option: "eaten", text: "Fatto, segnato come consumato.", undo: true });
  assert.equal(reduce(done, { type: "undone" }).step, "opening");
  assert.deepEqual(resumeFrom("form:bought", ["bought", "owned"]), { step: "form", option: "bought" });
  assert.deepEqual(resumeFrom("form:evil", ["bought"]), initialConversation);
  assert.deepEqual(reduce(reduce(initialConversation, { type: "choose", option: "x", next: "form" }), { type: "cancel" }), initialConversation);
});

test("attention budget: 1 active + 2 queued, 3 new openings a day, snooze and «Ora no» respected", () => {
  const now = new Date("2026-10-10T10:00:00Z");
  const dayStart = new Date("2026-10-09T22:00:00Z");
  const c = (key: string, priority: number, extra: Partial<Candidate> = {}): Candidate => ({
    key,
    observationId: key,
    sourceId: key,
    priority,
    createdAt: "2026-10-10T06:00:00Z",
    question: false,
    ...extra,
  });
  const list = [c("a", 90), c("b", 80), c("c", 70), c("d", 60), c("e", 50)];
  const none = new Map();
  const sel = selectThread(list, none, now, dayStart);
  assert.equal(sel.active?.key, "a");
  assert.deepEqual(sel.queue.map((x) => x.key), ["b", "c"]);
  assert.deepEqual(sel.deferred.map((x) => x.key), ["d", "e"]);

  // Two openings already used today: only one new conversation may open; seen ones are free.
  const memory = new Map([
    ["x1", { outcome: "shown" as const, snoozed_until: null, first_shown_at: "2026-10-10T07:00:00Z" }],
    ["x2", { outcome: "shown" as const, snoozed_until: null, first_shown_at: "2026-10-10T08:00:00Z" }],
    ["c", { outcome: "shown" as const, snoozed_until: null, first_shown_at: "2026-10-09T08:00:00Z" }],
    ["a", { outcome: "snoozed" as const, snoozed_until: "2026-10-10T12:00:00Z", first_shown_at: "2026-10-09T08:00:00Z" }],
    ["b", { outcome: "dismissed" as const, snoozed_until: null, first_shown_at: "2026-10-09T08:00:00Z" }],
  ]);
  const keyed = list.map((x) => ({ ...x, key: x.key }));
  const withMemory = selectThread(
    keyed,
    new Map([...memory].map(([k, v]) => [k.startsWith("x") ? `obs:${k}` : k, v])),
    now,
    dayStart,
  );
  assert.equal(withMemory.active?.key, "c", "snoozed and dismissed are skipped");
  assert.ok(isHidden({ outcome: "snoozed", snoozed_until: "2026-10-10T12:00:00Z" }, now));
  assert.ok(!isHidden({ outcome: "snoozed", snoozed_until: "2026-10-10T09:00:00Z" }, now), "an expired snooze shows again");

  // A question born from a gesture goes first, even with a lower score.
  const fresh = selectThread([c("old", 95), c("q", 40, { question: true, createdAt: "2026-10-10T09:58:00Z" })], none, now, dayStart);
  assert.equal(fresh.active?.key, "q");
  // One conversation per record at a time.
  const same = selectThread([c("r1", 90, { sourceId: "food" }), c("r2", 80, { sourceId: "food" })], none, now, dayStart);
  assert.deepEqual([same.active?.key, same.queue.length, same.deferred.length], ["r1", 0, 1]);
});

test("daily line: same for everyone on a day, different over N consecutive days, kinds declared", () => {
  const a = dailyLine("2026-10-10");
  assert.deepEqual(a, dailyLine("2026-10-10"));
  const n = DAILY.length;
  const start = dayNumber("2026-10-10");
  const seen = new Set(Array.from({ length: n }, (_, i) => dailyLine(new Date((start + i) * 86_400_000).toISOString().slice(0, 10)).entry.text));
  assert.equal(seen.size, n, "no repetition before N days");
  for (const e of DAILY) {
    if (e.kind === "quote") assert.ok(e.author.trim() && e.source.trim(), "every quote has an author and a source");
    else assert.ok(!("author" in e), "jokes and aphorisms never have an author");
  }
  for (let i = 0; i < 2 * n; i += 1) {
    const line = dailyLine(new Date((start + i) * 86_400_000).toISOString().slice(0, 10));
    if (line.entry.kind === "quote") {
      assert.ok(line.intro.includes(line.entry.author), "the intro names the author");
      assert.match(line.text, /^«.*»$/);
      assert.equal(line.expression, "suggestion");
    } else if (line.entry.kind === "joke") {
      assert.match(line.intro, /battuta|facezia/);
      assert.equal(line.author, null);
      assert.equal(line.expression, "confirmation");
    }
  }
  // Themes asked by the user: one joke and one quote each.
  for (const theme of ["famiglia", "finanze", "cucina", "guardaroba"]) {
    assert.deepEqual(DAILY.filter((e) => e.theme === theme).map((e) => e.kind).sort(), ["joke", "quote"]);
  }
});

test("typing: ~30 ms per letter, pauses after punctuation, at most ~2 s; tap shows all", () => {
  const short = typingSchedule("Fatto. Ok");
  assert.equal(short[0], 30);
  assert.equal(short[6] - short[5], 30 + 250, "a pause after «.» before the next word");
  const long = typingSchedule("x".repeat(400));
  assert.ok(long.at(-1)! <= MAX_TYPING_MS);
  assert.equal(visibleCount(short, 0), 0);
  assert.equal(visibleCount(short, 10_000), short.length);
  assert.equal(typingSchedule("12,50 €").filter((t, i, all) => i > 0 && t - all[i - 1] > 30).length, 0, "no pause inside numbers");
});

test("headers, quiet line and calculations read like the mockup", () => {
  assert.equal(headerFor("cucina", 1), "CUCINA · 1 ELEMENTO");
  assert.equal(headerFor("finanze", 2), "FINANZE · 2 ELEMENTI");
  assert.equal(quietLine(9, 2, "2026-10-10"), "Tutto in ordine: restano 2 impegni oggi.");
  assert.ok(["Una serata tranquilla.", "Tutto in ordine per stasera."].includes(quietLine(21, 0, "2026-10-10")));
  const cur = [{ occurred_on: "2026-10-05", currency: "EUR", total: 120, category_id: null }];
  const prev = [
    { occurred_on: "2026-09-04", currency: "EUR", total: 100, category_id: null },
    { occurred_on: "2026-09-25", currency: "EUR", total: 500, category_id: null },
  ];
  assert.equal(spendingComparison(cur, prev, "2026-10-10", "2026-09").replace(/ /g, " "), "Finora 120,00 €, 20% in più di settembre allo stesso punto.");
});
