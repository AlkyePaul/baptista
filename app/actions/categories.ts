"use server";

import { run } from "@/lib/actions";
import type { ActionState } from "@/lib/errors";
import { getUserContext } from "@/lib/households/context";
import { uuidSchema } from "@/lib/households/permissions";
import * as categories from "@/services/categories";
import { parseForm } from "@/services/shared";

export async function createCategoryAction(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(categories.categorySchema, formData);
  if (!parsed.ok) return parsed.state;
  const ctx = await getUserContext();
  return run(() => categories.createCategory(ctx, parsed.data), "Categoria creata.");
}

export async function updateCategoryAction(categoryId: string, _: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = parseForm(categories.updateCategorySchema, formData);
  if (!parsed.ok) return parsed.state;
  const ctx = await getUserContext();
  return run(() => categories.updateCategory(ctx, uuidSchema.parse(categoryId), parsed.data), "Salvato.");
}

export async function deleteCategoryAction(categoryId: string): Promise<ActionState> {
  const ctx = await getUserContext();
  return run(() => categories.deleteCategory(ctx, uuidSchema.parse(categoryId)));
}
