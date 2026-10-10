"use client";

import { useRef, useState, useTransition } from "react";
import { lookupFoodAction } from "@/app/actions/kitchen";
import { Icon } from "@/components/icons";
import { buttonClass, cx } from "@/components/ui";
import type { FoodFacts } from "@/lib/openfoodfacts-parse";

/** Form field names the lookup fills; nutrition fields keep their standard names. */
type Targets = { name: string; brand?: string; barcode?: string };

const fmt = (n: number | null) => (n === null ? "" : String(n).replace(".", ","));

/**
 * Open Food Facts search inside a form: by name or barcode digits. Choosing a result fills the
 * enclosing form's inputs (the user can still correct every value before saving).
 */
export function FoodLookup({
  targets = { name: "product_name", brand: "brand", barcode: "barcode" },
  known = [],
}: {
  targets?: Targets;
  /** Foods already in the house with nutrition data, offered as one-tap chips. */
  known?: FoodFacts[];
}) {
  const box = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FoodFacts[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function search() {
    setMessage(null);
    setChosen(null);
    startTransition(async () => {
      const result = await lookupFoodAction(query);
      if (!result.ok) {
        setResults(null);
        setMessage(result.message);
        return;
      }
      setResults(result.results);
      if (!result.results.length) setMessage("Nessun prodotto trovato. Puoi inserire i valori a mano.");
    });
  }

  function choose(food: FoodFacts) {
    const form = box.current?.closest("form");
    if (!form) return;
    const set = (name: string | undefined, value: string) => {
      if (!name) return;
      const input = form.elements.namedItem(name);
      if (input instanceof HTMLInputElement || input instanceof HTMLSelectElement) input.value = value;
    };
    set(targets.name, food.brand && targets.brand === undefined ? `${food.name} (${food.brand})` : food.name);
    set(targets.brand, food.brand ?? "");
    set(targets.barcode, food.barcode ?? "");
    set("kcal_100g", fmt(food.kcal_100g));
    set("protein_100g", fmt(food.protein_100g));
    set("carbs_100g", fmt(food.carbs_100g));
    set("fat_100g", fmt(food.fat_100g));
    set("nutrition_source", "openfoodfacts");
    if (food.category) set("category", food.category);
    setChosen(food.name);
    setResults(null);
  }

  return (
    <div ref={box} className="flex flex-col gap-2 rounded-2xl border border-dashed border-border p-3">
      <label className="text-sm font-medium" htmlFor="food-lookup">
        Cerca su Open Food Facts
      </label>
      <div className="flex gap-2">
        <input
          id="food-lookup"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault(); // never submit the surrounding form
              search();
            }
          }}
          placeholder="Nome o codice a barre"
          autoComplete="off"
          className="min-h-12 w-full min-w-0 flex-1 rounded-xl border border-border bg-surface px-4 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
        />
        <button type="button" onClick={search} disabled={pending || query.trim().length < 2} className={cx(buttonClass.secondary, "px-4")} aria-label="Cerca">
          {pending ? "…" : <Icon name="search" className="size-5" />}
        </button>
      </div>
      <p className="text-xs text-muted">Viene inviato solo il testo cercato. I valori sono per 100 g o 100 ml e restano modificabili.</p>
      {known.length ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted">Dalla dispensa</span>
          <div className="flex flex-wrap gap-1.5">
            {known.slice(0, 12).map((food, i) => (
              <button
                key={`${food.name}-${i}`}
                type="button"
                onClick={() => choose(food)}
                className="min-h-9 rounded-full border border-border bg-surface px-3 text-sm hover:border-accent"
              >
                {food.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {chosen ? (
        <p role="status" className="text-sm text-accent">
          Valori di «{chosen}» inseriti qui sotto.
        </p>
      ) : null}
      {message ? (
        <p role="status" className="text-sm text-muted">
          {message}
        </p>
      ) : null}
      {results?.length ? (
        <ul className="flex max-h-72 flex-col divide-y divide-border overflow-y-auto rounded-xl border border-border bg-surface">
          {results.map((food, i) => (
            <li key={`${food.barcode ?? food.name}-${i}`}>
              <button type="button" onClick={() => choose(food)} className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left hover:bg-foreground/5">
                <span className="flex flex-1 flex-col">
                  <span className="text-sm font-medium">{food.name}</span>
                  {food.brand ? <span className="text-xs text-muted">{food.brand}</span> : null}
                </span>
                <span className="shrink-0 text-sm text-muted">{food.kcal_100g ?? "?"} kcal</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
