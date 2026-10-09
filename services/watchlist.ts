import "server-only";

import { z } from "zod";
import { DomainError, throwIfDbError } from "@/lib/errors";
import type { WatchlistItem } from "@/lib/db/types";
import type { UserContext } from "@/lib/households/context";
import { optionalText } from "@/services/shared";

/** Personal list (per user, every household), shown with TradingView widgets (D26). */
export const MAX_WATCHLIST = 30;

export const watchlistSchema = z.object({
  symbol: z
    .string({ error: "Scrivi il simbolo." })
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9][A-Z0-9._!:-]{0,39}$/, "Simbolo non valido. Esempi: NASDAQ:AAPL, MIL:ENI, XETR:VWCE."),
  label: optionalText(60),
});

export async function listWatchlist(ctx: UserContext): Promise<WatchlistItem[]> {
  const { data, error } = await ctx.supabase
    .from("watchlist_items")
    .select("id, symbol, label, position")
    .eq("owner_user_id", ctx.user.id)
    .order("position")
    .order("created_at")
    .limit(MAX_WATCHLIST);
  throwIfDbError(error);
  return (data ?? []) as WatchlistItem[];
}

export async function addToWatchlist(ctx: UserContext, input: z.infer<typeof watchlistSchema>) {
  const current = await listWatchlist(ctx);
  if (current.length >= MAX_WATCHLIST) throw new DomainError("limit_reached");
  const { error } = await ctx.supabase.from("watchlist_items").insert({ ...input, position: current.length });
  throwIfDbError(error);
}

export async function removeFromWatchlist(ctx: UserContext, id: string) {
  const { data, error } = await ctx.supabase.from("watchlist_items").delete().eq("id", id).eq("owner_user_id", ctx.user.id).select("id");
  throwIfDbError(error);
  if (!data?.length) throw new DomainError("not_found");
}

/** Moves an item one step up or down by swapping positions with its neighbour. */
export async function moveInWatchlist(ctx: UserContext, id: string, direction: -1 | 1) {
  const items = await listWatchlist(ctx);
  const index = items.findIndex((i) => i.id === id);
  const other = items[index + direction];
  if (index < 0 || !other) return;
  const updates = items.map((item, i) => ({ id: item.id, position: i === index ? index + direction : i === index + direction ? index : i }));
  for (const u of updates) {
    const { error } = await ctx.supabase.from("watchlist_items").update({ position: u.position }).eq("id", u.id).eq("owner_user_id", ctx.user.id);
    throwIfDbError(error);
  }
}
