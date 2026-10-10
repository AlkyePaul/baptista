/**
 * Attention budget (B-5), pure: at most one active conversation and two queued bubbles; at most
 * three new openings per viewer and local day (already-opened conversations are free); personal
 * snoozes and «Ora no» respected; connection questions born from a gesture go first.
 */

import type { Presentation } from "@/lib/db/types";

export const THREAD_SIZE = 3;
export const MAX_OPENINGS_PER_DAY = 3;
/** A question younger than this is the answer to what the user just did. */
export const FRESH_QUESTION_MS = 10 * 60_000;

export type Candidate = {
  key: string;
  observationId: string;
  sourceId: string;
  priority: number;
  createdAt: string;
  question: boolean;
};

export type ThreadSelection<C extends Candidate> = {
  active: C | null;
  queue: C[];
  /** Pertinent but beyond today's budget: reachable in the Baptista tab («Da rispondere»). */
  deferred: C[];
};

export function isHidden(p: Pick<Presentation, "outcome" | "snoozed_until"> | undefined, now: Date): boolean {
  if (!p) return false;
  if (p.outcome === "dismissed" || p.outcome === "acted") return true;
  return p.snoozed_until !== null && Date.parse(p.snoozed_until) > now.getTime();
}

export function rank<C extends Candidate>(candidates: readonly C[], now: Date): C[] {
  const fresh = (c: C) => c.question && now.getTime() - Date.parse(c.createdAt) < FRESH_QUESTION_MS;
  return [...candidates].sort(
    (a, b) =>
      Number(fresh(b)) - Number(fresh(a)) ||
      b.priority - a.priority ||
      a.createdAt.localeCompare(b.createdAt) ||
      a.key.localeCompare(b.key),
  );
}

/**
 * @param presentations viewer's memory by key
 * @param dayStart start of the viewer's local day (openings counted from here)
 */
export function selectThread<C extends Candidate>(
  candidates: readonly C[],
  presentations: ReadonlyMap<string, Pick<Presentation, "outcome" | "snoozed_until" | "first_shown_at">>,
  now: Date,
  dayStart: Date,
  { size = THREAD_SIZE, maxOpenings = MAX_OPENINGS_PER_DAY } = {},
): ThreadSelection<C> {
  let openings = 0;
  for (const [key, p] of presentations) {
    if (key.startsWith("obs:") && Date.parse(p.first_shown_at) >= dayStart.getTime()) openings += 1;
  }
  const shown: C[] = [];
  const deferred: C[] = [];
  const sources = new Set<string>();
  for (const c of rank(candidates, now)) {
    const p = presentations.get(c.key);
    if (isHidden(p, now)) continue;
    // One conversation per record at a time (e.g. «finito: in lista?» before «nel diario?»).
    if (sources.has(c.sourceId)) {
      deferred.push(c);
      continue;
    }
    const alreadyOpened = p !== undefined;
    if (shown.length < size && (alreadyOpened || openings < maxOpenings)) {
      if (!alreadyOpened) openings += 1;
      shown.push(c);
      sources.add(c.sourceId);
    } else {
      deferred.push(c);
    }
  }
  return { active: shown[0] ?? null, queue: shown.slice(1), deferred };
}
