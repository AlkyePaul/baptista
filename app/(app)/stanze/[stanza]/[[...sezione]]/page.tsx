import { notFound, redirect } from "next/navigation";
import { isRoomId, ROOMS } from "@/lib/rooms";

/** A bare room URL (/stanze/cucina) opens the room's first page; anything else does not exist. */
export default async function RoomSectionPage({ params }: PageProps<"/stanze/[stanza]/[[...sezione]]">) {
  const { stanza, sezione } = await params;
  if (!isRoomId(stanza) || stanza === "soggiorno" || sezione?.length) notFound();
  redirect(ROOMS[stanza].nav[0].href);
}
