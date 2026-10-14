"use client";

import { useOptimistic, useTransition } from "react";
import { toggleFavoriteAction } from "@/app/actions/favorites";
import { Icon } from "@/components/icons";
import { cx } from "@/components/ui";

/**
 * Star toggle for favoriting a feature. Fires a server action without navigating.
 * Uses optimistic state for instant visual feedback.
 */
export function FavoriteStar({
  featureId,
  favorited,
  className,
}: {
  featureId: string;
  favorited: boolean;
  className?: string;
}) {
  const [optimistic, setOptimistic] = useOptimistic(favorited);
  const [pending, startTransition] = useTransition();

  function toggle(e: React.MouseEvent | React.KeyboardEvent) {
    e.preventDefault();
    e.stopPropagation();
    startTransition(async () => {
      setOptimistic(!optimistic);
      await toggleFavoriteAction(featureId);
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(e); } }}
      aria-label={optimistic ? "Rimuovi dai preferiti" : "Aggiungi ai preferiti"}
      aria-pressed={optimistic}
      className={cx(
        "inline-flex shrink-0 items-center justify-center rounded-full p-1.5 transition-all",
        "hover:bg-foreground/5 active:scale-90",
        optimistic ? "text-amber-500" : "text-muted",
        pending && "pointer-events-none",
        className,
      )}
    >
      <Icon name={optimistic ? "star-filled" : "star"} className="size-5" />
    </button>
  );
}
