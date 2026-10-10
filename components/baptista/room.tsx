import type { ExecutionContext } from "@/lib/households/context";
import type { RoomId } from "@/lib/rooms";
import { loadThread } from "@/services/baptista";
import { BaptistaThread } from "./thread";

/**
 * Compact Baptista at the top of a room page (B-6): only that room's conversations, the question
 * born from a gesture appears where the user is. Nothing is rendered when nothing is pertinent.
 */
export async function BaptistaRoom({ ctx, room }: { ctx: ExecutionContext; room: RoomId }) {
  const thread = await loadThread(ctx, { room });
  if (!thread.active) return null;
  return <BaptistaThread thread={thread} timeZone={ctx.household.timezone} compact />;
}
