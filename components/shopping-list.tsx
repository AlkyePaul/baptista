"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  addShoppingItemAction,
  setExpiriesAction,
  setShoppingStatusAction,
  setShoppingStorageAction,
  setStapleAction,
  stockAllAction,
  tickShoppingItemAction,
  undoStockAction,
  type StockState,
} from "@/app/actions/shopping";
import { FoodLookup } from "@/components/food-lookup";
import { ActionForm, Field, SubmitButton } from "@/components/forms";
import { ListAccordion } from "@/components/list-accordion";
import { buttonClass, cx } from "@/components/ui";
import type { ShoppingItem } from "@/lib/db/types";
import { STORAGES, UNITS } from "@/lib/food";
import { formatItalianNumber } from "@/lib/goals";
import type { FoodFacts } from "@/lib/openfoodfacts-parse";

const UNDO_MS = 30_000;
const storageLabel = (id: string | null) => STORAGES.find((s) => s.id === id)?.label ?? "";

type Toast = { kind: "stocked"; items: NonNullable<StockState["stocked"]>; bulk: boolean } | { kind: "error"; message: string };

/**
 * Lista della spesa (Phase 04.1, A-1): one shared list, two sections. Ticking a food means bought
 * and in the pantry; «Tutto in dispensa» moves every visible food row. Rows already in the pantry
 * get a soft red background (a hint, never a block). Every gesture can be undone for 30 s.
 */
