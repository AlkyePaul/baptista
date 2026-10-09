import { strict as assert } from "node:assert";
import { test } from "node:test";
import type { Observation } from "@/lib/db/types";
import { buildBriefing, visualFor } from "./briefing";

const obs = (id: string, source: string, score: number, confidence = 1): Observation => ({
  id,
  type: "x",
  title: id,
  description: null,
  source_type: "task",
  source_id: source,
  visibility: "household",
  priority_score: score,
  confidence,
  data: {},
  created_at: "2026-10-09T00:00:00Z",
  valid_until: null,
});

test("briefing keeps the ranked order, one card per source, max three", () => {
  const items = buildBriefing([obs("a", "s1", 90), obs("b", "s1", 80), obs("c", "s2", 60), obs("d", "s3", 40), obs("e", "s4", 30)]);
  assert.deepEqual(items.map((i) => i.id), ["a", "c", "d"]);
  assert.deepEqual(items.map((i) => i.tone), ["urgent", "normal", "info"]);
});

test("low-confidence situations are flagged as hedged", () => {
  const [item] = buildBriefing([obs("a", "s1", 50, 0.6)]);
  assert.equal(item.hedged, true);
});

test("empty input gives an empty briefing", () => {
  assert.deepEqual(buildBriefing([]), []);
});

test("visuals come from detector data and tolerate missing fields", () => {
  assert.deepEqual(visualFor({ type: "overdue_task", data: { days_overdue: 3 } }), { kind: "overdue", days: 3 });
  assert.deepEqual(visualFor({ type: "habit_progress", data: { logged: 1, target: 3 } }), {
    kind: "habit",
    logged: 1,
    target: 3,
    finishedWeek: false,
  });
  assert.deepEqual(visualFor({ type: "goal_progress", data: { percent: 140 } }), { kind: "goal", percent: 100 });
  assert.deepEqual(visualFor({ type: "goal_progress", data: {} }), { kind: "goal", percent: 0 });
  assert.equal(visualFor({ type: "upcoming_calendar", data: { start_date: "2026-10-10", all_day: true } }).kind, "event");
  assert.deepEqual(visualFor({ type: "something_new", data: {} }), { kind: "generic" });
});
