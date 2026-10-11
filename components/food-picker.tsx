"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createCatalogFoodAction, pickOffFoodAction, searchCatalogAction, searchOffAction } from "@/app/actions/catalog";
import { ACTION_SUCCESS_EVENT } from "@/components/forms";
import { Icon } from "@/components/icons";
import { buttonClass, cx } from "@/components/ui";
import type { Food } from "@/lib/db/types";
import { FOOD_CATEGORIES, foodLine } from "@/lib/food";
import type { FoodFacts } from "@/lib/openfoodfacts-parse";

const inputClass =
  "min-h-12 w-full min-w-0 rounded-xl border border-border bg-surface px-4 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/25";

/**
 * Picks a food from the household catalog (D31): search the catalog first, then Open Food Facts;
 * if nothing fits, «Nuovo alimento» adds it to the catalog. The chosen food travels as a hidden
 * `food_id` input of the surrounding form. No free-text food anywhere.
 */
export function FoodPicker({
  name = "food_id",
  initial = null,
  onPick,
  label: title = "Alimento",
  autoFocus = false,
  keepAfterSubmit = false,
}: {
  name?: string;
  initial?: Food | null;
  onPick?: (food: Food | null) => void;
  label?: string;
  autoFocus?: boolean;
  /** Keep the chosen food after the surrounding form saved (edit forms). */
  keepAfterSubmit?: boolean;
}) {
  const [chosen, setChosen] = useState<Food | null>(initial);
  const [q, setQ] = useState("");
  const [foods, setFoods] = useState<Food[] | null>(null);
  const [off, setOff] = useState<FoodFacts[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const onPickRef = useRef(onPick);
  useEffect(() => {
    onPickRef.current = onPick;
  });

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  // After the surrounding ActionForm saved, start again from an empty search.
  useEffect(() => {
    const form = root.current?.closest("form");
    if (!form || keepAfterSubmit) return;
    const reset = () => {
      setChosen(null);
      onPickRef.current?.(null);
    };
    form.addEventListener(ACTION_SUCCESS_EVENT, reset);
    return () => form.removeEventListener(ACTION_SUCCESS_EVENT, reset);
  }, [keepAfterSubmit]);

  function choose(food: Food | null) {
    setChosen(food);
    onPick?.(food);
    if (food) {
      setQ("");
      setFoods(null);
      setOff(null);
      setCreating(false);
      setMessage(null);
    }
  }

  function search(value: string) {
    setQ(value);
    setOff(null);
    setMessage(null);
    if (timer.current) clearTimeout(timer.current);
    if (value.trim().length < 2) {
      setFoods(null);
      return;
    }
    timer.current = setTimeout(() => {
      start(async () => {
        const r = await searchCatalogAction(value);
        if (r.ok) setFoods(r.foods);
        else setMessage(r.message);
      });
    }, 250);
  }

  function searchOff() {
    setMessage(null);
    start(async () => {
      const r = await searchOffAction(q);
      if (!r.ok) setMessage(r.message);
      else {
        setOff(r.results);
        if (!r.results.length) setMessage("Nessun prodotto trovato su Open Food Facts.");
      }
    });
  }

  function pickOff(facts: FoodFacts) {
    start(async () => {
      const r = await pickOffFoodAction(facts);
      if (r.ok) choose(r.food);
      else setMessage(r.message);
    });
  }

  if (chosen) {
    return (
      <div ref={root} className="flex flex-col gap-1.5">
        <span className="text-sm font-medium">{title}</span>
        <div className="flex items-center gap-3 rounded-xl border border-accent/40 bg-accent/5 px-4 py-2.5">
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate font-medium">{chosen.name}</span>
            <span className="truncate text-xs text-muted">{foodLine(chosen)}</span>
          </span>
          <button type="button" onClick={() => choose(null)} className="min-h-10 px-2 text-sm font-medium text-accent">
            Cambia
          </button>
        </div>
        <input type="hidden" name={name} value={chosen.id} />
      </div>
    );
  }

  return (
    <div ref={root} className="flex flex-col gap-2">
      <label className="text-sm font-medium" htmlFor={`${name}-search`}>
        {title}
      </label>
      <div className="relative">
        <Icon name="search" className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted" />
        <input
          id={`${name}-search`}
          type="search"
          value={q}
          autoFocus={autoFocus}
          onChange={(e) => search(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.preventDefault(); // never submit the surrounding form
          }}
          placeholder="Cerca per nome o codice a barre"
          autoComplete="off"
          className={cx(inputClass, "pl-10")}
        />
      </div>

      {foods?.length ? (
        <ResultList>
          {foods.map((f) => (
            <li key={f.id}>
              <button type="button" onClick={() => choose(f)} className="flex min-h-12 w-full flex-col justify-center px-3 py-2 text-left hover:bg-foreground/5">
                <span className="text-sm font-medium">{f.name}</span>
                <span className="text-xs text-muted">{foodLine(f)}</span>
              </button>
            </li>
          ))}
        </ResultList>
      ) : foods && !pending ? (
        <p className="text-sm text-muted">Non è ancora negli alimenti di casa.</p>
      ) : null}

      {q.trim().length >= 2 && !creating ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={searchOff} disabled={pending} className={cx(buttonClass.secondary, "min-h-10 px-3 text-sm")}>
            Cerca su Open Food Facts
          </button>
          <button type="button" onClick={() => setCreating(true)} className={cx(buttonClass.ghost, "min-h-10 px-3 text-accent")}>
            + Nuovo alimento «{q.trim()}»
          </button>
        </div>
      ) : null}

      {off?.length ? (
        <>
          <p className="text-xs text-muted">Da Open Food Facts: scegliendolo entra negli alimenti di casa. Viene inviato solo il testo cercato.</p>
          <ResultList>
            {off.map((f, i) => (
              <li key={`${f.barcode ?? f.name}-${i}`}>
                <button type="button" onClick={() => pickOff(f)} disabled={pending} className="flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left hover:bg-foreground/5">
                  <span className="flex flex-1 flex-col">
                    <span className="text-sm font-medium">{f.name}</span>
                    {f.brand ? <span className="text-xs text-muted">{f.brand}</span> : null}
                  </span>
                  <span className="shrink-0 text-xs text-muted">{f.kcal_100g ?? "?"} kcal</span>
                </button>
              </li>
            ))}
          </ResultList>
        </>
      ) : null}

      {creating ? <NewFood initialName={q.trim()} onCreated={choose} onCancel={() => setCreating(false)} /> : null}
      {pending ? <p className="text-xs text-muted">Cerco…</p> : null}
      {message ? (
        <p role="status" className="text-sm text-muted">
          {message}
        </p>
      ) : null}
    </div>
  );
}

