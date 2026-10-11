import { strict as assert } from "node:assert";
import { test } from "node:test";
import { visualFor } from "./briefing";

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
