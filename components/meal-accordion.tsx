"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteDietEntryAction, saveSlotAsRecurringAction } from "@/app/actions/kitchen";
import { ActionButton } from "@/components/forms";
import { Icon } from "@/components/icons";
import { Card, cx } from "@/components/ui";
import type { DietEntry } from "@/lib/db/types";
import { formatItalianNumber } from "@/lib/goals";
import { diaryTotals, type Slot } from "@/lib/nutrition";

const WEEKDAYS = [
  { iso: 1, label: "L" },
  { iso: 2, label: "Ma" },
  { iso: 3, label: "Me" },
  { iso: 4, label: "G" },
  { iso: 5, label: "V" },
  { iso: 6, label: "S" },
  { iso: 7, label: "D" },
] as const;

/**
 * Collapsible meal-category card. Shows slot name, kcal total and entry count collapsed;
 * expands to show individual food entries with edit/remove actions.
 */
export function MealAccordion({
  slot,
  label,
  entries,
  day,
  onAdd,
  defaultOpen = false,
}: {
  slot: Slot;
  label: string;
  entries: DietEntry[];
  /** Civil date for the current view (needed for save-as-recurring). */
  day: string;
  /** Called when the user taps the + button — opens the food selector with this slot pre-selected. */
  onAdd: () => void;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [recurringOpen, setRecurringOpen] = useState(false);
  const totals = diaryTotals(entries);
  const hasEntries = entries.length > 0;
  const hasManualEntries = entries.some((e) => !e.schedule_id && e.food_id);

  return (
    <Card className="overflow-hidden">
      {/* Header — always visible */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-foreground/[0.03]"
      >
        <span className="flex flex-1 flex-col gap-0.5">
          <span className="text-sm font-semibold">{label}</span>
          {hasEntries ? (
            <span className="text-xs text-muted">
              {formatItalianNumber(totals.kcal)} kcal · {entries.length === 1 ? "1 alimento" : `${entries.length} alimenti`}
            </span>
          ) : (
            <span className="text-xs text-muted">Niente registrato</span>
          )}
        </span>

        {/* Add button — stops event propagation to avoid toggling the accordion */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAdd();
          }}
          className={cx(
            "flex size-9 shrink-0 items-center justify-center rounded-lg text-accent transition hover:bg-accent/10",
          )}
          aria-label={`Aggiungi a ${label}`}
        >
          <Icon name="plus" className="size-5" />
        </button>

        <Icon
          name={open ? "chevron-up" : "chevron-down"}
          className="size-4 shrink-0 text-muted transition-transform"
        />
      </button>

      {/* Expanded content */}
      {open && (
        <div className="border-t border-border">
          {hasEntries ? (
            <>
              <ul className="divide-y divide-border">
                {entries.map((entry) => (
                  <li key={entry.id} className="flex items-center gap-3 py-2 pr-2 pl-4">
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate text-sm">{entry.label}</span>
                        {entry.schedule_id ? (
                          <Icon name="repeat" className="size-3.5 shrink-0 text-muted" />
                        ) : null}
                      </span>
                      <span className="text-xs text-muted">
                        {entry.grams ? `${formatItalianNumber(entry.grams)} g · ` : ""}
                        {formatItalianNumber(entry.kcal)} kcal
                      </span>
                    </span>
                    <ActionButton
                      action={deleteDietEntryAction.bind(null, entry.id)}
                      label={`Elimina: ${entry.label}`}
                      confirmLabel="Elimina?"
                      className="min-h-9 px-2 text-xs"
                    >
                      ×
                    </ActionButton>
                  </li>
                ))}
              </ul>
              {/* Save as recurring — only when there are manual entries with food_id */}
              {hasManualEntries && (
                <div className="border-t border-border">
                  {recurringOpen ? (
                    <RecurringForm slot={slot} label={label} day={day} onDone={() => setRecurringOpen(false)} />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setRecurringOpen(true)}
                      className="flex w-full items-center gap-2 px-4 py-3 text-sm text-accent transition hover:bg-foreground/[0.03]"
                    >
                      <Icon name="repeat" className="size-4" />
                      Rendi ricorrente
                    </button>
                  )}
                </div>
              )}
            </>
          ) : (
            <p className="px-4 py-4 text-center text-sm text-muted">
              Premi + per aggiungere un alimento.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

/** Inline form to save a slot's entries as a recurring meal. */
function RecurringForm({ slot, label, day, onDone }: { slot: Slot; label: string; day: string; onDone: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState(label);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function toggle(d: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      return next;
    });
  }

  function submit() {
    if (!title.trim()) { setError("Dai un nome al pasto."); return; }
    if (!selected.size) { setError("Scegli almeno un giorno."); return; }
    setError("");
    startTransition(async () => {
      const result = await saveSlotAsRecurringAction({
        day,
        slotId: slot,
        title: title.trim(),
        weekdays: [...selected].sort(),
      });
      if (result.ok) {
        onDone();
        router.refresh();
      } else {
        setError(result.message ?? "Errore.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <p className="text-xs text-muted">Salva come pasto ricorrente: gli alimenti di questo slot verranno ripetuti nei giorni scelti.</p>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Nome del pasto"
        className="min-h-10 rounded-lg border border-border bg-surface px-3 text-sm"
      />
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">Giorni</span>
        <div className="flex gap-1">
          {WEEKDAYS.map((d) => (
            <button
              key={d.iso}
              type="button"
              onClick={() => toggle(d.iso)}
              className={cx(
                "flex size-10 items-center justify-center rounded-lg border text-sm font-medium transition-colors",
                selected.has(d.iso)
                  ? "border-accent bg-accent text-white"
                  : "border-border bg-surface text-foreground hover:bg-foreground/5",
              )}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={onDone} disabled={pending} className="min-h-10 flex-1 rounded-xl border border-border bg-surface text-sm font-medium transition active:scale-[0.98] disabled:opacity-60">
          Annulla
        </button>
        <button type="button" onClick={submit} disabled={pending} className="min-h-10 flex-1 rounded-xl bg-accent text-sm font-medium text-on-accent transition active:scale-[0.98] disabled:opacity-60">
          {pending ? "Salvo…" : "Salva e programma"}
        </button>
      </div>
    </div>
  );
}
