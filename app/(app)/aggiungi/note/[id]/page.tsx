import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  addItemAction,
  clearDoneItemsAction,
  deleteRecordAction,
  removeItemAction,
  toggleItemAction,
  updateNoteAction,
} from "@/app/actions/domains";
import { ActionButton, ActionForm, Field, SubmitButton, VisibilityField } from "@/components/forms";
import { Card, EmptyState, PageHeader, TextLink } from "@/components/ui";
import type { Note } from "@/lib/db/types";
import { requireExecutionContext } from "@/lib/households/context";
import { MAX_ITEMS } from "@/services/notes";
import { getRecord } from "@/services/shared";

export const metadata: Metadata = { title: "Nota" };

export default async function NotePage({ params }: PageProps<"/aggiungi/note/[id]">) {
  const { id } = await params;
  const ctx = await requireExecutionContext();
  const note = await getRecord<Note>(ctx, "notes", id);
  if (!note) notFound();
  const isOwner = note.owner_user_id === ctx.user.id;
  const doneCount = note.items.filter((i) => i.done).length;

  return (
    <>
      <TextLink href={`/aggiungi?tipo=${note.kind === "list" ? "lista" : "nota"}`}>{note.kind === "list" ? "← Liste" : "← Note"}</TextLink>
      <PageHeader title={note.title} subtitle={note.kind === "list" ? `${doneCount} di ${note.items.length} completati` : undefined} />

      {note.kind === "list" ? (
        <>
          {note.items.length ? (
            <Card>
              <ul className="divide-y divide-border">
                {note.items.map((item) => (
                  <li key={item.id} className="flex items-center gap-2 px-2 py-1">
                    <ActionButton
                      action={toggleItemAction.bind(null, note.id, note.version, item.id)}
                      label={item.done ? `Segna come da fare: ${item.text}` : `Segna come fatto: ${item.text}`}
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
                    <ActionButton
                      action={removeItemAction.bind(null, note.id, note.version, item.id)}
                      label={`Rimuovi: ${item.text}`}
                      className="size-11 px-0"
                    >
                      <span aria-hidden>×</span>
                    </ActionButton>
                  </li>
                ))}
              </ul>
            </Card>
          ) : (
            <EmptyState>La lista è vuota.</EmptyState>
          )}
          {note.items.length < MAX_ITEMS ? (
            <ActionForm action={addItemAction.bind(null, note.id)} className="flex-row items-end">
              <input type="hidden" name="version" value={note.version} />
              <Field label="Aggiungi" name="text" placeholder="Es. Latte" className="flex-1" />
              <SubmitButton pendingLabel="…">Aggiungi</SubmitButton>
            </ActionForm>
          ) : null}
          {doneCount > 0 ? (
            <div className="flex justify-end">
              <ActionButton action={clearDoneItemsAction.bind(null, note.id, note.version)}>
                Rimuovi completati
              </ActionButton>
            </div>
          ) : null}
        </>
      ) : null}

      <details className="rounded-2xl border border-border bg-surface" open={note.kind === "note"}>
        <summary className="flex min-h-14 cursor-pointer items-center px-4 font-medium">
          {note.kind === "note" ? "Testo" : "Dettagli"}
        </summary>
        <div className="border-t border-border p-4">
          <ActionForm action={updateNoteAction.bind(null, note.id)} resetOnSuccess={false} successMessage>
            <input type="hidden" name="version" value={note.version} />
            <Field label="Titolo" name="title" defaultValue={note.title} required />
            <Field label={note.kind === "note" ? "Testo" : "Descrizione"} name="body" defaultValue={note.body} multiline />
            {isOwner ? <VisibilityField defaultValue={note.visibility} /> : <input type="hidden" name="visibility" value={note.visibility} />}
            <SubmitButton>Salva</SubmitButton>
          </ActionForm>
        </div>
      </details>

      <div className="flex justify-end">
        <ActionButton action={deleteRecordAction.bind(null, "notes", note.id)} variant="danger" confirmLabel="Conferma eliminazione">
          Elimina
        </ActionButton>
      </div>
    </>
  );
}
