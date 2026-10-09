import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { deleteRecordAction, updateEventAction } from "@/app/actions/domains";
import { ActionButton, ActionForm, EventTimeFields, Field, SubmitButton, VisibilityField } from "@/components/forms";
import { Card, PageHeader, TextLink } from "@/components/ui";
import type { CalendarEvent } from "@/lib/db/types";
import { addDays, toLocalInput } from "@/lib/dates";
import { requireExecutionContext } from "@/lib/households/context";
import { getRecord } from "@/services/shared";

export const metadata: Metadata = { title: "Modifica evento" };

export default async function EditEventPage({ params }: PageProps<"/calendario/[id]">) {
  const { id } = await params;
  const ctx = await requireExecutionContext();
  const event = await getRecord<CalendarEvent>(ctx, "calendar_events", id);
  if (!event) notFound();
  const tz = ctx.household.timezone;
  const isOwner = event.owner_user_id === ctx.user.id;

  return (
    <>
      <TextLink href="/calendario">← Calendario</TextLink>
      <PageHeader title="Modifica evento" />
      <Card className="p-4">
        <ActionForm action={updateEventAction.bind(null, event.id)} resetOnSuccess={false}>
          <input type="hidden" name="version" value={event.version} />
          <Field label="Titolo" name="title" defaultValue={event.title} required />
          <EventTimeFields
            defaultAllDay={event.all_day}
            defaults={
              event.all_day
                ? { start_date: event.start_date!, end_date: addDays(event.end_date!, -1) }
                : {
                    starts_at: toLocalInput(new Date(event.starts_at!), tz),
                    ends_at: toLocalInput(new Date(event.ends_at!), tz),
                  }
            }
          />
          <Field label="Note" name="description" defaultValue={event.description} multiline />
          {isOwner ? <VisibilityField defaultValue={event.visibility} /> : <input type="hidden" name="visibility" value={event.visibility} />}
          <SubmitButton>Salva</SubmitButton>
        </ActionForm>
      </Card>
      <div className="flex justify-end">
        <ActionButton
          action={deleteRecordAction.bind(null, "calendar_events", event.id)}
          variant="danger"
          confirmLabel="Conferma eliminazione"
        >
          Elimina evento
        </ActionButton>
      </div>
    </>
  );
}
