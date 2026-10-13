"use client";

import { useState } from "react";
import { cx } from "@/components/ui";

const DAYS = [
  { iso: 1, label: "L" },
  { iso: 2, label: "Ma" },
  { iso: 3, label: "Me" },
  { iso: 4, label: "G" },
  { iso: 5, label: "V" },
  { iso: 6, label: "S" },
  { iso: 7, label: "D" },
] as const;

export function WeekdayPicker({ defaultValue = [] }: { defaultValue?: number[] }) {
  const [selected, setSelected] = useState<Set<number>>(new Set(defaultValue));

  function toggle(day: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="text-sm font-medium">Giorni</span>
      <div className="flex gap-1">
        {DAYS.map((d) => (
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
      {/* Hidden inputs for form submission */}
      {[...selected].sort().map((day) => (
        <input key={day} type="hidden" name="weekdays" value={day} />
      ))}
    </div>
  );
}
