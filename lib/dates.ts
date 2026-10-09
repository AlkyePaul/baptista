/**
 * Timezone-aware date helpers (pure, no dependencies). Civil dates are `YYYY-MM-DD` strings;
 * instants are `Date`. All "today"/"week" logic uses the household timezone, never the
 * machine clock's zone (docs/architecture/DATABASE.md).
 */

const LOCALE = "it-IT";

function parts(date: Date, timeZone: string) {
  const formatted = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: string) => Number(formatted.find((p) => p.type === type)?.value);
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

const pad = (n: number, size = 2) => String(n).padStart(size, "0");

/** Offset of `timeZone` from UTC at `date`, in milliseconds. */
export function tzOffsetMs(date: Date, timeZone: string): number {
  const p = parts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Local civil date (`YYYY-MM-DD`) of an instant in `timeZone`. */
export function localDate(date: Date, timeZone: string): string {
  const p = parts(date, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

export function localHour(date: Date, timeZone: string): number {
  return parts(date, timeZone).hour;
}

/** `YYYY-MM-DDTHH:mm` as shown in a datetime-local input for `timeZone`. */
export function toLocalInput(date: Date, timeZone: string): string {
  const p = parts(date, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

/**
 * Converts a wall-clock time in `timeZone` to an instant. Non-existent times (DST gap) shift
 * forward; ambiguous times (DST overlap) resolve to the first occurrence.
 */
export function zonedToUtc(localDateTime: string, timeZone: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(localDateTime);
  if (!match) throw new RangeError("invalid_local_datetime");
  const [, y, mo, d, h, mi] = match.map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  // Try both candidate offsets around the instant and keep a consistent one.
  const offsets = [tzOffsetMs(new Date(wall - 864e5 / 2), timeZone), tzOffsetMs(new Date(wall + 864e5 / 2), timeZone)];
  const candidates = offsets
    .map((offset) => wall - offset)
    .filter((t) => tzOffsetMs(new Date(t), timeZone) === wall - t)
    .sort((a, b) => a - b);
  if (candidates.length) return new Date(candidates[0]);
  // In a DST gap: no wall time matches, use the pre-transition offset (moves forward).
  return new Date(wall - offsets[0]);
}

export function isCivilDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.toISOString().slice(0, 10) === value;
}

export function addDays(civilDate: string, days: number): string {
  const [y, m, d] = civilDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** ISO weekday 1 (Monday) … 7 (Sunday). */
export function isoWeekday(civilDate: string): number {
  const [y, m, d] = civilDate.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return day === 0 ? 7 : day;
}

/** Monday of the week containing `civilDate`. */
export function weekStart(civilDate: string): string {
  return addDays(civilDate, 1 - isoWeekday(civilDate));
}

export function weekDays(civilDate: string): string[] {
  const start = weekStart(civilDate);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

// ---------------------------------------------------------------------------
// Italian formatting
// ---------------------------------------------------------------------------

function civilAsUtcDate(civilDate: string) {
  const [y, m, d] = civilDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12));
}

/** "lun 14 set" */
export function formatDay(civilDate: string): string {
  return new Intl.DateTimeFormat(LOCALE, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })
    .format(civilAsUtcDate(civilDate));
}

/** "lunedì 14 settembre" */
export function formatLongDay(civilDate: string): string {
  return new Intl.DateTimeFormat(LOCALE, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" })
    .format(civilAsUtcDate(civilDate));
}

/** Single-letter weekday: L M M G V S D */
export function weekdayInitial(civilDate: string): string {
  return ["L", "M", "M", "G", "V", "S", "D"][isoWeekday(civilDate) - 1];
}

export function formatTime(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat(LOCALE, { hour: "2-digit", minute: "2-digit", timeZone }).format(date);
}

/** Relative label for a civil date compared to `today`: "oggi", "domani", "ieri" or the day. */
export function relativeDay(civilDate: string, today: string): string {
  if (civilDate === today) return "oggi";
  if (civilDate === addDays(today, 1)) return "domani";
  if (civilDate === addDays(today, -1)) return "ieri";
  return formatDay(civilDate);
}

export function greeting(hour: number): string {
  if (hour < 5) return "Buonanotte";
  if (hour < 13) return "Buongiorno";
  if (hour < 18) return "Buon pomeriggio";
  return "Buonasera";
}

// ---------------------------------------------------------------------------
// Months
// ---------------------------------------------------------------------------

/** `YYYY-MM` of a civil date. */
export function monthOf(civilDate: string): string {
  return civilDate.slice(0, 7);
}

export function isMonth(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function addMonths(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}

/** Monday-first grid of whole weeks covering the month (includes adjacent-month days). */
export function monthGrid(month: string): string[][] {
  const first = `${month}-01`;
  const start = weekStart(first);
  const nextMonthFirst = `${addMonths(month, 1)}-01`;
  const weeks: string[][] = [];
  for (let day = start; day < nextMonthFirst || weeks.length === 0; ) {
    const week = Array.from({ length: 7 }, (_, i) => addDays(day, i));
    weeks.push(week);
    day = addDays(day, 7);
  }
  return weeks;
}

/** "ottobre 2026" */
export function formatMonth(month: string): string {
  return new Intl.DateTimeFormat(LOCALE, { month: "long", year: "numeric", timeZone: "UTC" }).format(
    civilAsUtcDate(`${month}-01`),
  );
}
