"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { isRoomId, ROOM_COOKIE } from "@/lib/rooms";

const COOKIE_OPTIONS = { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 } as const;

/** Room choice is a per-device UI preference, not an authorization input. */
export async function selectRoomAction(room: string) {
  if (!isRoomId(room)) return;
  (await cookies()).set(ROOM_COOKIE, room, COOKIE_OPTIONS);
  revalidatePath("/", "layout");
}

/**
 * Remembers the room of the page being visited (e.g. a deep link to the Dispensa), so Home opens
 * on the same room next time. No revalidation: the client shell already shows that room.
 */
export async function rememberRoomAction(room: string) {
  if (!isRoomId(room)) return;
  (await cookies()).set(ROOM_COOKIE, room, COOKIE_OPTIONS);
}
