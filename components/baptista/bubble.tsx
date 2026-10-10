"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cx } from "@/components/ui";
import { AVATAR_FADE_MS, typingSchedule, visibleCount } from "@/lib/baptista/typing";
import type { Expression } from "@/lib/baptista/expressions";
import { BaptistaAvatar } from "./avatar";

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

/**
 * Types `text` letter by letter after `delay` ms (B-6): requestAnimationFrame, no library. When
 * `animate` is false (already shown to this viewer) or motion is reduced, the text is whole at once.
 */
export function useTypewriter(text: string, { animate, delay, onDone }: { animate: boolean; delay: number; onDone?: () => void }) {
  const [count, setCount] = useState(animate ? 0 : [...text].length);
  const [done, setDone] = useState(!animate);
  const skipped = useRef(false);
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  });

  useEffect(() => {
    const chars = [...text];
    if (!animate || prefersReducedMotion()) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reduced motion is only known in the browser
      setCount(chars.length);
      setDone(true);
      if (animate) doneRef.current?.();
      return;
    }
    const schedule = typingSchedule(text);
    let frame = 0;
    const start = performance.now() + delay;
    const tick = (now: number) => {
      if (skipped.current) return;
      const visible = visibleCount(schedule, Math.max(0, now - start));
      setCount(visible);
      if (visible >= chars.length) {
        setDone(true);
        doneRef.current?.();
        return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [text, animate, delay]);

  /** A tap completes the text at once. */
  function skip() {
    if (done) return;
    skipped.current = true;
    setCount([...text].length);
    setDone(true);
    doneRef.current?.();
  }

  return { visible: [...text].slice(0, count).join(""), done, skip };
}

/**
 * One message of Baptista: avatar (fade in) → typed text → detail, thumbnail and options (fade in
 * when the text is complete; not clickable before). Screen readers get the whole text at once.
 */
export function BaptistaBubble({
  expression,
  text,
  header,
  detail,
  thumb,
  animate,
  enter = true,
  onTyped,
  children,
  footer,
  compact = false,
}: {
  expression: Expression;
  text: string;
  header?: string | null;
  detail?: ReactNode;
  thumb?: ReactNode;
  animate: boolean;
  /** Avatar fades in before typing (first bubble of a conversation). */
  enter?: boolean;
  onTyped?: () => void;
  children?: ReactNode;
  footer?: ReactNode;
  compact?: boolean;
}) {
  const { visible, done, skip } = useTypewriter(text, { animate, delay: animate && enter ? AVATAR_FADE_MS : animate ? 250 : 0, onDone: onTyped });
  return (
    <div className="flex items-start gap-3">
      <BaptistaAvatar expression={expression} size={compact ? 44 : 56} enter={enter && animate} />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {header ? <p className="text-xs font-semibold tracking-wider text-muted">{header}</p> : null}
        <div
          role="group"
          onClick={skip}
          className={cx("flex items-start gap-3 rounded-2xl rounded-tl-md border border-border bg-surface px-4 py-3", !done && "cursor-pointer")}
        >
          <p className={cx("min-w-0 flex-1 leading-snug", compact ? "text-base" : "text-lg")}>
            <span className="sr-only" aria-live="polite">
              {text}
            </span>
            <span aria-hidden>
              {visible}
              {!done ? <span className="opacity-0">{text.slice(visible.length)}</span> : null}
            </span>
          </p>
          {thumb && done ? <span className="baptista-appear shrink-0">{thumb}</span> : null}
        </div>
        {done && detail ? <div className="baptista-appear text-sm text-muted">{detail}</div> : null}
        {done && children ? <div className="baptista-appear flex flex-col gap-2">{children}</div> : null}
        {done && footer ? <div className="baptista-appear">{footer}</div> : null}
      </div>
    </div>
  );
}

/** The user's answer: on the right, immediately (no typing). */
export function UserBubble({ children }: { children: ReactNode }) {
  return (
    <div className="baptista-appear flex justify-end">
      <p className="max-w-[80%] rounded-2xl rounded-tr-md bg-accent px-4 py-2.5 text-on-accent">{children}</p>
    </div>
  );
}
