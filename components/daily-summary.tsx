import { MacroLine } from "@/components/kitchen";
import { ProgressRing } from "@/components/progress-ring";
import { Card, cx } from "@/components/ui";
import { formatItalianNumber } from "@/lib/goals";
import type { Totals } from "@/lib/nutrition";
import { targetProgress } from "@/lib/nutrition";

const RING = "#3f9d8c";
const OVER = "#c4553f";

/**
 * Compact daily nutritional summary: progress ring, consumed/remaining kcal, macros.
 * Shows different labels for past, today, and future dates.
 */
export function DailySummary({
  totals,
  target,
  today,
  selectedDay,
}: {
  totals: Totals;
  target: number | null;
  today: string;
  selectedDay: string;
}) {
  const progress = targetProgress(totals.kcal, target);
  const over = progress.left !== null && progress.left < 0;
  const isFuture = selectedDay > today;
  const isToday = selectedDay === today;

  const kcalLabel = isFuture ? "previste" : "kcal";

  return (
    <Card className="flex items-center gap-5 p-4">
      <ProgressRing
        percent={target ? progress.percent : 0}
        color={over ? OVER : RING}
        size={96}
        stroke={9}
        label={target ? `${totals.kcal} kcal su ${target}` : `${totals.kcal} kcal`}
      >
        <span className="text-xl font-semibold">{formatItalianNumber(totals.kcal)}</span>
        <span className="text-[10px] text-muted">{kcalLabel}</span>
      </ProgressRing>
      <div className="flex flex-1 flex-col gap-2">
        {target ? (
          <p className={cx("text-sm font-medium", over && "text-danger")}>
            {over
              ? `${formatItalianNumber(-progress.left!)} kcal oltre l'obiettivo`
              : isFuture
                ? `Previste ${formatItalianNumber(totals.kcal)} di ${formatItalianNumber(target)}`
                : `Restano ${formatItalianNumber(progress.left!)} kcal`}
          </p>
        ) : (
          <p className="text-xs text-muted">Imposta un obiettivo nelle impostazioni.</p>
        )}
        <MacroLine totals={totals} hideKcal />
        {isFuture ? (
          <p className="text-[10px] text-muted">Valori previsti dalla pianificazione</p>
        ) : null}
      </div>
    </Card>
  );
}
