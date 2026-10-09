import Link from "next/link";
import { selectHouseholdAction } from "@/app/actions/households";
import { RoomPill } from "@/components/room-pill";
import { RoomShell } from "@/components/room-shell";
import { Avatar } from "@/components/ui";
import { requireExecutionContext } from "@/lib/households/context";
import { getCurrentRoom } from "@/lib/rooms-server";
import { getDirectory } from "@/services/households";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireExecutionContext();
  const [members, room] = await Promise.all([getDirectory(ctx), getCurrentRoom()]);
  const active = members.filter((m) => m.state === "active");

  return (
    <RoomShell selectedRoom={room}>
      <header className="sticky top-0 z-10 border-b border-border bg-background/90 pt-[env(safe-area-inset-top,0px)] backdrop-blur transition-colors duration-500">
        <div className="mx-auto flex max-w-md items-center justify-between gap-3 px-5 py-3">
          <Link href="/casa" className="flex min-h-11 items-center -space-x-2" aria-label={`Membri di ${ctx.household.name}`}>
            {active.slice(0, 3).map((m) => (
              <Avatar key={m.user_id} name={m.display_name} size="sm" />
            ))}
            {active.length > 3 ? <span className="pl-3 text-xs text-muted">+{active.length - 3}</span> : null}
          </Link>
          <RoomPill selected={room} />
          {ctx.memberships.length > 1 ? (
            <details className="relative">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 rounded-xl px-3 text-sm font-medium">
                {ctx.household.name}
                <span aria-hidden>▾</span>
              </summary>
              <ul className="absolute right-0 mt-1 w-56 rounded-xl border border-border bg-surface p-1 shadow-lg">
                {ctx.memberships.map((m) => (
                  <li key={m.household_id}>
                    <form action={selectHouseholdAction.bind(null, m.household_id)}>
                      <button
                        type="submit"
                        aria-current={m.household_id === ctx.household.id ? "true" : undefined}
                        className="flex min-h-11 w-full items-center rounded-lg px-3 text-left text-sm hover:bg-foreground/5 aria-[current]:font-semibold aria-[current]:text-accent"
                      >
                        {m.household.name}
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            </details>
          ) : (
            <Link href="/casa" className="min-h-11 max-w-28 content-center truncate text-sm font-medium text-muted">
              {ctx.household.name}
            </Link>
          )}
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-md flex-col gap-8 px-5 pt-6 pb-[calc(6rem+env(safe-area-inset-bottom,0px))]">
        {children}
      </main>
    </RoomShell>
  );
}
