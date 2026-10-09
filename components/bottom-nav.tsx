"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/icons";
import { cx } from "@/components/ui";
import type { NavItem, RoomId } from "@/lib/rooms";

const HOME: NavItem = { href: "/", label: "Home", icon: "home" };
const ASSISTANT: NavItem = { href: "/baptista", label: "Baptista", icon: "assistant" };

/**
 * Home and Baptista are fixed; the three middle items belong to the current room. When the room
 * changes, the middle group is re-mounted (keyed by room) and slides in, so the swap is visible
 * instead of three labels silently changing under the thumb. The active room item gets a pill in
 * the room colour.
 */
export function BottomNav({ room, roomItems }: { room: RoomId; roomItems: NavItem[] }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  return (
    <nav
      aria-label="Navigazione principale"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom,0px)] backdrop-blur"
    >
      <ul className="mx-auto grid max-w-md grid-cols-5">
        <NavLink item={HOME} active={isActive(HOME.href)} />
        <li className="col-span-3" key={room}>
          <ul className="nav-swap grid grid-cols-3" data-room-tile={room}>
            {roomItems.map((item) => (
              <NavLink key={item.href} item={item} active={isActive(item.href)} roomTinted />
            ))}
          </ul>
        </li>
        <NavLink item={ASSISTANT} active={isActive(ASSISTANT.href)} />
      </ul>
    </nav>
  );
}

function NavLink({ item, active, roomTinted }: { item: NavItem; active: boolean; roomTinted?: boolean }) {
  return (
    <li>
      <Link
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cx(
          "relative flex min-h-16 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors",
          active ? (roomTinted ? "text-[var(--tile-fg)]" : "text-accent") : "text-muted",
        )}
      >
        {active && roomTinted ? <span aria-hidden className="room-tile-active absolute top-1.5 h-8 w-14 rounded-full" /> : null}
        <span className="relative">
          <Icon name={item.icon} />
        </span>
        <span className="relative">{item.label}</span>
      </Link>
    </li>
  );
}
