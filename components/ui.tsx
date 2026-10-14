import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export const buttonClass = {
  primary:
    "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-accent px-5 font-medium text-on-accent transition active:scale-[0.98] disabled:opacity-60",
  secondary:
    "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border bg-surface px-5 font-medium transition active:scale-[0.98] disabled:opacity-60",
  ghost:
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-medium text-muted transition hover:bg-foreground/5 disabled:opacity-60",
  danger:
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-3 text-sm font-medium text-danger transition hover:bg-danger/10 disabled:opacity-60",
} as const;

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <header className="flex items-end justify-between gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        {subtitle ? <p className="text-muted">{subtitle}</p> : null}
      </div>
      {action}
    </header>
  );
}

export function Section({
  title,
  id,
  action,
  children,
}: {
  title: string;
  id?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-title` : undefined} className="flex scroll-mt-24 flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id={id ? `${id}-title` : undefined} className="text-lg font-semibold">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Card({ className, children, ...props }: ComponentProps<"div">) {
  return (
    <div className={cx("rounded-2xl border border-border bg-surface", className)} {...props}>
      {children}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-2xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
      {children}
    </p>
  );
}

export function Badge({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "accent" | "danger" }) {
  const tones = {
    muted: "bg-foreground/5 text-muted",
    accent: "bg-accent/15 text-accent",
    danger: "bg-danger/10 text-danger",
  };
  return <span className={cx("rounded-full px-2.5 py-0.5 text-xs font-medium w-fit", tones[tone])}>{children}</span>;
}

export function ProgressBar({ value, label }: { value: number; label: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamped}
      className="h-2 overflow-hidden rounded-full bg-foreground/10"
    >
      <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${clamped}%` }} />
    </div>
  );
}

export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="text-sm font-medium text-accent underline-offset-4 hover:underline">
      {children}
    </Link>
  );
}

export function PrivateMark({ visibility }: { visibility: "private" | "household" }) {
  if (visibility !== "private") return null;
  return <Badge>Solo io</Badge>;
}

export function Avatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  const palette = ["bg-[#d9e8dd] text-[#2f5640]", "bg-[#f1dfcf] text-[#7a4a21]", "bg-[#dfe3f1] text-[#33416e]", "bg-[#f0dbe0] text-[#7a3245]"];
  const hash = [...name].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return (
    <span
      aria-hidden
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold ring-2 ring-background",
        size === "md" ? "size-12 text-base" : "size-8 text-xs",
        palette[hash % palette.length],
      )}
    >
      {initials || "?"}
    </span>
  );
}

export function CategoryChip({ category }: { category: { name: string; color: string } }) {
  return (
    <span className="inline-flex w-fit items-center gap-1.5 text-xs font-medium text-muted">
      <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: category.color }} />
      {category.name}
    </span>
  );
}
