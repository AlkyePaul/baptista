import type { ReactNode } from "react";

export { ringColor } from "@/lib/categories";

/**
 * Circular progress (0–100). The arc is capped at 100%, while the label can show the real count
 * (e.g. 5/3) so over-achievement is not hidden.
 */
export function ProgressRing({
  percent,
  color,
  size = 72,
  stroke = 8,
  label,
  children,
}: {
  percent: number;
  color: string;
  size?: number;
  stroke?: number;
  label: string;
  children?: ReactNode;
}) {
  const clamped = Math.max(0, Math.min(100, percent));
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div
      role="img"
      aria-label={label}
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeOpacity={0.16} strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - clamped / 100)}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <span className="absolute inset-0 flex flex-col items-center justify-center text-center leading-tight">{children}</span>
    </div>
  );
}
