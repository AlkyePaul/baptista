import Link from "next/link";
import { after } from "next/server";
import { BaptistaAvatar } from "@/components/baptista/avatar";
import { Icon } from "@/components/icons";
import { RoomPill } from "@/components/room-pill";
import { RoomShell } from "@/components/room-shell";
import { Avatar } from "@/components/ui";
import { requireExecutionContext } from "@/lib/households/context";
import { getCurrentRoom } from "@/lib/rooms-server";
import { getDirectory, purgeDepartedData } from "@/services/households";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await requireExecutionContext();
  const [members, room] = await Promise.all([
    getDirectory(ctx),
    getCurrentRoom(),
  ]);
  const active = members.filter((m) => m.state === "active");
  // Lazy 30-day cleanup of former members' private data (once a day per household, in the DB).
  after(() => purgeDepartedData(ctx));

  return (
    <RoomShell selectedRoom={room}>
      {/* Mockup header: mascot + wordmark on the left; room, members and «+» on the right. */}
      <header className="sticky top-0 z-10 bg-white/90 pt-[env(safe-area-inset-top,0px)] backdrop-blur transition-colors duration-500">
        <div className="mx-auto flex max-w-md items-center justify-between gap-2 px-5 py-2">
          <Link
            href="/"
            aria-label="Baptista, vai alla Home"
            className="flex min-h-11 items-center gap-1.5"
          >
            <BaptistaAvatar expression="suggestion" enter={false} />
            <span className="text-2xl font-bold tracking-tight text-ink">
              baptista
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <RoomPill selected={room} />
            <Link
              href="/casa"
              className="flex min-h-11 items-center -space-x-2"
              aria-label={`${ctx.household.name}: membri e impostazioni`}
            >
              {active.slice(0, 3).map((m) => (
                <Avatar key={m.user_id} name={m.display_name} size="sm" />
              ))}
              {active.length > 3 ? (
                <span className="pl-3 text-xs text-muted">
                  +{active.length - 3}
                </span>
              ) : null}
            </Link>
            <Link
              href={ctx.role === "owner" ? "/casa#invita" : "/casa"}
              aria-label={
                ctx.role === "owner" ? "Invita un familiare" : "La tua casa"
              }
              className="flex size-11 items-center justify-center"
            >
              <span
                aria-hidden
                className="flex size-8 items-center justify-center rounded-full bg-highlight text-on-highlight"
              >
                <Icon name="add" className="size-5" />
              </span>
            </Link>
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-md flex-col gap-8 px-5 pt-6 pb-[calc(6rem+env(safe-area-inset-bottom,0px))]">
        {children}
      </main>
    </RoomShell>
  );
}
