/**
 * Unified feature registry: every navigable destination in Baptista, described once and consumed
 * by the header navigation, the favorites system and the Soggiorno home.
 *
 * Identifiers are stable (`room.section`) and independent of translated labels or route paths.
 * The registry is derived from `ROOMS` in rooms.ts but enriched with metadata for personalization.
 */

import type { IconName, RoomId } from "@/lib/rooms";

export type DisplayMode = "quick_link" | "widget";

export type Feature = {
  /** Stable unique key: `room.section` (e.g. "cucina.dispensa"). */
  id: string;
  /** Parent room. */
  room: RoomId;
  /** Italian label shown in navigation and quick links. */
  label: string;
  /** Icon identifier from the shared icon set. */
  icon: IconName;
  /** Application route. */
  href: string;
  /** Sort order within the room (lower = earlier). */
  order: number;
  /** Whether this feature can be favorited. */
  canFavorite: boolean;
  /** Whether it supports a quick-link presentation on the Home. */
  canQuickLink: boolean;
  /** Whether a data widget is implemented for this feature. */
  canWidget: boolean;
  /** Widget component key (matches WIDGET_REGISTRY in widgets). Only set when canWidget is true. */
  widgetId?: string;
};

/**
 * The full feature registry. Every navigable subsection of every room is listed here.
 * "Aggiungi" links are excluded: they are creation shortcuts, not navigable sections to bookmark.
 */
export const FEATURES: Feature[] = [
  // ── Soggiorno ───────────────────────────────────────────────────────
  {
    id: "soggiorno.abitudini",
    room: "soggiorno",
    label: "Abitudini",
    icon: "habit",
    href: "/abitudini",
    order: 1,
    canFavorite: true,
    canQuickLink: true,
    canWidget: false,
  },
  {
    id: "soggiorno.calendario",
    room: "soggiorno",
    label: "Calendario",
    icon: "calendar",
    href: "/calendario",
    order: 2,
    canFavorite: true,
    canQuickLink: true,
    canWidget: false,
  },

  // ── Cucina ──────────────────────────────────────────────────────────
  {
    id: "cucina.dispensa",
    room: "cucina",
    label: "Dispensa",
    icon: "pantry",
    href: "/stanze/cucina/dispensa",
    order: 1,
    canFavorite: true,
    canQuickLink: true,
    canWidget: false,
  },
  {
    id: "cucina.pasti",
    room: "cucina",
    label: "Diario alimentare",
    icon: "diet",
    href: "/stanze/cucina/pasti",
    order: 2,
    canFavorite: true,
    canQuickLink: true,
    canWidget: true,
    widgetId: "diet-today",
  },
  {
    id: "cucina.ricette",
    room: "cucina",
    label: "Ricette",
    icon: "cutlery",
    href: "/stanze/cucina/ricette",
    order: 3,
    canFavorite: true,
    canQuickLink: true,
    canWidget: false,
  },

  // ── Finanze ─────────────────────────────────────────────────────────
  {
    id: "finanze.spese",
    room: "finanze",
    label: "Spese",
    icon: "coins",
    href: "/stanze/finanze/spese",
    order: 1,
    canFavorite: true,
    canQuickLink: true,
    canWidget: true,
    widgetId: "finance-month",
  },
  {
    id: "finanze.budget",
    room: "finanze",
    label: "Budget e progetti",
    icon: "piggybank",
    href: "/stanze/finanze/budget",
    order: 2,
    canFavorite: true,
    canQuickLink: true,
    canWidget: false,
  },

  // ── Guardaroba ──────────────────────────────────────────────────────
  {
    id: "guardaroba.capi",
    room: "guardaroba",
    label: "I miei capi",
    icon: "hanger",
    href: "/stanze/guardaroba/capi",
    order: 1,
    canFavorite: true,
    canQuickLink: true,
    canWidget: true,
    widgetId: "wardrobe-recent",
  },
  {
    id: "guardaroba.look",
    room: "guardaroba",
    label: "I miei look",
    icon: "outfit",
    href: "/stanze/guardaroba/look",
    order: 2,
    canFavorite: true,
    canQuickLink: true,
    canWidget: false,
  },
];

/** Lookup a feature by its stable ID. */
export function getFeature(id: string): Feature | undefined {
  return FEATURES.find((f) => f.id === id);
}

/** All features belonging to a room, sorted by order. */
export function featuresForRoom(room: RoomId): Feature[] {
  return FEATURES.filter((f) => f.room === room).sort((a, b) => a.order - b.order);
}

/** All feature IDs that are valid for favoriting. */
export function favoritableIds(): Set<string> {
  return new Set(FEATURES.filter((f) => f.canFavorite).map((f) => f.id));
}

/** Room labels for display (Italian). */
export const ROOM_LABELS: Record<RoomId, string> = {
  soggiorno: "Soggiorno",
  cucina: "Cucina",
  finanze: "Finanze",
  guardaroba: "Guardaroba",
};
