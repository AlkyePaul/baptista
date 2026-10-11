"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { selectRoomAction } from "@/app/actions/rooms";
import { Icon } from "@/components/icons";
import { RoomSwitcher } from "@/components/room-switcher";
import { cx } from "@/components/ui";
import { ROOMS, roomForPath, type RoomId } from "@/lib/rooms";

/**
 * The only room switcher (user 2026-10-11): a pill in the header opens a full-width panel with all
 * rooms on one line; the chosen one moves to the left, then its Home opens.
 */
export function RoomPill({ selected }: { selected: RoomId }) {
  const pathname = usePathname();
  const router = useRouter();
  const pill = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [top, setTop] = useState(64);
  const [pending, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useState<RoomId | null>(null);
  const current = optimistic ?? roomForPath(pathname) ?? selected;
  const room = ROOMS[current];

  useEffect(() => {
    if (!open) return;
    const close = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);

  function toggle() {
    const header = pill.current?.closest("header");
    if (header) setTop(header.getBoundingClientRect().bottom);
    setOpen((v) => !v);
  }

  function choose(id: RoomId) {
    setOptimistic(id);
    startTransition(async () => {
      await selectRoomAction(id);
      // Let the tile reach the left before the panel closes (the move is the confirmation).
      await new Promise((r) => setTimeout(r, 380));
      setOpen(false);
      router.push("/");
      setOptimistic(null);
    });
  }

  return (
    <>
      <button
        ref={pill}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-label={`Stanza: ${room.label}. Cambia stanza`}
        data-room-tile={current}
        className={cx(
          "room-tile-active flex min-h-10 items-center gap-1.5 rounded-full pr-2.5 pl-3 text-sm font-medium shadow-sm transition-opacity",
          pending && "opacity-60",
        )}
      >
        <Icon name={room.icon} className="size-5" />
        <span className="max-w-24 truncate">{room.label}</span>
        <svg aria-hidden viewBox="0 0 20 20" className={cx("size-4 transition-transform", open && "rotate-180")}>
          <path d="M5 7.5l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open ? (
        <>
          <button type="button" aria-label="Chiudi" onClick={() => setOpen(false)} className="fixed inset-0 z-30 cursor-default bg-foreground/10" style={{ top }} />
          <div className="baptista-appear fixed inset-x-0 z-40 border-b border-border bg-surface/95 shadow-lg backdrop-blur" style={{ top }}>
            <div className="mx-auto max-w-md px-5 py-4">
              <RoomSwitcher selected={current} onChoose={choose} />
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
