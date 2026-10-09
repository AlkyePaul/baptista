import "server-only";

import { z } from "zod";
import { HEX_COLOR } from "@/lib/categories";
import type { Category, CategoryRef } from "@/lib/db/types";
import { DomainError, throwIfDbError } from "@/lib/errors";
import type { UserContext } from "@/lib/households/context";
import { requiredText, versionField } from "@/services/shared";

export const categorySchema = z.object({
  name: requiredText(40, "Dai un nome alla categoria."),
  color: z
    .string({ error: "Scegli un colore." })
    .regex(HEX_COLOR, "Scegli un colore.")
    .transform((c) => c.toLowerCase()),
});

export const updateCategorySchema = categorySchema.extend({ version: versionField });

/** Optional category field of habit/goal forms ("" = no category). */
export const categoryField = z
  .union([z.undefined(), z.uuid({ error: "Categoria non valida." })])
  .transform((v) => v ?? null);

/**
 * The caller's list: system categories first, then their own. Categories of other users are never
 * listed, even when visible through a shared record.
 */
export async function listMyCategories(ctx: UserContext): Promise<Category[]> {
  const { data, error } = await ctx.supabase
    .from("categories")
    .select("id, owner_user_id, name, color, version")
    .or(`owner_user_id.is.null,owner_user_id.eq.${ctx.user.id}`)
    .order("name")
    .limit(200);
  throwIfDbError(error);
  const rows = (data ?? []) as Category[];
  return [...rows.filter((c) => c.owner_user_id === null), ...rows.filter((c) => c.owner_user_id !== null)];
}

/**
 * Picker options for editing a record: the caller's list plus the record's current category when
 * it belongs to someone else, so saving without touching the picker never clears it silently.
 */
export function categoryOptions(mine: Category[], current: CategoryRef | null): CategoryRef[] {
  if (!current || mine.some((c) => c.id === current.id)) return mine;
  return [...mine, current];
}

export async function createCategory(ctx: UserContext, input: z.infer<typeof categorySchema>) {
  const { error } = await ctx.supabase.from("categories").insert(input);
  if (error?.code === "23505") throw new DomainError("category_exists");
  throwIfDbError(error);
}

export async function updateCategory(ctx: UserContext, id: string, input: z.infer<typeof updateCategorySchema>) {
  const { version, ...patch } = input;
  const { data, error } = await ctx.supabase
    .from("categories")
    .update(patch)
    .eq("id", id)
    .eq("owner_user_id", ctx.user.id)
    .eq("version", version)
    .select("id");
  if (error?.code === "23505") throw new DomainError("category_exists");
  throwIfDbError(error);
  if (!data?.length) throw new DomainError("conflict");
}

/** Records using it keep existing without category (FK on delete set null). */
export async function deleteCategory(ctx: UserContext, id: string) {
  const { data, error } = await ctx.supabase
    .from("categories")
    .delete()
    .eq("id", id)
    .eq("owner_user_id", ctx.user.id)
    .select("id");
  throwIfDbError(error);
  if (!data?.length) throw new DomainError("not_found");
}
