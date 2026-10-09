"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ACTION_SUCCESS_EVENT } from "@/components/forms";
import { buttonClass, cx } from "@/components/ui";

/**
 * Bottom sheet on phones, centred dialog on larger screens (native <dialog>: focus trap and Esc
 * for free). Closes by itself after a successful ActionForm submit inside it.
 */
export function Modal({
  trigger,
  title,
  children,
  triggerClassName,
}: {
  trigger: ReactNode;
  title: string;
  children: ReactNode;
  triggerClassName?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    const close = () => el.close();
    el.addEventListener(ACTION_SUCCESS_EVENT, close);
    return () => el.removeEventListener(ACTION_SUCCESS_EVENT, close);
  }, []);

  return (
    <>
      <button type="button" onClick={() => dialog.current?.showModal()} className={triggerClassName ?? buttonClass.primary}>
        {trigger}
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        onClick={(e) => {
          if (e.target === dialog.current) dialog.current.close(); // tap on the backdrop
        }}
        className="m-0 mt-auto max-h-[92dvh] w-full max-w-none rounded-t-3xl border border-border bg-background p-0 text-foreground backdrop:bg-black/40 sm:m-auto sm:max-w-md sm:rounded-3xl"
      >
        <div className="flex flex-col gap-4 p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))]">
          <div className="flex items-center justify-between gap-3">
            <h2 id={titleId} className="text-xl font-semibold">
              {title}
            </h2>
            <button type="button" onClick={() => dialog.current?.close()} className={cx(buttonClass.ghost, "size-11 px-0")} aria-label="Chiudi">
              <span aria-hidden className="text-xl">
                ×
              </span>
            </button>
          </div>
          {children}
        </div>
      </dialog>
    </>
  );
}

/** Segmented control with panels rendered on the client (all panels stay mounted). */
export function Tabs({ tabs }: { tabs: Array<{ id: string; label: string; content: ReactNode }> }) {
  const [active, setActive] = useState(tabs[0]?.id);
  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" className="grid gap-1 rounded-2xl border border-border bg-surface p-1" style={{ gridTemplateColumns: `repeat(${tabs.length}, 1fr)` }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={t.id === active}
            onClick={() => setActive(t.id)}
            className={cx(
              "min-h-11 rounded-xl text-sm font-medium transition-colors",
              t.id === active ? "bg-foreground/[0.07] text-foreground" : "text-muted hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.id} role="tabpanel" hidden={t.id !== active}>
          {t.content}
        </div>
      ))}
    </div>
  );
}
