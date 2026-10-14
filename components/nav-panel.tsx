"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/icons";
import { FavoriteStar } from "@/components/favorite-star";
import { cx } from "@/components/ui";
import { ROOM_IDS, ROOMS, type RoomId } from "@/lib/rooms";
import { featuresForRoom, type Feature } from "@/lib/features";

/**
 * Hierarchical navigation panel opened from the header room pill.
 * Shows all rooms with their subsections and favorite toggles.
 *
 * Interaction: clicking the room icon+label navigates to the room homepage;
 * clicking the chevron expands/collapses the subsection list.
 */
export function NavPanel({
  selected,
  favoritedIds,
  onClose,
  onChooseRoom,
}: {
  selected: RoomId;
  favoritedIds: Set<string>;
  onClose: () => void;
  onChooseRoom: (room: RoomId) => void;
}) {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState<RoomId | null>(selected);

  function toggleSubmenu(room: RoomId) {
    setExpanded((prev) => (prev === room ? null : room));
  }

  return (
    <nav aria-label="Esplora le sezioni" className="flex flex-col gap-1">
      {ROOM_IDS.map((roomId) => {
        const room = ROOMS[roomId];
        const features = featuresForRoom(roomId);
        const isExpanded = expanded === roomId;
        const isSelected = roomId === selected;

        return (
          <div key={roomId}>
            {/* Room header row: icon+label → navigate, chevron → expand */}
            <div
              data-room-tile={roomId}
              className={cx(
                "flex items-center rounded-xl transition-colors",
                isSelected ? "room-tile-active" : "bg-foreground/[0.04]",
              )}
            >
              {/* Room icon + label → navigates to room home */}
              <button
                type="button"
                onClick={() => onChooseRoom(roomId)}
                className="flex flex-1 items-center gap-2.5 rounded-l-xl px-3 py-2.5 text-sm font-medium transition-colors hover:bg-foreground/5"
              >
                <Icon name={room.icon} className="size-5 shrink-0" />
                <span className="flex-1 text-left">{room.label}</span>
              </button>

              {/* Chevron → toggles subsection list */}
              {features.length > 0 ? (
                <button
                  type="button"
                  onClick={() => toggleSubmenu(roomId)}
                  aria-expanded={isExpanded}
                  aria-label={`${isExpanded ? "Chiudi" : "Apri"} sezioni di ${room.label}`}
                  className="flex items-center justify-center rounded-r-xl px-3 py-2.5 transition-colors hover:bg-foreground/5"
                >
                  <svg
                    aria-hidden
                    viewBox="0 0 20 20"
                    className={cx("size-4 text-muted transition-transform duration-200", isExpanded && "rotate-90")}
                  >
                    <path d="M7 5l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              ) : null}
            </div>

            {/* Subsections */}
            {isExpanded && features.length > 0 ? (
              <ul className="baptista-appear mt-0.5 mb-1 ml-5 flex flex-col gap-0.5 border-l border-border pl-3">
                {features.map((feature) => (
                  <FeatureRow
                    key={feature.id}
                    feature={feature}
                    favorited={favoritedIds.has(feature.id)}
                    active={pathname.startsWith(feature.href)}
                    onNavigate={onClose}
                  />
                ))}
              </ul>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}

function FeatureRow({
  feature,
  favorited,
  active,
  onNavigate,
}: {
  feature: Feature;
  favorited: boolean;
  active: boolean;
  onNavigate: () => void;
}) {
  return (
    <li className="flex items-center gap-1">
      <Link
        href={feature.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={cx(
          "flex flex-1 items-center gap-2 rounded-lg px-2.5 py-2 text-sm transition-colors",
          active ? "font-medium text-accent" : "text-foreground hover:bg-foreground/5",
        )}
      >
        <Icon name={feature.icon} className="size-4 shrink-0" />
        {feature.label}
      </Link>
      {feature.canFavorite ? (
        <FavoriteStar featureId={feature.id} favorited={favorited} />
      ) : null}
    </li>
  );
}
