import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { addItemAction, clearDoneItemsAction, removeItemAction, toggleItemAction } from "@/app/actions/domains";
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

  return (
    <>
      <TextLink href="/stanze/cucina/aggiungi?tipo=ricetta">← Ricette</TextLink>
      <PageHeader title={recipe.title} subtitle={recipe.items.length ? `${recipe.items.length} ingredienti` : undefined} />

      <Section title="Ingredienti">
        {recipe.items.length ? (
          <Card>
            <ul className="divide-y divide-border">
              {recipe.items.map((item) => (
                <li key={item.id} className="flex items-center gap-2 px-2 py-1">
                  <ActionButton
                    action={toggleItemAction.bind(null, recipe.id, recipe.version, item.id)}
                    label={item.done ? `Togli la spunta: ${item.text}` : `Spunta: ${item.text}`}
                    className="size-11 px-0"
                  >
                    {item.done ? (
                      <span aria-hidden className="inline-flex size-5 items-center justify-center rounded-md bg-accent text-xs text-on-accent">
                        ✓
                      </span>
                    ) : (
                      <span aria-hidden className="inline-block size-5 rounded-md border-2 border-border" />
                    )}
                  </ActionButton>
                  <span className={item.done ? "flex-1 text-muted line-through" : "flex-1"}>{item.text}</span>
                  <ActionButton action={removeItemAction.bind(null, recipe.id, recipe.version, item.id)} label={`Rimuovi: ${item.text}`} className="size-11 px-0">
                    <span aria-hidden>×</span>
                  </ActionButton>
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <EmptyState>Nessun ingrediente.</EmptyState>
        )}
        {recipe.items.length < MAX_ITEMS ? (
          <ActionForm action={addItemAction.bind(null, recipe.id)} className="flex-row items-end">
            <input type="hidden" name="version" value={recipe.version} />
            <Field label="Aggiungi ingrediente" name="text" placeholder="Es. 2 uova" className="flex-1" />
            <SubmitButton pendingLabel="…">Aggiungi</SubmitButton>
          </ActionForm>
        ) : null}
        {done > 0 ? (
          <div className="flex justify-end">
            <ActionButton action={clearDoneItemsAction.bind(null, recipe.id, recipe.version)}>Rimuovi spuntati</ActionButton>
          </div>
        ) : null}
      </Section>

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
