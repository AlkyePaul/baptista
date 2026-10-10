import type { RoomId } from "@/lib/rooms";

/** An observation as read by the viewer (RLS), with the detector's structured facts. */
export type ObservationInput = {
  id: string;
  type: string;
  title: string;
  description: string | null;
  source_type: string;
  source_id: string;
  dedupe_key: string;
  confidence: number;
  priority_score: number;
  created_at: string;
  data: Record<string, unknown>;
};

/** Who is looking and when: the only inputs of the voice besides the facts (B-2). */
export type VoiceContext = {
  /** First name of the viewer; used only when `useName` (opening, at most once per session). */
  viewerName: string;
  useName: boolean;
  /** Local civil date and hour in the household timezone. */
  today: string;
  hour: number;
  timeZone: string;
  /** The viewer already saw this message (presentation memory). */
  seenBefore: boolean;
};

export type FieldSpec =
  | { kind: "money"; name: string; label: string; hint?: string }
  | { kind: "date"; name: string; label: string; defaultValue: string }
  | { kind: "text"; name: string; label: string; hint?: string }
  | { kind: "number"; name: string; label: string; defaultValue?: string; hint?: string }
  | { kind: "slot"; name: string; label: string; defaultValue: string }
  | { kind: "visibility"; name: "visibility"; defaultValue: "household" | "private" }
  | { kind: "checklist"; name: string; items: Array<{ value: string; label: string }> };

export type OptionSpec = {
  id: string;
  label: string;
  primary?: boolean;
  /**
   * execute: runs a server action now; confirm: asks «Lo segno…?» first; form: typed mini-form
   * (no free text interpreted); snooze/dismiss: personal memory; link: opens a page.
   */
  kind: "execute" | "confirm" | "form" | "snooze" | "dismiss" | "link";
  /** The user's answer as a bubble on the right (defaults to the label). */
  says?: string;
  href?: string;
  confirm?: { text: string; button: string; detail?: string };
  form?: { text: string; fields: FieldSpec[]; button: string };
  /** Snooze length: hours, or «domattina» (next day 08:00 local). */
  snooze?: number | "morning";
  /** Said only after the snooze was saved. */
  snoozeText?: string;
};

export type Script = {
  room: RoomId;
  /** Complete alternative sentences; one is chosen by stable hash (never fragments). */
  opening: (o: ObservationInput, v: VoiceContext) => string[];
  options: (o: ObservationInput, v: VoiceContext) => OptionSpec[];
  facts?: (o: ObservationInput) => { estimated?: boolean; celebrate?: boolean };
  /** Small context line under the text (e.g. «Pollo · Frigo»). */
  detail?: (o: ObservationInput) => string | null;
};

// Shared helpers --------------------------------------------------------------------------------

export const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);
export const num = (v: unknown, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export function place(storage: unknown): string {
  return storage === "freezer" ? "in freezer" : storage === "pantry" ? "in dispensa" : "in frigo";
}

const WEEKDAYS = ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"];

/** «oggi», «domani», «ieri», else «lunedì 12/10». */
export function dayPhrase(date: string, today: string): string {
  const diff = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (diff === 0) return "oggi";
  if (diff === 1) return "domani";
  if (diff === -1) return "ieri";
  const d = new Date(`${date}T00:00:00Z`);
  return `${WEEKDAYS[(d.getUTCDay() + 6) % 7]} ${date.slice(8, 10)}/${date.slice(5, 7)}`;
}

/** «Paolo, » when the name may be used, otherwise nothing. */
export const vocative = (v: VoiceContext) => (v.useName && v.viewerName ? `${v.viewerName}, ` : "");

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const NUMBERS = ["zero", "una", "due", "tre", "quattro", "cinque", "sei", "sette"];
/** «quattro» for small counts (feminine, as in «quattro volte»), digits beyond seven. */
export const countWord = (n: number) => NUMBERS[n] ?? String(n);