function ResultList({ children }: { children: React.ReactNode }) {
  return <ul className="flex max-h-72 flex-col divide-y divide-border overflow-y-auto rounded-xl border border-border bg-surface">{children}</ul>;
}

/** Inline (not a nested form): values are sent with a button, the surrounding form is untouched. */
function NewFood({ initialName, onCreated, onCancel }: { initialName: string; onCreated: (food: Food) => void; onCancel: () => void }) {
  const [fields, setFields] = useState<Record<string, string>>({ name: initialName, category: "other" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setFields((f) => ({ ...f, [key]: e.target.value }));

  function save() {
    start(async () => {
      const r = await createCatalogFoodAction(fields);
      if (r.ok) onCreated(r.food);
      else {
        setMessage(r.message);
        setErrors(r.fieldErrors ?? {});
      }
    });
  }

  const field = (key: string, text: string, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <label className="flex flex-col gap-1 text-sm font-medium">
      {text}
      <input value={fields[key] ?? ""} onChange={set(key)} className={cx(inputClass, "min-h-11 px-3 font-normal")} aria-invalid={errors[key] ? true : undefined} {...extra} />
      {errors[key] ? <span className="text-xs font-normal text-danger">{errors[key]}</span> : null}
    </label>
  );

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-dashed border-accent/50 p-3">
      <p className="text-sm font-medium">Nuovo alimento di casa</p>
      {field("name", "Nome")}
      <div className="grid grid-cols-2 gap-2">
        {field("brand", "Marca")}
        <label className="flex flex-col gap-1 text-sm font-medium">
          Categoria
          <select value={fields.category} onChange={set("category")} className={cx(inputClass, "min-h-11 px-3 font-normal")}>
            {FOOD_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-xs text-muted">Valori per 100 g (facoltativi, servono per le calorie)</p>
      <div className="grid grid-cols-4 gap-2">
        {field("kcal_100g", "kcal", { inputMode: "decimal" })}
        {field("protein_100g", "Prot.", { inputMode: "decimal" })}
        {field("carbs_100g", "Carb.", { inputMode: "decimal" })}
        {field("fat_100g", "Grassi", { inputMode: "decimal" })}
      </div>
      {message ? <p className="text-sm text-danger">{message}</p> : null}
      <div className="flex gap-2">
        <button type="button" onClick={save} disabled={pending} className={cx(buttonClass.primary, "flex-1")}>
          {pending ? "…" : "Aggiungi agli alimenti"}
        </button>
        <button type="button" onClick={onCancel} className={buttonClass.ghost}>
          Annulla
        </button>
      </div>
    </div>
  );
}
