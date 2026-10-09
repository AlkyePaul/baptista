import "server-only";

import { cookies } from "next/headers";
import { DEFAULT_ROOM, isRoomId, ROOM_COOKIE, type RoomId } from "@/lib/rooms";

/** Current room from the cookie preference (invalid values fall back to the Soggiorno). */
export async function getCurrentRoom(): Promise<RoomId> {
  const value = (await cookies()).get(ROOM_COOKIE)?.value;
  return isRoomId(value) ? value : DEFAULT_ROOM;
}
