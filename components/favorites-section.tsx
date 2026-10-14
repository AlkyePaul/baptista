"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toggleFavoriteAction, reorderFavoritesAction, updateFavoriteModeAction } from "@/app/actions/favorites";
import { Icon } from "@/components/icons";
import { cx, Card } from "@/components/ui";
import type { IconName } from "@/lib/rooms";
import type { DisplayMode } from "@/lib/features";

export type FavoriteItem = {
  featureId: string;
  label: string;
  icon: IconName;
  href: string;
  roomLabel: string;
  displayMode: DisplayMode;
  canWidget: boolean;
};

/**
 * Favorites quick links on the Soggiorno home page.
 * Shows a compact grid of favorited sections with edit capabilities.
 */
export function FavoritesQuickLinks({ items }: { items: FavoriteItem[] }) {
  const [editing, setEditing] = useState(false);
  const [pending, startTransition] = useTransition();

  function remove(featureId: string) {
    startTransition(async () => { await toggleFavoriteAction(featureId); });
  }

  function moveUp(index: number) {
    if (index === 0) return;
    const ids = items.map((i) => i.featureId);
    [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]];
    startTransition(async () => { await reorderFavoritesAction(ids); });
  }

  function moveDown(index: number) {
    if (index >= items.length - 1) return;
    const ids = items.map((i) => i.featureId);
    [ids[index], ids[index + 1]] = [ids[index + 1], ids[index]];
    startTransition(async () => { await reorderFavoritesAction(ids); });
  }

  function toggleMode(item: FavoriteItem) {
    const next: DisplayMode = item.displayMode === "quick_link" ? "widget" : "quick_link";
    startTransition(async () => { await updateFavoriteModeAction(item.featureId, next); });
  }

  if (!items.length) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Preferiti</h2>
        <button
          type="button"
          onClick={() => setEditing((v) => !v)}
          className="text-sm font-medium text-accent"
        >
          {editing ? "Fatto" : "Modifica"}
        </button>
      </div>

      {editing ? (
        <ul className={cx("flex flex-col gap-1", pending && "opacity-60")}>
          {items.map((item, i) => (
            <li key={item.featureId} className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2">
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => moveUp(i)}
                  disabled={i === 0}
                  aria-label="Sposta su"
                  className="rounded p-1 text-muted hover:text-foreground disabled:opacity-30"
                >
                  <svg viewBox="0 0 20 20" className="size-4"><path d="M5 12.5l5-5 5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
                <button
                  type="button"
                  onClick={() => moveDown(i)}
                  disabled={i === items.length - 1}
                  aria-label="Sposta giù"
                  className="rounded p-1 text-muted hover:text-foreground disabled:opacity-30"
                >
                  <svg viewBox="0 0 20 20" className="size-4"><path d="M5 7.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
              </div>
              <Icon name={item.icon} className="size-5 shrink-0" />
              <span className="flex-1 text-sm font-medium">{item.label}</span>
              {item.canWidget ? (
                <button
                  type="button"
                  onClick={() => toggleMode(item)}
                  aria-label={item.displayMode === "widget" ? "Mostra come link" : "Mostra come widget"}
                  className="rounded-lg px-2 py-1 text-xs font-medium text-muted hover:bg-foreground/5"
                >
                  {item.displayMode === "widget" ? "Widget" : "Link"}
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => remove(item.featureId)}
                aria-label={`Rimuovi ${item.label} dai preferiti`}
                className="rounded-full p-1 text-danger hover:bg-danger/10"
              >
                <svg viewBox="0 0 20 20" className="size-4"><path d="M5 5l10 10M15 5l-10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="grid grid-cols-3 gap-2">
          {items.filter((i) => i.displayMode === "quick_link").map((item) => (
            <li key={item.featureId}>
              <Link
                href={item.href}
                className="flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-2xl border border-border bg-surface text-sm font-medium transition-colors hover:bg-foreground/[0.03]"
              >
                <Icon name={item.icon} className="size-5" />
                <span className="line-clamp-1 px-1 text-center text-xs">{item.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Empty state for when no favorites exist yet. */
export function FavoritesEmpty() {
  return (
    <Card className="flex flex-col items-center gap-3 px-6 py-8 text-center">
      <Icon name="star" className="size-8 text-muted" />
      <p className="text-sm text-muted">
        Aggiungi le sezioni che usi di più ai preferiti:
        tocca la stella nel menu delle stanze.
      </p>
    </Card>
  );
}
