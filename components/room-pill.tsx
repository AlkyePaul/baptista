"use client";

import { usePathname, useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { selectRoomAction } from "@/app/actions/rooms";
import { Icon } from "@/components/icons";
import { cx } from "@/components/ui";
import { ROOM_IDS, ROOMS, roomForPath, type RoomId } from "@/lib/rooms";

/**
 * Room switcher available on every page (header). Picking a room opens its Home, where the room
 * dashboard and the room's bottom bar take over; the big tiles on Home stay the primary way.
 */
export function RoomPill({ selected }: { selected: RoomId }) {
  const pathname = usePathname();
  const router = useRouter();
  const details = useRef<HTMLDetailsElement>(null);
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useState<RoomId | null>(null);
  const current = optimistic ?? roomForPath(pathname) ?? selected;
  const room = ROOMS[current];

  function choose(id: RoomId) {
    if (details.current) details.current.open = false;
    setOptimistic(id);
    startTransition(async () => {
      await selectRoomAction(id);
      router.push("/");
      setOptimistic(null);
    });
  }

  return (
    <details ref={details} className="relative">
      <summary
        aria-label={`Stanza: ${room.label}. Cambia stanza`}
        className={cx(
          "room-tile-active flex min-h-10 cursor-pointer list-none items-center gap-1.5 rounded-full px-3 text-sm font-medium transition-opacity",
          pending && "opacity-60",
        )}
        data-room-tile={current}
      >
        <Icon name={room.icon} className="size-5" />
        {room.label}
        <span aria-hidden className="text-xs">
          ▾
        </span>
      </summary>
      <ul className="absolute left-1/2 z-30 mt-2 grid w-64 -translate-x-1/2 grid-cols-2 gap-2 rounded-2xl border border-border bg-surface p-2 shadow-lg">
        {ROOM_IDS.map((id) => (
          <li key={id}>
            <button
              type="button"
              onClick={() => choose(id)}
              aria-pressed={id === current}
              data-room-tile={id}
              className={cx(
                "flex min-h-16 w-full flex-col items-center justify-center gap-1 rounded-xl text-xs font-medium",
                id === current ? "room-tile-active" : "text-muted hover:bg-foreground/5",
              )}
            >
              <Icon name={ROOMS[id].icon} />
              {ROOMS[id].label}
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}
