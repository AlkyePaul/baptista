"use client";

import { useEffect, useReducer, useRef, useState, useTransition } from "react";
import { answerAction, dismissForMeAction, markShownAction, saveStepAction, undoAction } from "@/app/actions/baptista";
import { Visual } from "@/components/briefing";
import { buttonClass, cx } from "@/components/ui";
import { expressionFor } from "@/lib/baptista/expressions";
import { reduce, resumeFrom, type ConversationState } from "@/lib/baptista/machine";
import { ERROR_TEXT, type OptionSpec } from "@/lib/baptista/scripts";
import type { ConversationView, UndoToken } from "@/lib/baptista/view";
import { BaptistaBubble, UserBubble } from "./bubble";
import { MiniForm, Options } from "./options";

const UNDO_MS = 30_000;

function Thumbnail({ view, timeZone }: { view: ConversationView; timeZone: string }) {
  if (!view.thumb) return null;
  if (view.thumb.kind === "photo") {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL of a private object
      <img src={view.thumb.src} alt={view.thumb.alt} className="size-16 rounded-xl object-cover" />
    );
  }
  return <Visual item={{ visual: view.thumb.visual, sourceId: view.thumb.sourceId }} size={56} timeZone={timeZone} color={view.thumb.color} />;
}

/**
 * One micro-conversation (B-3): opening → choice → [confirming | form] → executing → done | failed.
 * The confirmation bubble appears only after the server answered ok; undo only for verified
 * inverses, for 30 s.
 */
