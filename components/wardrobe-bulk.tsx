"use client";

import { useState } from "react";
import { markOwnedBeforeAction } from "@/app/actions/wardrobe";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Icon } from "@/components/icons";
import { cx } from "@/components/ui";

const MIN = 7;

/**
 * «Erano già miei» in bulk (A-2): always available on unanswered items, for 7 or more at once so
 * it never becomes a shortcut around the price question when it matters. The server checks again.
 */
export function OwnedBeforeBulk({ items }: { items: Array<{ id: string; name: string; thumb: string | null }> }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const count = items.filter((i) => selected.has(i.id)).length;
  const enough = count >= MIN;

  if (items.length < MIN) {
    return (
      <p className="rounded-2xl border border-dashed border-border px-4 py-3 text-sm text-muted">
        Per meno di 7 capi rispondi uno per uno: apri il capo e scegli se l&apos;hai comprato, era già tuo o è un regalo.
      </p>
    );
  }

  return (
    <ActionForm action={markOwnedBeforeAction} className="gap-3" successMessage>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted">Seleziona i capi che avevi già (almeno 7).</p>
        <button
          type="button"
          onClick={() => setSelected(count === items.length ? new Set() : new Set(items.map((i) => i.id)))}
          className="min-h-10 px-2 text-sm font-medium text-accent"
        >
          {count === items.length ? "Nessuno" : "Tutti"}
        </button>
      </div>
      <ul className="grid grid-cols-3 gap-2">
        {items.map((item) => {
          const on = selected.has(item.id);
          return (
            <li key={item.id}>
              <label
                className={cx(
                  "relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border bg-surface",
                  on ? "border-accent ring-2 ring-accent/40" : "border-border",
                )}
              >
                <input type="checkbox" name="item" value={item.id} checked={on} onChange={() => toggle(item.id)} className="sr-only" />
                <span className="flex aspect-square items-center justify-center bg-foreground/[0.03]">
                  {item.thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL of a private object
                    <img src={item.thumb} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Icon name="hanger" className="size-8 text-muted" />
                  )}
                </span>
                <span className="truncate px-2 py-1.5 text-xs">{item.name}</span>
                {on ? (
                  <span aria-hidden className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full bg-accent text-xs text-on-accent">
                    ✓
                  </span>
                ) : null}
              </label>
            </li>
          );
        })}
      </ul>
      <SubmitButton variant={enough ? "primary" : "secondary"} className={cx(!enough && "pointer-events-none opacity-60")}>
        {enough ? `Erano già miei (${count})` : `Seleziona almeno ${MIN} capi (${count})`}
      </SubmitButton>
      {!enough ? <p className="text-xs text-muted">Per meno di 7 capi rispondi uno per uno.</p> : null}
    </ActionForm>
  );
}
