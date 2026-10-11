"use client";

import { useState } from "react";
import { addFoodAction } from "@/app/actions/kitchen";
import { ActionForm, Field, SelectField, SubmitButton } from "@/components/forms";
import { FoodPicker } from "@/components/food-picker";
import { PantryItemFields } from "@/components/kitchen";
import { cx } from "@/components/ui";
import type { Food } from "@/lib/db/types";
import { UNITS } from "@/lib/food";

/**
 * Cucina → Aggiungi (D31): one flow. Pick a food (household catalog, Open Food Facts or new), then
 * put it in the pantry or on the shopping list.
 */
export function AddFoodForm({ today }: { today: string }) {
  const [food, setFood] = useState<Food | null>(null);
  const [destination, setDestination] = useState<"dispensa" | "lista">("dispensa");

  return (
    <ActionForm action={addFoodAction} successMessage>
      <FoodPicker onPick={setFood} autoFocus />
      {food ? (
        <>
          <fieldset className="grid grid-cols-2 gap-1 rounded-2xl border border-border bg-surface p-1">
            <legend className="sr-only">Dove va</legend>
            {(["dispensa", "lista"] as const).map((d) => (
              <label
                key={d}
                className={cx(
                  "flex min-h-11 cursor-pointer items-center justify-center rounded-xl text-sm font-medium",
                  destination === d ? "bg-foreground/[0.07] text-foreground" : "text-muted",
                )}
              >
                <input type="radio" name="destination" value={d} checked={destination === d} onChange={() => setDestination(d)} className="sr-only" />
                {d === "dispensa" ? "In dispensa" : "In lista della spesa"}
              </label>
            ))}
          </fieldset>
          {destination === "dispensa" ? (
            <PantryItemFields today={today} defaultStorage={food.default_storage} />
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Quantità" name="quantity" inputMode="decimal" placeholder="Facoltativa" />
              <SelectField label="Unità" name="unit" defaultValue="" options={[{ value: "", label: "—" }, ...UNITS.map((u) => ({ value: u.id, label: u.label }))]} />
            </div>
          )}
          <SubmitButton>{destination === "dispensa" ? "Metti in dispensa" : "Aggiungi alla lista"}</SubmitButton>
        </>
      ) : null}
    </ActionForm>
  );
}
