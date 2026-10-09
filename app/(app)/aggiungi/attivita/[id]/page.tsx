import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { deleteRecordAction, updateTaskAction } from "@/app/actions/domains";
import { ActionButton, ActionForm, Field, SubmitButton, VisibilityField } from "@/components/forms";
import { Card, PageHeader, TextLink } from "@/components/ui";
import type { Task } from "@/lib/db/types";
import { requireExecutionContext } from "@/lib/households/context";
import { getRecord } from "@/services/shared";

export const metadata: Metadata = { title: "Modifica attività" };

export default async function EditTaskPage({ params }: PageProps<"/aggiungi/attivita/[id]">) {
  const { id } = await params;
  const ctx = await requireExecutionContext();
  const task = await getRecord<Task>(ctx, "tasks", id);
  if (!task) notFound();
  const isOwner = task.owner_user_id === ctx.user.id;

  return (
    <>
      <TextLink href="/aggiungi?tipo=attivita">← Da fare</TextLink>
      <PageHeader title="Modifica attività" />
      <Card className="p-4">
        <ActionForm action={updateTaskAction.bind(null, task.id)} resetOnSuccess={false}>
          <input type="hidden" name="version" value={task.version} />
          <Field label="Attività" name="title" defaultValue={task.title} required />
          <Field label="Scadenza" name="due_date" type="date" defaultValue={task.due_date} hint="Lascia vuoto per nessuna scadenza." />
          <Field label="Note" name="notes" defaultValue={task.notes} multiline />
          {isOwner ? <VisibilityField defaultValue={task.visibility} /> : <input type="hidden" name="visibility" value={task.visibility} />}
          <SubmitButton>Salva</SubmitButton>
        </ActionForm>
      </Card>
      <div className="flex justify-end">
        <ActionButton action={deleteRecordAction.bind(null, "tasks", task.id)} variant="danger" confirmLabel="Conferma eliminazione">
          Elimina attività
        </ActionButton>
      </div>
    </>
  );
}
