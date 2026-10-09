"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { rememberRoomAction } from "@/app/actions/rooms";
import { BottomNav } from "@/components/bottom-nav";
import { ROOMS, roomForPath, type RoomId } from "@/lib/rooms";

/**
 * Applies the room tint and the room's navigation. A room-owned page (e.g. /calendario) always
 * shows its own room and becomes the remembered room; shared pages (Home, Casa, Baptista) keep
 * the last room, so the bottom bar never jumps back to a stale one after a soft navigation
 * (the layout is not re-rendered on client navigations).
 */
export function RoomShell({ selectedRoom, children }: { selectedRoom: RoomId; children: ReactNode }) {
  const pathname = usePathname();
  const pathRoom = roomForPath(pathname);
  const [lastRoom, setLastRoom] = useState(selectedRoom);

  // The server value wins when it changes (room tiles on Home, another tab).
  const [prevSelected, setPrevSelected] = useState(selectedRoom);
  if (prevSelected !== selectedRoom) {
    setPrevSelected(selectedRoom);
    setLastRoom(selectedRoom);
  }
  if (pathRoom && pathRoom !== lastRoom) setLastRoom(pathRoom);

  useEffect(() => {
    if (pathRoom && pathRoom !== selectedRoom) void rememberRoomAction(pathRoom);
  }, [pathRoom, selectedRoom]);

  const room = pathRoom ?? lastRoom;
  return (
    <div data-room={room} className="min-h-dvh bg-background transition-colors duration-500">
      {children}
      <BottomNav room={room} roomItems={ROOMS[room].nav} />
    </div>
  );
}
