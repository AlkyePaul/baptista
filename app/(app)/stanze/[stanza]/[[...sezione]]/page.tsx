import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { Icon } from "@/components/icons";
import { Card, TextLink } from "@/components/ui";
import { isRoomId, ROOMS } from "@/lib/rooms";

export const metadata: Metadata = { title: "Stanza" };

/**
 * Rooms with real pages own static routes (/stanze/cucina/dispensa…); anything else under them
 * (the bare room URL, the retired «Scadenze» or «Scontrini» sections) opens the room's first page.
 * Guardaroba is still a placeholder.
 */
export default async function RoomSectionPage({ params }: PageProps<"/stanze/[stanza]/[[...sezione]]">) {
  const { stanza, sezione } = await params;
  if (!isRoomId(stanza) || stanza === "soggiorno") notFound();
  const room = ROOMS[stanza];
  if (room.available) redirect(room.nav[0].href);
  const section = room.nav.find((item) => item.href.endsWith(`/${sezione?.[0] ?? ""}`));

  return (
    <Card className="flex flex-col items-center gap-3 px-6 py-10 text-center">
      <span className="room-tile-active flex size-16 items-center justify-center rounded-2xl" data-room-tile={room.id}>
        <Icon name={section?.icon ?? room.icon} className="size-9" />
      </span>
      <h1 className="text-2xl font-semibold">
        {room.label}
        {section ? ` · ${section.label}` : ""}
      </h1>
      <p className="text-muted">{room.description}.</p>
      <p className="text-sm text-muted">Questa stanza è in arrivo nella prossima fase.</p>
      <TextLink href="/">Torna alla Home</TextLink>
    </Card>
  );
}
