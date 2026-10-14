"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { Icon } from "@/components/icons";
import { buttonClass, cx } from "@/components/ui";
import { addDays, formatDay, weekdayInitial, weekDays, weekStart } from "@/lib/dates";

/**
 * Weekly navigation strip: 7 day cells with today/selected highlighting.
 * Navigates by updating the `?giorno=` search parameter (no full reload).
 */
export function WeekCalendar({
  selected,
  today,
  /** Set of dates (YYYY-MM-DD) that have at least one diary entry — shown as dots. */
  datesWithEntries,
}: {
  selected: string;
  today: string;
  datesWithEntries?: Set<string>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const navigate = useCallback(
    (day: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (day === today) params.delete("giorno");
      else params.set("giorno", day);
      router.push(`/stanze/cucina/pasti?${params.toString()}`, { scroll: false });
    },
    [router, searchParams, today],
  );

  const days = weekDays(selected);
  const mon = weekStart(selected);
  const prevMon = addDays(mon, -7);
  const nextMon = addDays(mon, 7);

  return (
    <div className="flex flex-col gap-2">
      {/* Week navigation */}
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => navigate(prevMon)}
          className={cx(buttonClass.ghost, "size-10 px-0")}
          aria-label="Settimana precedente"
        >
          <Icon name="chevron-left" className="size-5" />
        </button>
        <button
          type="button"
          onClick={() => navigate(today)}
          className={cx(
            "text-sm font-medium transition-colors",
            selected === today ? "text-muted" : "text-accent",
          )}
        >
          Oggi
        </button>
        <button
          type="button"
          onClick={() => navigate(nextMon)}
          className={cx(buttonClass.ghost, "size-10 px-0")}
          aria-label="Settimana successiva"
        >
          <Icon name="chevron-right" className="size-5" />
        </button>
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-1" role="listbox" aria-label="Giorni della settimana">
        {days.map((day) => {
          const isToday = day === today;
          const isSelected = day === selected;
          const hasEntries = datesWithEntries?.has(day);
          const dayNum = day.split("-")[2];

          return (
            <button
              key={day}
              type="button"
              role="option"
              aria-selected={isSelected}
              aria-label={formatDay(day)}
              onClick={() => navigate(day)}
              className={cx(
                "flex flex-col items-center gap-0.5 rounded-xl py-2 text-sm transition-colors",
                isSelected
                  ? "bg-accent text-on-accent"
                  : isToday
                    ? "bg-accent/10 text-accent"
                    : "text-foreground hover:bg-foreground/5",
              )}
            >
              <span className="text-[10px] font-medium uppercase opacity-70">{weekdayInitial(day)}</span>
              <span className="text-base font-semibold">{Number(dayNum)}</span>
              {hasEntries && !isSelected ? (
                <span className="size-1 rounded-full bg-current opacity-40" aria-hidden />
              ) : (
                <span className="size-1" aria-hidden />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
