/**
 * Letter-by-letter timing (B-6, user 2026-10-10): ~30 ms per character, short pauses after
 * punctuation, total capped at ~2 s (long texts speed up). Pure: returns, for each character,
 * the time (ms from the start) at which it becomes visible.
 */

export const AVATAR_FADE_MS = 400;
export const CHAR_MS = 30;
export const COMMA_PAUSE_MS = 120;
export const STOP_PAUSE_MS = 250;
export const MAX_TYPING_MS = 2000;

export function typingSchedule(text: string): number[] {
  const chars = [...text];
  const raw: number[] = [];
  let t = 0;
  for (let i = 0; i < chars.length; i += 1) {
    t += CHAR_MS;
    raw.push(t);
    const ch = chars[i];
    const next = chars[i + 1];
    // Pause after punctuation followed by a space or the end (not inside numbers like 12,50).
    if (next === undefined || next === " ") {
      if (ch === ",") t += COMMA_PAUSE_MS;
      else if (ch === "." || ch === "?" || ch === ":" || ch === "!" || ch === ";") t += STOP_PAUSE_MS;
    }
  }
  const total = raw.at(-1) ?? 0;
  if (total <= MAX_TYPING_MS) return raw;
  const scale = MAX_TYPING_MS / total;
  return raw.map((ms) => Math.round(ms * scale));
}

/** How many characters are visible after `elapsed` ms. */
export function visibleCount(schedule: readonly number[], elapsed: number): number {
  let lo = 0;
  let hi = schedule.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (schedule[mid] <= elapsed) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
