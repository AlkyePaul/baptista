"use client";

import { useState, useTransition } from "react";
import { closeDailyAction, markShownAction } from "@/app/actions/baptista";
import type { ConversationView, ThreadView } from "@/lib/baptista/view";
import { BaptistaBubble, useTypewriter } from "./bubble";
import { Conversation } from "./conversation";

/** «Una citazione di Seneca, per oggi:» → «…» → «— Seneca» (B-8): intro first, then the text. */
function DailyBubble({ daily }: { daily: NonNullable<ThreadView["daily"]> }) {
  const [closed, setClosed] = useState(false);
  const [, start] = useTransition();
  if (closed) return null;
  return (
    <BaptistaBubble expression={daily.expression} text={daily.intro} animate={!daily.typed} compact>
      <DailyText
        text={daily.text}
        author={daily.author}
        animate={!daily.typed}
        onTyped={() => {
          if (!daily.typed) void markShownAction(daily.key, null, `${daily.entry.kind}:${daily.entry.theme}`);
        }}
        onClose={() =>
          start(async () => {
            setClosed(true);
            await closeDailyAction();
          })
        }
      />
    </BaptistaBubble>
  );
}

function DailyText({ text, author, animate, onTyped, onClose }: { text: string; author: string | null; animate: boolean; onTyped: () => void; onClose: () => void }) {
  const { visible, done, skip } = useTypewriter(text, { animate, delay: 150, onDone: onTyped });
  return (
    <div className="flex flex-col gap-1.5">
      <p onClick={skip} className="rounded-2xl border border-border bg-surface px-4 py-3 text-base leading-snug">
        <span className="sr-only" aria-live="polite">
          {text}
        </span>
        <span aria-hidden>
          {visible}
          {!done ? <span className="opacity-0">{text.slice(visible.length)}</span> : null}
        </span>
      </p>
      {done ? (
        <div className="baptista-appear flex items-center justify-between gap-3">
          <button type="button" onClick={onClose} className="min-h-9 text-xs text-muted underline-offset-4 hover:underline">
            Chiudi fino a domani
          </button>
          {author ? <p className="text-sm text-muted">— {author}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The Baptista section (B-5/B-6) in place of «In evidenza»: the daily line (Soggiorno only), one
 * active conversation and up to two queued bubbles («Poi ci sono anche: …»). Conversations the user
 * answered stay on screen until closed, even when the observation resolves on the server.
 */
export function BaptistaThread({ thread, timeZone, compact = false }: { thread: ThreadView; timeZone: string; compact?: boolean }) {
  const [focus, setFocus] = useState<string | null>(null);
  const [pinned, setPinned] = useState<ConversationView[]>([]);
  const [closed, setClosed] = useState<Set<string>>(new Set());

  const current = [thread.active, ...thread.queue].filter((v): v is ConversationView => v !== null);
  const focused = current.find((v) => v.key === focus) ?? current[0] ?? null;
  const queue = current.filter((v) => v !== focused);
  const keep = pinned.filter((p) => !current.some((v) => v.key === p.key));
  const conversations = [...keep, ...(focused ? [focused] : [])].filter((v) => !closed.has(v.key));

  if (!thread.daily && !conversations.length && !queue.length) return null;

  return (
    <section aria-label="Baptista" className="flex flex-col gap-4">
      {thread.daily ? <DailyBubble daily={thread.daily} /> : null}
      {conversations.map((view) => (
        <Conversation
          key={view.key}
          view={view}
          timeZone={timeZone}
          compact={compact}
          onEngaged={(v) => setPinned((prev) => (prev.some((p) => p.key === v.key) ? prev : [...prev, v]))}
          onClosed={(key) => setClosed((prev) => new Set(prev).add(key))}
        />
      ))}
      {queue.length ? (
        <div className="flex flex-col gap-1.5 pl-14">
          <p className="text-xs font-semibold tracking-wider text-muted">POI CI SONO ANCHE</p>
          {queue.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => setFocus(v.key)}
              className="baptista-appear line-clamp-2 rounded-2xl border border-border bg-surface px-3 py-2 text-left text-sm"
            >
              {v.text}
            </button>
          ))}
        </div>
      ) : null}
      {thread.deferredCount > 0 ? (
        <p className="pl-14 text-xs text-muted">
          {thread.deferredCount === 1 ? "C'è un'altra cosa" : `Ci sono altre ${thread.deferredCount} cose`} nella scheda Baptista, quando hai tempo.
        </p>
      ) : null}
    </section>
  );
}
