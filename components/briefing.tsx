import Link from "next/link";
import { dismissObservationAction } from "@/app/actions/domains";
import { ActionButton } from "@/components/forms";
import { ProgressRing, ringColor } from "@/components/progress-ring";
import { cx, EmptyState } from "@/components/ui";
import { formatTime, localDate } from "@/lib/dates";
import type { BriefingItem, BriefingVisual } from "@/lib/intelligence/briefing";

const MONTHS = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
const DANGER = "#c4553f";

const TONE_SURFACE: Record<BriefingItem["tone"], string> = {
  urgent: "border-danger/30 bg-danger/[0.06]",
  normal: "border-accent/30 bg-accent/[0.07]",
  info: "border-border bg-surface",
};

/** "In evidenza": the top situation as a hero card, the next two as tiles. */
export function Briefing({
  items,
  timeZone,
  colors = {},
}: {
  items: BriefingItem[];
  timeZone: string;
  /** Source id → colour (category colour when assigned). */
  colors?: Record<string, string>;
}) {
  if (!items.length) {
    return <EmptyState>Niente di urgente. Buona giornata!</EmptyState>;
  }
  const [hero, ...rest] = items;
  return (
    <div className="flex flex-col gap-2">
      <article className={cx("relative flex items-center gap-4 rounded-3xl border p-4 pr-12", TONE_SURFACE[hero.tone])}>
        <Visual item={hero} size={84} timeZone={timeZone} color={colors[hero.sourceId]} />
        <Link href={hero.href} className="flex min-h-11 flex-1 flex-col gap-1">
          <span className="text-lg leading-snug font-semibold">{hero.title}</span>
          {hero.description ? <span className="text-sm text-muted">{hero.description}</span> : null}
        </Link>
        <Dismiss item={hero} />
      </article>
      {rest.length ? (
        <div className="grid grid-cols-2 gap-2">
          {rest.map((item) => (
            <article key={item.id} className={cx("relative flex flex-col gap-2 rounded-3xl border p-3 pr-10", TONE_SURFACE[item.tone])}>
              <Visual item={item} size={56} timeZone={timeZone} color={colors[item.sourceId]} />
              <Link href={item.href} className="flex min-h-11 flex-col gap-0.5">
                <span className="line-clamp-2 text-sm leading-snug font-semibold">{item.title}</span>
                {item.description ? <span className="line-clamp-2 text-xs text-muted">{item.description}</span> : null}
              </Link>
              <Dismiss item={item} />
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Dismiss({ item }: { item: BriefingItem }) {
  return (
    <div className="absolute top-2 right-2">
      <ActionButton
        action={dismissObservationAction.bind(null, item.id)}
        label={`Ignora: ${item.title}`}
        className="size-9 min-h-9 rounded-full p-0 text-lg"
      >
        <span aria-hidden>×</span>
      </ActionButton>
    </div>
  );
}

/** The D23 visuals (ring, day counter, date tile); also the thumbnail next to Baptista's text. */
export function Visual({ item, size, timeZone, color }: { item: Pick<BriefingItem, "visual" | "sourceId">; size: number; timeZone: string; color?: string }) {
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
