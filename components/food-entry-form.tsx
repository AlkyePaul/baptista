"use client";

import { useState } from "react";
import { FoodPicker } from "@/components/food-picker";
import type { Food } from "@/lib/db/types";

/**
 * Wraps FoodPicker + a quantity/grams input. When the picked food has a portion_label, the input
 * switches to unit-based entry (hidden grams computed from quantity * portion_weight_g). Otherwise
 * it stays as a plain grams field.
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
          <div className="flex items-center gap-2">
            <input
              id="__unit_qty"
              name={gramsName === "grams" ? "__unit_qty" : "__unit_qty"}
              inputMode="decimal"
              placeholder="1"
              className="min-h-12 w-full rounded-xl border border-border bg-surface px-4 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/25"
              onChange={(e) => {
                // Compute grams from quantity * portion_weight_g and set hidden field
                const hidden = e.target.form?.querySelector<HTMLInputElement>(`input[name="${gramsName}"]`);
                if (hidden) {
                  const qty = parseFloat(e.target.value.replace(",", ".")) || 0;
                  hidden.value = String(Math.round(qty * food!.portion_weight_g! * 10) / 10);
                }
              }}
            />
          </div>
          <p className="text-xs text-muted">
            {food!.portion_label} · {food!.portion_weight_g} g/unità
          </p>
          <input type="hidden" name={gramsName} value="" />
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
