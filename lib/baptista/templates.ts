/** Small template families shared by the thread (B-2, B-5). Pure, Italian, deterministic. */

import { ROOMS, type RoomId } from "@/lib/rooms";
import { pick } from "./select";

/** «CUCINA · 1 ELEMENTO» above an opening (mockup). */
export function headerFor(room: RoomId, count: number): string {
  return `${ROOMS[room].label.toUpperCase()} · ${count} ${count === 1 ? "ELEMENTO" : "ELEMENTI"}`;
}

/** Calm line when nothing is pertinent: chosen by time of day and what is left today, never filler. */
export function quietLine(hour: number, eventsLeftToday: number, today: string): string {
  if (eventsLeftToday > 0) {
    return eventsLeftToday === 1 ? "Tutto in ordine: resta solo un impegno oggi." : `Tutto in ordine: restano ${eventsLeftToday} impegni oggi.`;
  }
  const family = hour < 12 ? ["Tutto in ordine per oggi.", "Una mattina tranquilla."] : hour < 18 ? ["Un po' di respiro.", "Niente che richieda attenzione."] : ["Una serata tranquilla.", "Tutto in ordine per stasera."];
  return pick(family, `quiet|${today}`).value;
}

/** First name for the vocative («Paolo»), never an email or a long string. */
export function firstName(displayName: string): string {
  const first = displayName.trim().split(/\s+/)[0] ?? "";
  return first.length <= 30 ? first : "";
}
