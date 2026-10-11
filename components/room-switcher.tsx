"use client";

import { useLayoutEffect, useRef, useState, useTransition } from "react";
import { selectRoomAction } from "@/app/actions/rooms";
import { Icon } from "@/components/icons";
import { cx } from "@/components/ui";
import { orderedRooms, type RoomId } from "@/lib/rooms";

/**
 * Four room tiles in a row (inside the header panel of RoomPill). The selected room is emphasised
 * and always moves to the left; the reorder is animated (FLIP) and saved as a cookie preference.
 */
export function RoomSwitcher({ selected, onChoose }: { selected: RoomId; onChoose?: (room: RoomId) => void }) {
  const [current, setCurrent] = useState(selected);
  const [, startTransition] = useTransition();
  const tiles = useRef(new Map<RoomId, HTMLElement>());
  const before = useRef(new Map<RoomId, DOMRect>());

  // Keep in sync if the server value changes (e.g. another tab).
  const [prevSelected, setPrevSelected] = useState(selected);
  if (prevSelected !== selected) {
    setPrevSelected(selected);
    setCurrent(selected);
  }

  useLayoutEffect(() => {
    if (!before.current.size) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    for (const [id, el] of tiles.current) {
      const first = before.current.get(id);
      if (!first || reduce) continue;
      const last = el.getBoundingClientRect();
      const dx = first.left - last.left;
      const dy = first.top - last.top;
      if (!dx && !dy) continue;
      el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "translate(0, 0)" }], {
        duration: 420,
        easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
      });
    }
    before.current.clear();
  }, [current]);

  function choose(room: RoomId) {
    if (room === current) return;
    for (const [id, el] of tiles.current) before.current.set(id, el.getBoundingClientRect());
    setCurrent(room);
    if (onChoose) onChoose(room);
    else startTransition(() => selectRoomAction(room));
  }

  return (
    <nav aria-label="Stanze" className="grid grid-cols-4 gap-2">
      {orderedRooms(current).map((room) => {
        const active = room.id === current;
        return (
          <button
            key={room.id}
            ref={(el) => {
              if (el) tiles.current.set(room.id, el);
              else tiles.current.delete(room.id);
            }}
            type="button"
            onClick={() => choose(room.id)}
            aria-pressed={active}
            data-room-tile={room.id}
            className={cx(
              "flex aspect-square flex-col items-center justify-center gap-1.5 rounded-2xl border text-xs font-medium transition-[background-color,border-color,box-shadow,color] duration-300",
              active
                ? "room-tile-active border-transparent shadow-md"
                : "border-border bg-surface text-muted hover:text-foreground",
            )}
          >
            <Icon name={room.icon} className={active ? "size-8" : "size-6"} />
            <span>{room.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
