import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { addItemAction, clearDoneItemsAction } from "@/app/actions/domains";
import { addIngredientsAction } from "@/app/actions/shopping";
import { ChecklistRows } from "@/components/checklist";
import { ListAccordion } from "@/components/list-accordion";
import { missingIngredients, nameKey } from "@/lib/shopping";
import { listPantry } from "@/services/food";
import { listShopping } from "@/services/shopping";
import { deleteKitchenRecordAction, updateRecipeAction } from "@/app/actions/kitchen";
import { ActionButton, ActionForm, Field, SubmitButton, VisibilityField } from "@/components/forms";
import { Card, EmptyState, PageHeader, Section, TextLink } from "@/components/ui";
import type { Note } from "@/lib/db/types";
import { requireExecutionContext } from "@/lib/households/context";
import { MAX_ITEMS } from "@/services/notes";
import { getRecord } from "@/services/shared";

export const metadata: Metadata = { title: "Ricetta" };

/** A recipe = ingredient checklist + free text (D25), stored as a note of kind "recipe". */
export default async function RecipePage({ params }: PageProps<"/stanze/cucina/ricette/[id]">) {
  const { id } = await params;
  const ctx = await requireExecutionContext();
  const recipe = await getRecord<Note>(ctx, "notes", id);
  if (!recipe || recipe.kind !== "recipe") notFound();
  const isOwner = recipe.owner_user_id === ctx.user.id;
  const done = recipe.items.filter((i) => i.done).length;
  const [pantry, shoppingItems] = await Promise.all([listPantry(ctx), listShopping(ctx)]);
  const missing = missingIngredients(recipe.items.map((i) => i.text), pantry.map((f) => f.product_name));
  const onList = new Set(shoppingItems.map((i) => i.name_key));

  return (
    <>
      <TextLink href="/stanze/cucina/aggiungi?tipo=ricetta">← Ricette</TextLink>
      <PageHeader title={recipe.title} subtitle={recipe.items.length ? `${recipe.items.length} ingredienti` : undefined} />

      <ListAccordion id={`recipe:${recipe.id}`} title="Ingredienti" count={recipe.items.length}>
        <ChecklistRows note={recipe} doneLabel="spuntato" />
        {recipe.items.length < MAX_ITEMS ? (
          <div className="border-t border-border p-3">
            <ActionForm action={addItemAction.bind(null, recipe.id)} className="flex-row items-end">
              <input type="hidden" name="version" value={recipe.version} />
              <Field label="Aggiungi ingrediente" name="text" placeholder="Es. 2 uova" className="flex-1" />
              <SubmitButton pendingLabel="…">Aggiungi</SubmitButton>
            </ActionForm>
          </div>
        ) : null}
        {done > 0 ? (
          <div className="flex justify-end border-t border-border px-2 py-1">
            <ActionButton action={clearDoneItemsAction.bind(null, recipe.id, recipe.version)}>Rimuovi spuntati</ActionButton>
          </div>
        ) : null}
      </ListAccordion>

      {recipe.items.length ? (
        <Section title="Cosa manca?">
          {missing.length ? (
            <Card className="p-4">
              <ActionForm action={addIngredientsAction}>
                <p className="text-sm text-muted">
                  {missing.length === 1 ? "Non trovo in dispensa questo ingrediente." : `Non trovo in dispensa ${missing.length} ingredienti.`} Il
                  confronto è per nome: spunta solo quelli che ti servono davvero.
                </p>
                <ul className="flex flex-col">
                  {missing.map((name) => (
                    <li key={name}>
                      <label className="flex min-h-11 cursor-pointer items-center gap-3">
                        <input type="checkbox" name="ingredient" value={name} className="size-5 accent-[var(--accent)]" />
                        <span>{name}</span>
                        {onList.has(nameKey(name)) ? <span className="text-xs text-muted">già in lista</span> : null}
                      </label>
                    </li>
                  ))}
                </ul>
                <SubmitButton variant="secondary">Aggiungi alla lista</SubmitButton>
              </ActionForm>
            </Card>
          ) : (
            <EmptyState>Sembra che in dispensa ci sia tutto.</EmptyState>
          )}
        </Section>
      ) : null}

      <Section title="Preparazione">
        <Card className="p-4">
          <ActionForm action={updateRecipeAction.bind(null, recipe.id)} resetOnSuccess={false} successMessage>
            <input type="hidden" name="version" value={recipe.version} />
            <Field label="Nome" name="title" defaultValue={recipe.title} required />
            <Field label="Preparazione" name="body" defaultValue={recipe.body} multiline />
            {isOwner ? <VisibilityField defaultValue={recipe.visibility} /> : <input type="hidden" name="visibility" value={recipe.visibility} />}
            <SubmitButton>Salva</SubmitButton>
          </ActionForm>
        </Card>
      </Section>

      <div className="flex justify-end">
        <ActionButton action={deleteKitchenRecordAction.bind(null, "notes", recipe.id)} variant="danger" confirmLabel="Conferma eliminazione">
          Elimina ricetta
        </ActionButton>
      </div>
    </>
  );
}
