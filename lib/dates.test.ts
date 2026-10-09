import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  addDays,
  formatDay,
  isCivilDate,
  localDate,
  relativeDay,
  toLocalInput,
  weekDays,
  weekStart,
  zonedToUtc,
} from "./dates";

const ROME = "Europe/Rome";

test("local date follows the household timezone, not UTC", () => {
  // 23:30 UTC on Sunday 25 Oct 2026 is already Monday in Rome (after DST ends).
  assert.equal(localDate(new Date("2026-10-25T23:30:00Z"), ROME), "2026-10-26");
  assert.equal(localDate(new Date("2026-10-25T23:30:00Z"), "America/New_York"), "2026-10-25");
});

test("zonedToUtc handles both sides of a DST change", () => {
  assert.equal(zonedToUtc("2026-07-01T10:00", ROME).toISOString(), "2026-07-01T08:00:00.000Z");
  assert.equal(zonedToUtc("2026-12-01T10:00", ROME).toISOString(), "2026-12-01T09:00:00.000Z");
  // Ambiguous 02:30 on 25 Oct resolves to the first occurrence (CEST, +02:00).
  assert.equal(zonedToUtc("2026-10-25T02:30", ROME).toISOString(), "2026-10-25T00:30:00.000Z");
  // Non-existent 02:30 on 29 Mar moves forward.
  assert.equal(zonedToUtc("2026-03-29T02:30", ROME).toISOString(), "2026-03-29T01:30:00.000Z");
  assert.throws(() => zonedToUtc("2026-13-01", ROME));
});

test("round trip through the datetime-local representation", () => {
  const instant = zonedToUtc("2026-10-09T18:45", ROME);
  assert.equal(toLocalInput(instant, ROME), "2026-10-09T18:45");
});

test("weeks start on Monday and can span months", () => {
  assert.equal(weekStart("2026-11-01"), "2026-10-26");
  assert.equal(weekStart("2026-10-26"), "2026-10-26");
  assert.deepEqual(weekDays("2026-10-29").at(-1), "2026-11-01");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
});

test("civil date validation and Italian labels", () => {
  assert.equal(isCivilDate("2026-02-29"), false);
  assert.equal(isCivilDate("2028-02-29"), true);
  assert.equal(formatDay("2026-09-14"), "lun 14 set");
  assert.equal(relativeDay("2026-10-10", "2026-10-09"), "domani");
});

test("month grid is Monday-first and covers whole weeks", async () => {
  const { monthGrid, addMonths, formatMonth } = await import("./dates");
  const grid = monthGrid("2026-10");
  assert.equal(grid[0][0], "2026-09-28");
  assert.equal(grid.at(-1)!.at(-1), "2026-11-01");
  assert.ok(grid.every((w) => w.length === 7));
  assert.equal(monthGrid("2027-02").length, 4); // Feb 2027 starts on Monday, 28 days
  assert.equal(addMonths("2026-12", 1), "2027-01");
  assert.equal(formatMonth("2026-10"), "ottobre 2026");
});