export function ShoppingList({
  items,
  inPantry,
  staples,
  known = [],
  defaultOpen = true,
}: {
  items: ShoppingItem[];
  /** List row id → what is already in the house («1 l · Frigo · scade 14/10»). */
  inPantry: Record<string, string>;
  /** Name keys starred as staples. */
  staples: string[];
  known?: FoodFacts[];
  defaultOpen?: boolean;
}) {
  const food = items.filter((i) => i.kind === "food");
  const other = items.filter((i) => i.kind === "other");
  const [toast, setToast] = useState<Toast | null>(null);
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState<"food" | "other" | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const anyRed = food.some((i) => inPantry[i.id]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  function show(next: Toast) {
    setToast(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast((t) => (t?.kind === "stocked" ? null : t)), UNDO_MS);
  }

  function tick(item: ShoppingItem) {
    start(async () => {
      const state = await tickShoppingItemAction(item.id, item.version);
      if (!state.ok) show({ kind: "error", message: state.message ?? "Qualcosa è andato storto." });
      else if (state.stocked?.length) show({ kind: "stocked", items: state.stocked, bulk: false });
    });
  }

  function stockAll() {
    start(async () => {
      const state = await stockAllAction(food.map((i) => i.id));
      if (!state.ok) show({ kind: "error", message: state.message ?? "Qualcosa è andato storto." });
      else if (state.stocked?.length) show({ kind: "stocked", items: state.stocked, bulk: true });
    });
  }

  function undo(ids: string[]) {
    start(async () => {
      const state = await undoStockAction(ids);
      setToast(state.ok ? null : { kind: "error", message: state.message ?? "Non posso annullare." });
    });
  }

  return (
    <ListAccordion
      id="spesa"
      title="Lista della spesa"
      count={items.length}
      defaultOpen={defaultOpen}
      tone="accent"
    >
      {anyRed ? (
        <p className="border-b border-border px-4 py-2 text-sm text-muted">
          Le voci in rosso sono già in dispensa: controlla se ti servono davvero.
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-2 px-4 pt-3">
        <h3 className="text-sm font-semibold tracking-wide text-muted uppercase">Alimenti</h3>
        {food.length ? (
          <button type="button" onClick={stockAll} disabled={pending} className={cx(buttonClass.secondary, "min-h-10 px-3 text-sm")}>
            Tutto in dispensa
          </button>
        ) : null}
      </div>
      <ul className="flex flex-col gap-1 px-2 py-2">
        {food.map((item) => (
          <FoodRow key={item.id} item={item} note={inPantry[item.id]} starred={staples.includes(item.name_key)} onTick={() => tick(item)} disabled={pending} />
        ))}
        {!food.length ? <li className="px-2 py-1 text-sm text-muted">Nessun alimento da comprare.</li> : null}
      </ul>
      <div className="px-4 pb-3">
        {adding === "food" ? (
          <AddForm kind="food" known={known} onDone={() => setAdding(null)} />
        ) : (
          <button type="button" onClick={() => setAdding("food")} className={cx(buttonClass.ghost, "px-2 text-accent")}>
            + Alimento
          </button>
        )}
      </div>

      <div className="border-t border-border px-4 pt-3">
        <h3 className="text-sm font-semibold tracking-wide text-muted uppercase">Altro</h3>
      </div>
      <ul className="flex flex-col gap-1 px-2 py-2">
        {other.map((item) => (
          <OtherRow key={item.id} item={item} onTick={() => tick(item)} disabled={pending} />
        ))}
        {!other.length ? <li className="px-2 py-1 text-sm text-muted">Niente altro da comprare.</li> : null}
      </ul>
      <div className="px-4 pb-3">
        {adding === "other" ? (
          <AddForm kind="other" onDone={() => setAdding(null)} />
        ) : (
          <button type="button" onClick={() => setAdding("other")} className={cx(buttonClass.ghost, "px-2 text-accent")}>
            + Altro
          </button>
        )}
      </div>

      {toast ? (
        <div role="status" className="sticky bottom-24 m-2 flex flex-col gap-2 rounded-2xl bg-foreground px-4 py-3 text-sm text-background shadow-lg">
          {toast.kind === "error" ? (
            <div className="flex items-center justify-between gap-3">
              <span>{toast.message}</span>
              <button type="button" onClick={() => setToast(null)} className="min-h-10 px-2 font-medium">
                Chiudi
              </button>
            </div>
          ) : (
            <StockedToast toast={toast} onUndo={() => undo(toast.items.map((i) => i.id))} onClose={() => setToast(null)} pending={pending} />
          )}
        </div>
      ) : null}
    </ListAccordion>
  );
}

function StockedToast({
  toast,
  onUndo,
  onClose,
  pending,
}: {
  toast: Extract<Toast, { kind: "stocked" }>;
  onUndo: () => void;
  onClose: () => void;
  pending: boolean;
}) {
  const [dates, setDates] = useState(false);
  const first = toast.items[0];
  const text =
    toast.items.length === 1
      ? `${first.name} → ${storageLabel(first.storage)}`
      : `${toast.items.length} prodotti in dispensa`;
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <span>{text}</span>
        <span className="flex gap-1">
          <button type="button" onClick={onUndo} disabled={pending} className="min-h-10 px-2 font-semibold underline-offset-4 hover:underline">
            Annulla
          </button>
          <button type="button" onClick={onClose} aria-label="Chiudi" className="min-h-10 px-2">
            ×
          </button>
        </span>
      </div>
      {toast.bulk ? (
        dates ? (
          <ActionForm action={setExpiriesAction} className="gap-2 rounded-xl bg-surface p-3 text-foreground">
            <p className="text-xs text-muted">Data sulla confezione (facoltativa).</p>
            {toast.items.map((i) => (
              <label key={i.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate">{i.name}</span>
                <input type="date" name={`exp:${i.foodItemId}:1`} className="min-h-10 rounded-lg border border-border bg-surface px-2" />
              </label>
            ))}
            <SubmitButton className="min-h-10">Salva scadenze</SubmitButton>
          </ActionForm>
        ) : (
          <button type="button" onClick={() => setDates(true)} className="w-fit min-h-10 font-medium underline underline-offset-4">
            Aggiungi scadenze
          </button>
        )
      ) : null}
    </>
  );
}

function Check({ onClick, label, disabled }: { onClick: () => void; label: string; disabled: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} className="flex size-11 shrink-0 items-center justify-center rounded-xl">
      <span aria-hidden className="inline-block size-5 rounded-md border-2 border-accent" />
    </button>
  );
}

function FoodRow({
  item,
  note,
  starred,
  onTick,
  disabled,
}: {
  item: ShoppingItem;
  note?: string;
  starred: boolean;
  onTick: () => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [busy, start] = useTransition();
  const qty = item.quantity ? `${formatItalianNumber(Number(item.quantity))}${item.unit ? ` ${UNITS.find((u) => u.id === item.unit)?.label ?? item.unit}` : ""}` : null;
  return (
    <li className={cx("flex flex-col rounded-xl", note && "bg-already")}>
      <div className="flex items-center gap-1">
        <Check onClick={onTick} disabled={disabled || busy} label={`Comprato, metti in dispensa: ${item.name}`} />
        <button type="button" onClick={() => setOpen((v) => !v)} className="flex min-h-11 min-w-0 flex-1 flex-col justify-center text-left" aria-expanded={open}>
          <span className="truncate">{item.name}</span>
          {qty || item.brand ? <span className="truncate text-xs text-muted">{[qty, item.brand].filter(Boolean).join(" · ")}</span> : null}
        </button>
        <select
          aria-label={`Dove va: ${item.name}`}
          value={item.storage ?? "pantry"}
          disabled={busy}
          onChange={(e) => {
            const value = e.target.value;
            start(async () => {
              await setShoppingStorageAction(item.id, item.version, value);
            });
          }}
          className="min-h-9 rounded-full border border-border bg-surface px-2 text-xs"
        >
          {STORAGES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          aria-label={starred ? `${item.name} è abituale` : `Segna come abituale: ${item.name}`}
          aria-pressed={starred}
          disabled={busy || starred}
          onClick={() =>
            start(async () => {
              await setStapleAction(item.name, item.barcode, true);
            })
          }
          className={cx("flex size-10 items-center justify-center text-lg", starred ? "text-[#d9a33a]" : "text-muted")}
        >
          {starred ? "★" : "☆"}
        </button>
        <button
          type="button"
          aria-label={`Togli dalla lista: ${item.name}`}
          disabled={busy}
          onClick={() =>
            start(async () => {
              await setShoppingStatusAction(item.id, item.version, "removed");
            })
          }
          className="flex size-10 items-center justify-center text-muted"
        >
          ×
        </button>
      </div>
      {open && note ? <p className="px-12 pb-2 text-xs text-muted">In dispensa: {note}</p> : null}
    </li>
  );
}

function OtherRow({ item, onTick, disabled }: { item: ShoppingItem; onTick: () => void; disabled: boolean }) {
  const [busy, start] = useTransition();
  return (
    <li className="flex items-center gap-1">
      <Check onClick={onTick} disabled={disabled || busy} label={`Fatto: ${item.name}`} />
      <span className="min-w-0 flex-1 truncate">{item.name}</span>
      <button
        type="button"
        aria-label={`Togli dalla lista: ${item.name}`}
        disabled={busy}
        onClick={() =>
          start(async () => {
            await setShoppingStatusAction(item.id, item.version, "removed");
          })
        }
        className="flex size-10 items-center justify-center text-muted"
      >
        ×
      </button>
    </li>
  );
}

function AddForm({ kind, known = [], onDone }: { kind: "food" | "other"; known?: FoodFacts[]; onDone: () => void }) {
  return (
    <ActionForm action={addShoppingItemAction} className="gap-3 rounded-2xl border border-border p-3">
      <input type="hidden" name="kind" value={kind} />
      {kind === "food" ? (
        <>
          <FoodLookup targets={{ name: "name", brand: "brand", barcode: "barcode" }} known={known} />
          <input type="hidden" name="brand" />
          <input type="hidden" name="barcode" />
          <input type="hidden" name="category" />
          <input type="hidden" name="kcal_100g" />
          <input type="hidden" name="protein_100g" />
          <input type="hidden" name="carbs_100g" />
          <input type="hidden" name="fat_100g" />
          <input type="hidden" name="nutrition_source" />
        </>
      ) : null}
      <Field label={kind === "food" ? "Alimento" : "Cosa"} name="name" placeholder={kind === "food" ? "Es. Latte" : "Es. Detersivo"} required />
      {kind === "food" ? (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Quantità" name="quantity" inputMode="decimal" placeholder="Facoltativa" />
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Unità
            <select name="unit" defaultValue="" className="min-h-12 rounded-xl border border-border bg-surface px-3 text-base font-normal">
              <option value="">—</option>
              {UNITS.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : null}
      <div className="flex gap-2">
        <SubmitButton pendingLabel="…" className="flex-1">
          Aggiungi
        </SubmitButton>
        <button type="button" onClick={onDone} className={buttonClass.ghost}>
          Chiudi
        </button>
      </div>
    </ActionForm>
  );
}
