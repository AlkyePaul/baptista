import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { addItemAction, clearDoneItemsAction, deleteRecordAction, updateNoteAction } from "@/app/actions/domains";
import { ChecklistRows } from "@/components/checklist";
import { ListAccordion } from "@/components/list-accordion";
import { ActionButton, ActionForm, Field, SubmitButton, VisibilityField } from "@/components/forms";
import { PageHeader, TextLink } from "@/components/ui";
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
          <ListAccordion id={`note:${note.id}`} title="Elementi" count={note.items.length - doneCount}>
            <ChecklistRows note={note} />
          </ListAccordion>
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
