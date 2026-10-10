import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { deleteRecordAction, updateGoalAction } from "@/app/actions/domains";
import { ActionButton, ActionForm, CategoryField, Field, SelectField, SubmitButton, VisibilityField } from "@/components/forms";
import { Card, PageHeader, TextLink } from "@/components/ui";
import { formatItalianNumber } from "@/lib/goals";
import { requireExecutionContext } from "@/lib/households/context";
import { categoryOptions, listMyCategories } from "@/services/categories";
import { getGoal } from "@/services/goals";
import { listHabits } from "@/services/habits";

export const metadata: Metadata = { title: "Modifica obiettivo" };

const it = (n: number) => formatItalianNumber(n, false);

export default async function EditGoalPage({ params }: PageProps<"/abitudini/obiettivi/[id]">) {
  const { id } = await params;
  const ctx = await requireExecutionContext();
  const [goal, categories, habits] = await Promise.all([getGoal(ctx, id), listMyCategories(ctx), listHabits(ctx)]);
  if (!goal) notFound();
  const isOwner = goal.owner_user_id === ctx.user.id;

  return (
    <>
      <TextLink href="/abitudini#obiettivi">← Obiettivi</TextLink>
      <PageHeader title="Modifica obiettivo" />
      <Card className="p-4">
        <ActionForm action={updateGoalAction.bind(null, goal.id)} resetOnSuccess={false}>
          <input type="hidden" name="version" value={goal.version} />
          <Field label="Obiettivo" name="title" defaultValue={goal.title} required />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Punto di partenza" name="start_value" inputMode="decimal" defaultValue={it(goal.start_value)} />
            <Field label="Traguardo" name="target_value" inputMode="decimal" defaultValue={it(goal.target_value)} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Valore attuale" name="current_value" inputMode="decimal" defaultValue={it(goal.current_value)} />
            <Field label="Unità" name="unit" defaultValue={goal.unit} />
          </div>
          <Field label="Entro il" name="target_date" type="date" defaultValue={goal.target_date} />
          <SelectField
            label="Avanza con un'abitudine"
            name="habit_id"
            defaultValue={goal.habit_id ?? ""}
            options={[
              { value: "", label: "No, aggiorno io il valore" },
              ...habits.map((h) => ({ value: h.id, label: h.visibility === "private" ? `${h.title} (solo io)` : h.title })),
            ]}
          />
          {goal.habit_id ? <p className="text-sm text-muted">Collegato a un&apos;abitudine: partenza e valore attuale si aggiornano da soli.</p> : null}
          <CategoryField categories={categoryOptions(categories, goal.category)} defaultValue={goal.category_id} />
          {isOwner ? <VisibilityField defaultValue={goal.visibility} /> : <input type="hidden" name="visibility" value={goal.visibility} />}
          <SubmitButton>Salva</SubmitButton>
        </ActionForm>
      </Card>
      <p className="text-sm text-muted">
        Il traguardo può essere più alto o più basso del punto di partenza: per esempio da 85 a 70 kg.
      </p>
      <div className="flex justify-end">
        <ActionButton action={deleteRecordAction.bind(null, "goals", goal.id)} variant="danger" confirmLabel="Conferma eliminazione">
          Elimina obiettivo
        </ActionButton>
      </div>
    </>
  );
}
