"use server";

import { revalidatePath } from "next/cache";
import { getUserContext } from "@/lib/households/context";
import { toActionState, type ActionState } from "@/lib/errors";
import { favoritableIds } from "@/lib/features";
import { toggleFavorite, updateFavoriteMode, reorderFavorites } from "@/services/favorites";
import type { DisplayMode } from "@/lib/features";

/** Toggle a feature as favorite. Used by the navigation star buttons. */
export async function toggleFavoriteAction(featureId: string): Promise<ActionState> {
  try {
    if (!favoritableIds().has(featureId)) return { ok: false, message: "Sezione non disponibile." };
    const ctx = await getUserContext();
    const result = await toggleFavorite(ctx, featureId);
    console.log("[favorites] toggle", featureId, "→", result ? "added" : "removed");
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (error) {
    console.error("[favorites] toggle failed:", error);
    return toActionState(error);
  }
}

/** Switch display mode (quick_link <-> widget). */
export async function updateFavoriteModeAction(featureId: string, mode: DisplayMode): Promise<ActionState> {
  try {
    const ctx = await getUserContext();
    await updateFavoriteMode(ctx, featureId, mode);
    revalidatePath("/");
    return { ok: true };
  } catch (error) {
    return toActionState(error);
  }
}

/** Reorder favorites: receives the full ordered list of feature_ids. */
export async function reorderFavoritesAction(orderedIds: string[]): Promise<ActionState> {
  try {
    const ctx = await getUserContext();
    await reorderFavorites(ctx, orderedIds);
    revalidatePath("/");
    return { ok: true };
  } catch (error) {
    return toActionState(error);
  }
}
