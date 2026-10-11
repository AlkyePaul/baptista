import type { Metadata } from "next";
import { NewRecipe, RecipeGrid } from "@/components/recipes";
import { EmptyState, PageHeader } from "@/components/ui";
import { requireExecutionContext } from "@/lib/households/context";
import { listRecipes } from "@/services/recipes";

export const metadata: Metadata = { title: "Ricettario" };

/** The family cookbook (D31): read and write the house recipes. */
export default async function CookbookPage() {
  const ctx = await requireExecutionContext();
  const recipes = await listRecipes(ctx);
  return (
    <>
      <PageHeader title="Ricettario" subtitle="Le ricette di casa" action={<NewRecipe />} />
      {recipes.length ? <RecipeGrid recipes={recipes} /> : <EmptyState>Il ricettario è vuoto: scrivi la prima ricetta di famiglia.</EmptyState>}
    </>
  );
}
