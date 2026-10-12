"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { cx } from "@/components/ui";
import {
  EXPRESSION_ALT,
  expressionSrc,
  type Expression,
} from "@/lib/baptista/expressions";

/** Intrinsic size hint for <Image>; the rendered size is always `--baptista-avatar-size`. */
const INTRINSIC = 44;

/**
 * Baptista's face (B-1, B-6): fades in when he enters; a change of expression is a cross-fade
 * (the new face fades in over the old one), never a cut; the confirmation gets a small bow.
 * Same size everywhere (`--baptista-avatar-size` in globals.css).
 */
export function BaptistaAvatar({
  expression,
  enter = true,
}: {
  expression: Expression;
  enter?: boolean;
}) {
  const [shown, setShown] = useState(expression);
  const [previous, setPrevious] = useState<Expression | null>(null);

  // Adjust state while rendering when the prop changes: keep the old face under the new one.
  if (expression !== shown) {
    setPrevious(shown);
    setShown(expression);
  }
  useEffect(() => {
    if (!previous) return;
    const t = setTimeout(() => setPrevious(null), 320);
    return () => clearTimeout(t);
  }, [previous]);

  const img = (e: Expression, className?: string) => (
    <Image
      key={e}
      src={expressionSrc(e, 192)}
      alt=""
      width={INTRINSIC}
      height={INTRINSIC}
      unoptimized
      className={cx(
        "absolute inset-0 h-full bg-white w-full rounded-full border border-border object-contain",
        className,
      )}
    />
  );

  return (
    <span
      role="img"
      aria-label={EXPRESSION_ALT[shown]}
      className={cx(
        "relative block size-(--baptista-avatar-size) shrink-0",
        enter && "baptista-enter bg-white",
      )}
    >
      <span
        className={cx(
          "absolute inset-0",
          shown === "confirmation" && "baptista-bow",
        )}
      >
        {previous ? img(previous) : null}
        {img(shown, previous ? "baptista-fade" : undefined)}
      </span>
    </span>
  );
}
