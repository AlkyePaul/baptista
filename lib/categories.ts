import type { CategoryRef } from "@/lib/db/types";

/** Distinct, calm ring colours used when a record has no category (readable in light and dark). */
export const RING_COLORS = ["#e0795b", "#3f9d8c", "#d9a33a", "#7a6fd0", "#4f8fd6", "#c45f8f", "#6aa04f"] as const;

export function ringColor(seed: string): string {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return RING_COLORS[hash % RING_COLORS.length];
}

/** Palette offered when creating a category (stored as lowercase #rrggbb). */
export const CATEGORY_COLORS = [
  "#e0795b",
  "#c4553f",
  "#e6a23c",
  "#d9a33a",
  "#6aa04f",
  "#3f9d8c",
  "#2f7f9f",
  "#4f8fd6",
  "#7a6fd0",
  "#c45f8f",
  "#8a6d4f",
  "#7d7a73",
] as const;

export const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/** The record's colour: its category colour, otherwise a stable colour derived from its id. */
export function recordColor(record: { id: string; category?: CategoryRef | null }): string {
  return record.category?.color ?? ringColor(record.id);
}
