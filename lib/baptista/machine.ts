/**
 * Micro-conversation state machine (B-3), pure:
 * opening → (choice) → [confirming | form] → executing → done | failed, plus snoozed/dismissed.
 * A confirmation exists only after a successful server answer: `done` is reachable only from
 * `executing` through `succeeded`.
 */

export type ConversationState =
  | { step: "opening" }
  | { step: "confirming"; option: string }
  | { step: "form"; option: string }
  | { step: "executing"; option: string }
  | { step: "done"; option: string; text: string; undo: boolean }
  | { step: "failed"; option: string; message: string; conflict: boolean }
  | { step: "snoozed"; text: string | null }
  | { step: "dismissed" };

export type ConversationEvent =
  | { type: "choose"; option: string; next: "confirm" | "form" | "execute" }
  | { type: "confirm" }
  | { type: "submit" }
  | { type: "cancel" }
  | { type: "succeeded"; text: string; undo?: boolean }
  | { type: "failed"; message: string; conflict?: boolean }
  | { type: "retry" }
  | { type: "snoozed"; text?: string | null }
  | { type: "dismissed" }
  | { type: "undone" };

export const initialConversation: ConversationState = { step: "opening" };

export function reduce(state: ConversationState, event: ConversationEvent): ConversationState {
  switch (event.type) {
    case "choose":
      if (state.step !== "opening") return state;
      if (event.next === "confirm") return { step: "confirming", option: event.option };
      if (event.next === "form") return { step: "form", option: event.option };
      return { step: "executing", option: event.option };
    case "confirm":
      return state.step === "confirming" ? { step: "executing", option: state.option } : state;
    case "submit":
      return state.step === "form" ? { step: "executing", option: state.option } : state;
    case "cancel":
      return state.step === "confirming" || state.step === "form" ? { step: "opening" } : state;
    case "succeeded":
      return state.step === "executing" ? { step: "done", option: state.option, text: event.text, undo: event.undo ?? false } : state;
    case "failed":
      return state.step === "executing"
        ? { step: "failed", option: state.option, message: event.message, conflict: event.conflict ?? false }
        : state;
    case "retry":
      return state.step === "failed" && !state.conflict ? { step: "executing", option: state.option } : state;
    case "snoozed":
      return state.step === "opening" || state.step === "failed" ? { step: "snoozed", text: event.text ?? null } : state;
    case "dismissed":
      return state.step === "opening" || state.step === "failed" || state.step === "done" ? { step: "dismissed" } : state;
    case "undone":
      return state.step === "done" && state.undo ? { step: "opening" } : state;
  }
}

/** The step persisted as `script_step` so another device can resume (B-4). */
export function persistedStep(state: ConversationState): string | null {
  return state.step === "confirming" || state.step === "form" ? `${state.step}:${state.option}` : null;
}

export function resumeFrom(step: string | null | undefined, options: readonly string[]): ConversationState {
  const match = /^(confirming|form):(.+)$/.exec(step ?? "");
  if (!match || !options.includes(match[2])) return initialConversation;
  return { step: match[1] as "confirming" | "form", option: match[2] };
}
