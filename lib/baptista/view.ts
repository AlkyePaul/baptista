/** Serializable shapes passed from the server to the Baptista client components. */

import type { BriefingVisual } from "@/lib/intelligence/briefing";
import type { RoomId } from "@/lib/rooms";
import type { DailyLine } from "./daily";
import type { Expression } from "./expressions";
import type { OptionSpec } from "./scripts";

export type Thumb = { kind: "photo"; src: string; alt: string } | { kind: "visual"; visual: BriefingVisual; sourceId: string; color?: string };

export type ConversationView = {
  key: string;
  observationId: string;
  type: string;
  room: RoomId;
  /** «CUCINA · 1 ELEMENTO» */
  header: string;
  text: string;
  variant: string;
  expression: Expression;
  detail: string | null;
  options: OptionSpec[];
  thumb: Thumb | null;
  /** Version of the source record read with the observation (checked by the server). */
  sourceVersion: number | null;
  /** Already shown to this viewer: appears whole, without typing again (B-6.6). */
  typed: boolean;
  /** Resume step from another device (B-4): "confirming:<option>" | "form:<option>". */
  resume: string | null;
};

export type ThreadView = {
  active: ConversationView | null;
  queue: ConversationView[];
  deferredCount: number;
  daily: (DailyLine & { typed: boolean }) | null;
  /** Calm subtitle when nothing is pertinent (B-5). */
  quiet: string | null;
};

/** Result of an answer, for the confirmation bubble. */
export type AnswerState = {
  ok: boolean;
  text?: string;
  message?: string;
  conflict?: boolean;
  undo?: UndoToken | null;
};

/** Inverse of an action, re-validated by the server (version + RLS) when used. */
export type UndoToken = { kind: "food_status"; id: string; version: number; status: "available" | "opened" } | { kind: "task_open"; id: string; version: number };
