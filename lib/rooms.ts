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
  | "food"
  | "meals"
  | "target"
  | "chart"
  | "camera"
  | "search"
  | "outfit"
  | "type-top"
  | "type-knitwear"
  | "type-bottom"
  | "type-dress"
  | "type-outerwear"
  | "type-shoes"
  | "type-accessory"
  | "type-sportswear"
  | "type-underwear"
  | "type-other"
  | "star"
  | "star-filled"
  | "grip"
  | "chevron-right"
  | "repeat"
  | "chevron-left"
  | "chevron-down"
  | "chevron-up"
  | "plus"
  | "skip";

export type NavItem = { href: string; label: string; icon: IconName };

export type Room = {
  id: RoomId;
  label: string;
  icon: IconName;
  description: string;
  /** Two or three middle items of the bottom bar. */
  nav: NavItem[];
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
    description: "Dispensa, lista della spesa, ricettario e pasti",
    available: true,
    // D25: expiries live inside the Dispensa; the third slot is the diet / calorie counter.
    nav: [
      { href: "/stanze/cucina/dispensa", label: "Dispensa", icon: "pantry" },
      { href: "/stanze/cucina/aggiungi", label: "Aggiungi", icon: "add" },
      { href: "/stanze/cucina/pasti", label: "Pasti", icon: "meals" },
    ],
  },
  finanze: {
    id: "finanze",
    label: "Finanze",
    icon: "piggybank",
    description: "Spese, budget e progetti di spesa",
    available: true,
    // D26 revised (user 2026-10-11): no market tracking; «Aggiungi» adds an expense, a budget or
    // a project; budgets and projects share a page.
    nav: [
      { href: "/stanze/finanze/spese", label: "Spese", icon: "coins" },
      { href: "/stanze/finanze/aggiungi", label: "Aggiungi", icon: "add" },
      { href: "/stanze/finanze/budget", label: "Budget", icon: "piggybank" },
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
      { href: "/stanze/guardaroba/look", label: "Look", icon: "outfit" },
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
