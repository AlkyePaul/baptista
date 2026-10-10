"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import { cx } from "@/components/ui";

const STORAGE_PREFIX = "baptista:accordion:";

/**
 * The one list component (Phase 04.1, A-1): header with title, open count and chevron; a body
 * that can be collapsed. The open/closed state is a local preference of this browser (try/catch:
 * storage may be unavailable), never domain data.
 */
export function ListAccordion({
  id,
  title,
  count,
  defaultOpen = true,
  action,
  tone,
  children,
}: {
  /** Stable id used to remember the open state (e.g. "spesa", "note:<uuid>"). */
  id: string;
  title: ReactNode;
  count?: number;
  defaultOpen?: boolean;
  /** Extra control shown in the header when open (e.g. «Tutto in dispensa»). */
  action?: ReactNode;
  tone?: "default" | "accent";
  children: ReactNode;
}) {
  const bodyId = useId();
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_PREFIX + id);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring a browser-only preference after hydration
      if (saved === "0" || saved === "1") setOpen(saved === "1");
    } catch {
      // storage unavailable: keep the default
    }
  }, [id]);

  function toggle() {
    const next = !open;
    setOpen(next);
    try {
      window.localStorage.setItem(STORAGE_PREFIX + id, next ? "1" : "0");
    } catch {
      // ignore
    }
  }

  return (
    <section className={cx("rounded-2xl border bg-surface", tone === "accent" ? "border-accent/40" : "border-border")}>
      <div className="flex items-center gap-2 pr-2">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={bodyId}
          className="flex min-h-14 flex-1 items-center gap-3 px-4 text-left"
        >
          <span className="flex-1 font-semibold">{title}</span>
          {count !== undefined ? (
            <span className="rounded-full bg-foreground/5 px-2.5 py-0.5 text-xs font-medium text-muted">{count}</span>
          ) : null}
          <svg aria-hidden viewBox="0 0 20 20" className={cx("size-5 text-muted transition-transform", open && "rotate-180")}>
            <path d="M5 7.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {open && action ? action : null}
      </div>
      <div id={bodyId} hidden={!open} className="border-t border-border">
        {children}
      </div>
    </section>
  );
}
