import { ProgressRing, ringColor } from "@/components/progress-ring";
import { cx } from "@/components/ui";
import { formatTime, localDate } from "@/lib/dates";
import type { BriefingVisual } from "@/lib/intelligence/briefing";

const MONTHS = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
const DANGER = "#c4553f";

/** The D23 visuals (ring, day counter, date tile); also the thumbnail next to Baptista's text. */
export function Visual({ item, size, timeZone, color }: { item: { visual: BriefingVisual; sourceId: string }; size: number; timeZone: string; color?: string }) {
  const v: BriefingVisual = item.visual;
  const big = size >= 80;
  switch (v.kind) {
    case "habit": {
      const ring = v.finishedWeek ? "#9a948a" : (color ?? ringColor(item.sourceId));
      return (
        <ProgressRing
          percent={(100 * v.logged) / v.target}
          color={ring}
          size={size}
          stroke={big ? 9 : 7}
          label={`${v.logged} su ${v.target}${v.finishedWeek ? " la settimana scorsa" : " questa settimana"}`}
        >
          <span className={cx("font-semibold", big ? "text-lg" : "text-sm")}>
            {v.logged}/{v.target}
          </span>
        </ProgressRing>
      );
    }
    case "goal":
      return (
        <ProgressRing percent={v.percent} color={color ?? ringColor(item.sourceId)} size={size} stroke={big ? 9 : 7} label={`Obiettivo al ${v.percent}%`}>
          <span className={cx("font-semibold", big ? "text-lg" : "text-sm")}>{v.percent}%</span>
        </ProgressRing>
      );
    case "overdue":
      return (
        <ProgressRing percent={100} color={DANGER} size={size} stroke={big ? 9 : 7} label={`In ritardo di ${v.days} giorni`}>
          <span className={cx("font-semibold text-danger", big ? "text-2xl" : "text-base")}>+{v.days}</span>
          <span className="text-[10px] tracking-wide text-muted uppercase">{v.days === 1 ? "giorno" : "giorni"}</span>
        </ProgressRing>
      );
    case "event": {
      const day = v.day ?? (v.startsAt ? localDate(new Date(v.startsAt), timeZone) : null);
      const time = !v.allDay && v.startsAt ? formatTime(new Date(v.startsAt), timeZone) : null;
      return (
        <div
          aria-hidden
          className="flex shrink-0 flex-col overflow-hidden rounded-2xl border border-accent/30 bg-surface text-center shadow-sm"
          style={{ width: size, height: size }}
        >
          <span className={cx("bg-accent font-semibold text-on-accent uppercase", big ? "py-1 text-xs" : "py-0.5 text-[10px]")}>
            {day ? MONTHS[Number(day.slice(5, 7)) - 1] : "—"}
          </span>
          <span className={cx("flex flex-1 flex-col items-center justify-center leading-none font-semibold", big ? "text-3xl" : "text-xl")}>
            {day ? Number(day.slice(8, 10)) : "?"}
            <span className={cx("mt-1 font-medium text-muted", big ? "text-xs" : "text-[10px]")}>{time ?? "tutto il giorno"}</span>
          </span>
        </div>
      );
    }
    case "food": {
      // Days left to the effective date; estimates and undated food show «?» (never a fact).
      const urgent = v.daysLeft !== null && v.daysLeft <= 0 && !v.estimated;
      const value = v.daysLeft === null ? "?" : v.daysLeft < 0 ? `${v.daysLeft}` : v.daysLeft === 0 ? "oggi" : `${v.daysLeft}`;
      const unit = v.daysLeft === null || v.daysLeft === 0 ? (v.estimated ? "stima" : "") : Math.abs(v.daysLeft) === 1 ? "giorno" : "giorni";
      return (
        <ProgressRing
          percent={v.daysLeft === null ? 50 : Math.max(10, 100 - Math.max(0, v.daysLeft) * 30)}
          color={urgent ? DANGER : "#d9a33a"}
          size={size}
          stroke={big ? 9 : 7}
          label={v.daysLeft === null ? "Da controllare" : `Scadenza tra ${v.daysLeft} giorni`}
        >
          <span className={cx("font-semibold", urgent && "text-danger", big ? "text-xl" : "text-sm")}>{value}</span>
          {unit ? <span className="text-[10px] tracking-wide text-muted uppercase">{unit}</span> : null}
        </ProgressRing>
      );
    }
    default:
      return (
        <span aria-hidden className="flex shrink-0 items-center justify-center rounded-full bg-foreground/5 text-2xl" style={{ width: size, height: size }}>
          !
        </span>
      );
  }
}