export function Conversation({
  view,
  timeZone,
  compact = false,
  onEngaged,
  onClosed,
}: {
  view: ConversationView;
  timeZone: string;
  compact?: boolean;
  /** The user answered: the thread keeps this conversation even if the observation resolves. */
  onEngaged?: (view: ConversationView) => void;
  onClosed?: (key: string) => void;
}) {
  const [state, dispatch] = useReducer(reduce, view, (v): ConversationState => resumeFrom(v.resume, v.options.map((o) => o.id)));
  const [pending, start] = useTransition();
  const [undo, setUndo] = useState<UndoToken | null>(null);
  const [undoMessage, setUndoMessage] = useState<string | null>(null);
  const [snoozeText, setSnoozeText] = useState<string | null>(null);
  const lastPayload = useRef<Record<string, string | string[]>>({});
  const [engaged, setEngaged] = useState(false);
  const option = (id: string) => view.options.find((o) => o.id === id) ?? null;

  useEffect(() => {
    if (!undo) return;
    const t = setTimeout(() => setUndo(null), UNDO_MS);
    return () => clearTimeout(t);
  }, [undo]);

  function engage() {
    if (engaged) return;
    setEngaged(true);
    onEngaged?.(view);
  }

  function run(optionId: string, payload: Record<string, string | string[]>) {
    lastPayload.current = payload;
    start(async () => {
      const result = await answerAction(view.observationId, optionId, view.sourceVersion, payload);
      if (result.ok) {
        dispatch({ type: "succeeded", text: result.text ?? "Fatto.", undo: Boolean(result.undo) });
        setUndo(result.undo ?? null);
      } else {
        dispatch({ type: "failed", message: result.conflict ? ERROR_TEXT.conflict : (result.message ?? ERROR_TEXT.failed), conflict: result.conflict });
      }
    });
  }

  function choose(o: OptionSpec) {
    if (o.kind === "link") {
      void answerAction(view.observationId, o.id, view.sourceVersion, {});
      return;
    }
    engage();
    if (o.kind === "snooze" || o.kind === "dismiss") {
      start(async () => {
        const result = await answerAction(view.observationId, o.id, view.sourceVersion, {});
        if (!result.ok) return;
        // The sentence about the snooze is said only once it was saved (B-3.5).
        if (o.kind === "snooze") {
          setSnoozeText(result.text ?? null);
          dispatch({ type: "snoozed", text: result.text ?? null });
        } else {
          dispatch({ type: "dismissed" });
        }
      });
      return;
    }
    const next = o.kind === "confirm" ? "confirm" : o.kind === "form" ? "form" : "execute";
    dispatch({ type: "choose", option: o.id, next });
    if (next === "execute") run(o.id, {});
    else void saveStepAction(view.observationId, `${next === "confirm" ? "confirming" : "form"}:${o.id}`);
  }

  function cancel() {
    dispatch({ type: "cancel" });
    void saveStepAction(view.observationId, null);
  }

  if (state.step === "dismissed" || (state.step === "snoozed" && !snoozeText)) return null;

  const chosen = "option" in state ? option(state.option) : null;
  const typed = view.typed || engaged;
  const close = () => onClosed?.(view.key);

  return (
    <article className="flex flex-col gap-3" aria-label={`Baptista: ${view.text}`}>
      <div className="relative">
        <BaptistaBubble
          expression={view.expression}
          text={view.text}
          header={view.header}
          detail={state.step === "opening" ? view.detail : null}
          thumb={<Thumbnail view={view} timeZone={timeZone} />}
          animate={!typed}
          compact={compact}
          onTyped={() => {
            if (!view.typed) void markShownAction(view.key, view.observationId, view.variant);
          }}
        >
          {state.step === "opening" ? <Options options={view.options} onChoose={choose} disabled={pending} /> : null}
        </BaptistaBubble>
        {state.step === "opening" ? (
          <button
            type="button"
            aria-label="Ora no"
            title="Ora no"
            onClick={() =>
              start(async () => {
                engage();
                const r = await dismissForMeAction(view.observationId);
                if (r.ok) dispatch({ type: "dismissed" });
              })
            }
            className="absolute top-0 right-0 flex size-9 items-center justify-center rounded-full text-lg text-muted hover:bg-foreground/5"
          >
            ×
          </button>
        ) : null}
      </div>

      {chosen ? <UserBubble>{chosen.says ?? chosen.label}</UserBubble> : null}

      {state.step === "confirming" && chosen?.confirm ? (
        <BaptistaBubble expression={expressionFor(view.type, "proposing")} text={chosen.confirm.text} detail={chosen.confirm.detail} animate enter={false} compact={compact}>
          <button type="button" onClick={() => {
              dispatch({ type: "confirm" });
              run(chosen.id, {});
            }} className={cx(buttonClass.primary, "w-full")}>
            {chosen.confirm.button}
          </button>
          <button type="button" onClick={cancel} className={cx(buttonClass.secondary, "w-full")}>
            Annulla
          </button>
        </BaptistaBubble>
      ) : null}

      {state.step === "form" && chosen?.form ? (
        <BaptistaBubble expression={expressionFor(view.type, "proposing")} text={chosen.form.text} animate enter={false} compact={compact}>
          <MiniForm
            form={chosen.form}
            disabled={pending}
            onCancel={cancel}
            onSubmit={(payload) => {
              dispatch({ type: "submit" });
              run(chosen.id, payload);
            }}
          />
        </BaptistaBubble>
      ) : null}

      {state.step === "executing" ? (
        <p role="status" className="pl-14 text-sm text-muted">
          Un attimo…
        </p>
      ) : null}

      {state.step === "done" ? (
        <BaptistaBubble
          expression="confirmation"
          text={state.text}
          animate
          enter={false}
          compact={compact}
          footer={
            <div className="flex items-center gap-3">
              {undo ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      const r = await undoAction(undo);
                      if (r.ok) {
                        setUndo(null);
                        setUndoMessage("Annullato.");
                      } else {
                        setUndoMessage(r.message ?? "Non posso annullare.");
                      }
                    })
                  }
                  className="min-h-10 text-sm font-medium text-accent underline-offset-4 hover:underline"
                >
                  Annulla
                </button>
              ) : null}
              {undoMessage ? <span className="text-sm text-muted">{undoMessage}</span> : null}
              <button type="button" onClick={close} className="ml-auto min-h-10 px-2 text-sm text-muted">
                Chiudi
              </button>
            </div>
          }
        />
      ) : null}

      {state.step === "failed" ? (
        <BaptistaBubble expression="thoughtful" text={state.message} animate enter={false} compact={compact}>
          {!state.conflict ? (
            <button type="button" onClick={() => {
                dispatch({ type: "retry" });
                run(state.option, lastPayload.current);
              }} className={cx(buttonClass.primary, "w-full")}>
              Riprova
            </button>
          ) : null}
          <button type="button" onClick={close} className={cx(buttonClass.secondary, "w-full")}>
            {state.conflict ? "Va bene" : "Lascia stare"}
          </button>
        </BaptistaBubble>
      ) : null}

      {state.step === "snoozed" && snoozeText ? (
        <BaptistaBubble
          expression="confirmation"
          text={snoozeText}
          animate
          enter={false}
          compact={compact}
          footer={
            <button type="button" onClick={close} className="min-h-10 px-2 text-sm text-muted">
              Chiudi
            </button>
          }
        />
      ) : null}
    </article>
  );
}
