import type { Observation } from "@/lib/db/types";

/** AGENT.md: retrieve at most 10 candidates, show at most 3 situations. */
export const BRIEFING_CANDIDATES = 10;
export const BRIEFING_SIZE = 3;

/** What to draw next to a situation; every number comes from the deterministic detector data. */
export type BriefingVisual =
  | { kind: "event"; day: string | null; startsAt: string | null; allDay: boolean }
  | { kind: "overdue"; days: number }
  | { kind: "habit"; logged: number; target: number; finishedWeek: boolean }
  | { kind: "goal"; percent: number }
  | { kind: "food"; daysLeft: number | null; estimated: boolean }
  | { kind: "generic" };

export type BriefingItem = {
  id: string;
  sourceId: string;
  type: string;
  title: string;
  description: string | null;
  href: string;
  tone: "urgent" | "normal" | "info";
  /** Estimates and absence of records are never presented as certain facts. */
  hedged: boolean;
  visual: BriefingVisual;
};

const SOURCE_HREF: Record<string, string> = {
  calendar_event: "/calendario",
  task: "/aggiungi?tipo=attivita",
  habit: "/abitudini",
  goal: "/abitudini#obiettivi",
  food_item: "/stanze/cucina/dispensa",
};

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

/**
 * Deterministic briefing: one card per source (the highest ranked), top 3, input already ranked
 * by the database. Always available without any AI provider.
 */
export function buildBriefing(observations: Observation[]): BriefingItem[] {
  const seenSources = new Set<string>();
  const items: BriefingItem[] = [];
  for (const o of observations) {
    if (seenSources.has(o.source_id)) continue;
    seenSources.add(o.source_id);
    const score = Number(o.priority_score);
    items.push({
      id: o.id,
      sourceId: o.source_id,
      type: o.type,
      title: o.title,
      description: o.description,
      href: SOURCE_HREF[o.source_type] ?? "/",
      tone: score >= 75 ? "urgent" : score >= 50 ? "normal" : "info",
      hedged: Number(o.confidence) < 1,
      visual: visualFor(o),
    });
    if (items.length === BRIEFING_SIZE) break;
  }
  return items;
}
