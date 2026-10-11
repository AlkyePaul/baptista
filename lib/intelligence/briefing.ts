import type { Observation } from "@/lib/db/types";

/** What to draw next to a situation; every number comes from the deterministic detector data. */
export type BriefingVisual =
  | { kind: "event"; day: string | null; startsAt: string | null; allDay: boolean }
  | { kind: "overdue"; days: number }
  | { kind: "habit"; logged: number; target: number; finishedWeek: boolean }
  | { kind: "goal"; percent: number }
  | { kind: "food"; daysLeft: number | null; estimated: boolean }
  | { kind: "generic" };

const num = (value: unknown, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};
const str = (value: unknown) => (typeof value === "string" ? value : null);

export function visualFor(o: Pick<Observation, "type" | "data">): BriefingVisual {
  const d = o.data ?? {};
  switch (o.type) {
    case "upcoming_calendar":
      return {
        kind: "event",
        allDay: d.all_day === true || typeof d.start_date === "string",
        day: str(d.start_date),
        startsAt: str(d.starts_at),
      };
    case "overdue_task":
      return { kind: "overdue", days: Math.max(1, num(d.days_overdue, 1)) };
    case "habit_progress":
    case "missed_habit":
      return {
        kind: "habit",
        logged: num(d.logged),
        target: Math.max(1, num(d.target, 1)),
        finishedWeek: o.type === "missed_habit",
      };
    case "goal_progress":
      return { kind: "goal", percent: Math.max(0, Math.min(100, num(d.percent))) };
    case "food_expiry":
      return { kind: "food", daysLeft: num(d.days_left), estimated: d.estimated === true };
    case "old_food":
      return { kind: "food", daysLeft: null, estimated: true };
    default:
      return { kind: "generic" };
  }
}
