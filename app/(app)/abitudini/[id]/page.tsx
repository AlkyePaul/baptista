import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { deleteRecordAction, updateHabitAction } from "@/app/actions/domains";
import { ActionButton, ActionForm, CategoryField, CheckboxField, Field, SelectField, SubmitButton, VisibilityField } from "@/components/forms";
import { Card, PageHeader, TextLink } from "@/components/ui";
import { requireExecutionContext } from "@/lib/households/context";
import { categoryOptions, listMyCategories } from "@/services/categories";
import { getHabit } from "@/services/habits";

export const metadata: Metadata = { title: "Modifica abitudine" };

const TARGET_OPTIONS = Array.from({ length: 7 }, (_, i) => ({
  value: String(i + 1),
  label: i === 6 ? "Ogni giorno" : `${i + 1} ${i === 0 ? "volta" : "volte"} a settimana`,
}));

export default async function EditHabitPage({ params }: PageProps<"/abitudini/[id]">) {
  const { id } = await params;
  const ctx = await requireExecutionContext();
  const [habit, categories] = await Promise.all([getHabit(ctx, id), listMyCategories(ctx)]);
  if (!habit) notFound();
  const isOwner = habit.owner_user_id === ctx.user.id;

  return (
    <>
      <TextLink href="/abitudini">← Abitudini</TextLink>
      <PageHeader title="Modifica abitudine" />
      <Card className="p-4">
        <ActionForm action={updateHabitAction.bind(null, habit.id)} resetOnSuccess={false}>
          <input type="hidden" name="version" value={habit.version} />
          <Field label="Abitudine" name="title" defaultValue={habit.title} required />
          <SelectField label="Quante volte" name="target_per_week" defaultValue={String(habit.target_per_week)} options={TARGET_OPTIONS} />
          <CheckboxField label="Attiva" name="active" defaultChecked={habit.active} />
          <CategoryField categories={categoryOptions(categories, habit.category)} defaultValue={habit.category_id} />
          {isOwner ? <VisibilityField defaultValue={habit.visibility} /> : <input type="hidden" name="visibility" value={habit.visibility} />}
          <SubmitButton>Salva</SubmitButton>
        </ActionForm>
      </Card>
      <p className="text-sm text-muted">
        Per una pausa temporanea togli la spunta da “Attiva”: le registrazioni restano. L&apos;eliminazione cancella anche lo storico.
      </p>
      <div className="flex justify-end">
        <ActionButton action={deleteRecordAction.bind(null, "habits", habit.id)} variant="danger" confirmLabel="Conferma eliminazione">
          Elimina abitudine
        </ActionButton>
      </div>
    </>
  );
}
