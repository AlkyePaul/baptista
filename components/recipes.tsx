import Link from "next/link";
import { createRecipeAction } from "@/app/actions/kitchen";
import { ActionForm, Field, SubmitButton, VisibilityField } from "@/components/forms";
import { Modal } from "@/components/modal";
import { buttonClass, cx, PrivateMark } from "@/components/ui";
import type { Recipe } from "@/lib/db/types";

/** Cookbook cards (D31): used on the Cucina home and in the Ricettario. */
export function RecipeGrid({ recipes }: { recipes: Array<Recipe & { ingredients: number }> }) {
  return (
    <ul className="grid grid-cols-2 gap-2">
      {recipes.map((r) => (
        <li key={r.id}>
          <Link href={`/stanze/cucina/ricette/${r.id}`} className="flex h-full min-h-24 flex-col gap-2 rounded-2xl border border-border bg-surface p-4">
            <span className="font-medium">{r.title}</span>
            <span className="mt-auto flex items-center gap-2 text-sm text-muted">
              {r.ingredients === 1 ? "1 ingrediente" : `${r.ingredients} ingredienti`}
              <PrivateMark visibility={r.visibility} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function NewRecipe() {
  return (
    <Modal trigger="+ Ricetta" title="Nuova ricetta" triggerClassName={cx(buttonClass.primary, "px-4")}>
      <ActionForm action={createRecipeAction}>
        <Field label="Nome della ricetta" name="title" placeholder="Es. Pasta alla carbonara" required />
        <Field label="Porzioni" name="servings" inputMode="numeric" hint="Facoltative" />
        <Field label="Preparazione" name="body" multiline hint="Passaggi, tempi, consigli. Gli ingredienti si aggiungono dopo, dagli alimenti di casa." />
        <VisibilityField />
        <SubmitButton>Crea e aggiungi gli ingredienti</SubmitButton>
      </ActionForm>
    </Modal>
  );
}
