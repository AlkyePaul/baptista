/**
 * Rooms ("stanze") organise the app: each room has its own background tint and its own middle
 * navigation items; Home and Baptista are always present (decision D20).
 * Soggiorno is the main room (daily life); the other rooms get their content in Phase 04.
 */

export const ROOM_IDS = ["soggiorno", "cucina", "finanze", "guardaroba"] as const;
export type RoomId = (typeof ROOM_IDS)[number];

export type IconName =
  | "home"
  | "assistant"
  | "habit"
  | "add"
  | "calendar"
  | "sofa"
  | "cutlery"
  | "piggybank"
  | "wardrobe"
  | "pantry"
  | "clock"
  | "receipt"
  | "coins"
  | "hanger"
  | "tag"
  | "diet"
  | "target"
  | "chart"
  | "camera"
  | "search";

export type NavItem = { href: string; label: string; icon: IconName };

export type Room = {
  id: RoomId;
  label: string;
  icon: IconName;
  description: string;
  nav: [NavItem, NavItem, NavItem];
  available: boolean;
};

export const ROOMS: Record<RoomId, Room> = {
  soggiorno: {
    id: "soggiorno",
    label: "Soggiorno",
    icon: "sofa",
    description: "Cose da fare, eventi, abitudini e obiettivi",
    available: true,
    nav: [
      { href: "/abitudini", label: "Abitudini", icon: "habit" },
      { href: "/aggiungi", label: "Aggiungi", icon: "add" },
      { href: "/calendario", label: "Calendario", icon: "calendar" },
    ],
  },
  cucina: {
    id: "cucina",
    label: "Cucina",
    icon: "cutlery",
    description: "Dispensa con scadenze, ricette, pasti e conta calorie",
    available: true,
    // D25: expiries live inside the Dispensa; the third slot is the diet / calorie counter.
    nav: [
      { href: "/stanze/cucina/dispensa", label: "Dispensa", icon: "pantry" },
      { href: "/stanze/cucina/aggiungi", label: "Aggiungi", icon: "add" },
      { href: "/stanze/cucina/dieta", label: "Dieta", icon: "diet" },
    ],
  },
  finanze: {
    id: "finanze",
    label: "Finanze",
    icon: "piggybank",
    description: "Spese, budget, progetti di spesa e watchlist",
    available: true,
    // D26: a receipt is just a way to add an expense (modal inside Spese); budgets and spending
    // goals share a page; the watchlist shows securities with TradingView widgets.
    nav: [
      { href: "/stanze/finanze/spese", label: "Spese", icon: "coins" },
      { href: "/stanze/finanze/budget", label: "Budget", icon: "target" },
      { href: "/stanze/finanze/watchlist", label: "Watchlist", icon: "chart" },
    ],
  },
  guardaroba: {
    id: "guardaroba",
    label: "Guardaroba",
    icon: "wardrobe",
    description: "I capi di casa, fotografati e classificati",
    available: true,
    nav: [
      { href: "/stanze/guardaroba/capi", label: "Capi", icon: "hanger" },
      { href: "/stanze/guardaroba/aggiungi", label: "Aggiungi", icon: "add" },
      { href: "/stanze/guardaroba/categorie", label: "Categorie", icon: "tag" },
    ],
  },
};

export const DEFAULT_ROOM: RoomId = "soggiorno";
export const ROOM_COOKIE = "baptista_room";

export function isRoomId(value: unknown): value is RoomId {
  return typeof value === "string" && (ROOM_IDS as readonly string[]).includes(value);
}

/** Selected room first, the others keep their natural order. */
export function orderedRooms(selected: RoomId): Room[] {
  return [ROOMS[selected], ...ROOM_IDS.filter((id) => id !== selected).map((id) => ROOMS[id])];
}

/** Middle nav items belong to a room; returns which room owns a path (if any). */
export function roomForPath(pathname: string): RoomId | null {
  const match = /^\/stanze\/([^/]+)/.exec(pathname);
  if (match && isRoomId(match[1])) return match[1];
  if (ROOMS.soggiorno.nav.some((item) => pathname.startsWith(item.href))) return "soggiorno";
  return null;
}
