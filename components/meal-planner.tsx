"use client";

import { useState } from "react";
import { MealAccordion } from "@/components/meal-accordion";
import { FoodSelector } from "@/components/food-selector";
import type { DietEntry, Meal } from "@/lib/db/types";
import { SLOTS, type Slot } from "@/lib/nutrition";

type MealPlannerProps = {
  day: string;
  dayLabel: string;
  today: string;
  entries: DietEntry[];
  meals: Array<Meal & { kcal: number }>;
};

/**
 * Client wrapper that coordinates the meal accordions with the full-screen food selector.
 * Rendered per-day inside the meal planner page.
 */
export function MealPlanner({ day, dayLabel, today, entries, meals }: MealPlannerProps) {
  const [selectorSlot, setSelectorSlot] = useState<Slot | null>(null);

  function openSelector(slot: Slot) {
    setSelectorSlot(slot);
  }

  function closeSelector() {
    setSelectorSlot(null);
  }

  // If the food selector is open, render it full-screen
  if (selectorSlot) {
    return (
      <FoodSelector
        day={day}
        slot={selectorSlot}
        dayLabel={dayLabel}
        meals={meals}
        onClose={closeSelector}
      />
    );
  }

  // Otherwise, render the meal accordions
  return (
    <div className="flex flex-col gap-3">
      {SLOTS.map((slot, i) => {
        const slotEntries = entries.filter((e) => e.slot === slot.id);
        return (
          <MealAccordion
            key={slot.id}
            slot={slot.id}
            label={slot.label}
            entries={slotEntries}
            day={day}
            onAdd={() => openSelector(slot.id)}
            defaultOpen={i === 0 && slotEntries.length > 0}
          />
        );
      })}
    </div>
  );
}
