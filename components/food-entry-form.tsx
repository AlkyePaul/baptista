"use client";

import { useState } from "react";
import { FoodPicker } from "@/components/food-picker";
import type { Food } from "@/lib/db/types";

/**
 * Wraps FoodPicker + a quantity/grams input. When the picked food has a portion_label, the input
 * switches to unit-based entry (quantity 1–99 integer, grams computed server-side from
 * quantity × portion_weight_g). Otherwise it shows a plain grams field (1–3000).
 */
export function FoodEntryForm({
  gramsName = "grams",
  gramsPlaceholder = "100",
  gramsHint,
  label,
}: {
  gramsName?: string;
  gramsPlaceholder?: string;
  gramsHint?: string;
  label?: string;
}) {
  const [food, setFood] = useState<Food | null>(null);
  const hasUnit = food?.portion_label && food?.portion_weight_g;

  return (
    <>
      <FoodPicker onPick={setFood} label={label} />
      {hasUnit ? (
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium" htmlFor="__unit_qty">
            Quantità
          </label>
          <input type="hidden" name="portion_weight_g" value={food!.portion_weight_g!} />
          <input
            id="__unit_qty"
            name="quantity"
            type="number"
            min={1}
            max={99}
            step={1}
            placeholder="1"
            className="min-h-12 w-full rounded-xl border border-border bg-surface px-4 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
          />
          <p className="text-xs text-muted">
            {food!.portion_label} · {food!.portion_weight_g} g/unità
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <label className="text-sm font-medium" htmlFor="__grams_field">
            Grammi
          </label>
          <input
            id="__grams_field"
            name={gramsName}
            inputMode="decimal"
            placeholder={gramsPlaceholder}
            className="min-h-12 w-full rounded-xl border border-border bg-surface px-4 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
          />
          {gramsHint ? <p className="text-xs text-muted">{gramsHint}</p> : null}
        </div>
      )}
    </>
  );
}
