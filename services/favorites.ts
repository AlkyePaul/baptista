import "server-only";

import type { UserFavorite } from "@/lib/db/types";
import { favoritableIds, getFeature, type DisplayMode } from "@/lib/features";
import type { UserContext } from "@/lib/households/context";
import { DomainError, throwIfDbError } from "@/lib/errors";

/** True if the error means the table does not exist yet (migration not applied). */
function isTableMissing(error: { code?: string } | null): boolean {
  return error?.code === "PGRST205" || error?.code === "42P01";
}

/** All favorites for the authenticated user, sorted by sort_order then created_at. */
export async function listFavorites(ctx: UserContext): Promise<UserFavorite[]> {
  const { data, error } = await ctx.supabase
    .from("user_favorites")
    .select("*")
    .eq("user_id", ctx.user.id)
    .order("sort_order")
    .order("created_at");
  if (isTableMissing(error)) return [];
  throwIfDbError(error);
  // Filter out stale favorites whose feature_id is no longer in the registry.
  const valid = favoritableIds();
  return ((data ?? []) as UserFavorite[]).filter((f) => valid.has(f.feature_id));
}

/** Toggle: add if absent, remove if present. Returns the new favorited state. */
export async function toggleFavorite(ctx: UserContext, featureId: string): Promise<boolean> {
  if (!favoritableIds().has(featureId)) throw new Error("Feature non disponibile.");

  console.log("[favorites] toggleFavorite", featureId, "user:", ctx.user.id);

  // Check if it exists.
  const { data: existing, error: findError } = await ctx.supabase
    .from("user_favorites")
    .select("id")
    .eq("user_id", ctx.user.id)
    .eq("feature_id", featureId)
    .maybeSingle();

  console.log("[favorites] find result:", { existing, findError: findError?.code ?? null });

  if (isTableMissing(findError)) {
    throw new DomainError("unknown", "La tabella preferiti non è ancora disponibile. Applica la migration.");
  }
  if (findError && findError.code !== "PGRST116") throwIfDbError(findError);

  if (existing) {
    const { error } = await ctx.supabase
      .from("user_favorites")
      .delete()
      .eq("id", existing.id);
    console.log("[favorites] delete result:", error?.code ?? "ok");
    throwIfDbError(error);
    return false;
  }

  // Insert with next sort_order.
  const { data: maxRow } = await ctx.supabase
    .from("user_favorites")
    .select("sort_order")
    .eq("user_id", ctx.user.id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextOrder = (maxRow?.sort_order ?? -1) + 1;

  const feature = getFeature(featureId);
  const mode: DisplayMode = feature?.canWidget ? "widget" : "quick_link";

  const { error } = await ctx.supabase.from("user_favorites").insert({
    user_id: ctx.user.id,
    feature_id: featureId,
    display_mode: mode,
    sort_order: nextOrder,
  });
  console.log("[favorites] insert result:", error?.code ?? "ok", error?.message ?? "");
  throwIfDbError(error);
  return true;
}

/** Update the display mode for an existing favorite. */
export async function updateFavoriteMode(
  ctx: UserContext,
  featureId: string,
  mode: DisplayMode,
): Promise<void> {
  const { error } = await ctx.supabase
    .from("user_favorites")
    .update({ display_mode: mode, updated_at: new Date().toISOString() })
    .eq("user_id", ctx.user.id)
    .eq("feature_id", featureId);
  if (isTableMissing(error)) return;
  throwIfDbError(error);
}

/** Reorder favorites: receives an ordered array of feature_ids. */
export async function reorderFavorites(ctx: UserContext, orderedIds: string[]): Promise<void> {
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await ctx.supabase
      .from("user_favorites")
      .update({ sort_order: i, updated_at: new Date().toISOString() })
      .eq("user_id", ctx.user.id)
      .eq("feature_id", orderedIds[i]);
    if (isTableMissing(error)) return;
    throwIfDbError(error);
  }
}

/** Set of feature_ids the current user has favorited (for navigation star state). */
export async function favoritedSet(ctx: UserContext): Promise<Set<string>> {
  const { data, error } = await ctx.supabase
    .from("user_favorites")
    .select("feature_id")
    .eq("user_id", ctx.user.id);
  if (isTableMissing(error)) return new Set();
  throwIfDbError(error);
  return new Set((data ?? []).map((r: { feature_id: string }) => r.feature_id));
}
