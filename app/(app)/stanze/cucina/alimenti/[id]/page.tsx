import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { deleteCatalogFoodAction, setStapleAction, updateCatalogFoodAction } from "@/app/actions/catalog";
import { ActionButton, ActionForm, Field, SelectField, SubmitButton } from "@/components/forms";
import { NutritionFields } from "@/components/kitchen";
import { Card, PageHeader, TextLink } from "@/components/ui";
import { FOOD_CATEGORIES, STORAGES } from "@/lib/food";
import { requireExecutionContext } from "@/lib/households/context";
import { getFood } from "@/services/catalog";

export const metadata: Metadata = { title: "Alimento di casa" };

/** A catalog food (D31): edits reach the items still in the house and the open list rows. */
export default async function CatalogFoodPage({ params }: PageProps<"/stanze/cucina/alimenti/[id]">) {
  const { id } = await params;
  const ctx = await requireExecutionContext();
  const food = await getFood(ctx, id);
  if (!food) notFound();

  return (
    <>
      <TextLink href="/stanze/cucina/aggiungi">← Alimenti di casa</TextLink>
      <PageHeader title={food.name} subtitle={food.brand ?? undefined} />

      <Card className="flex items-center justify-between gap-3 px-4 py-3">
        <span className="text-sm">
          {food.staple ? "★ Prodotto abituale: ti avviso quando manca." : food.staple === false ? "Non è un prodotto abituale (scelta tua)." : "Lo compri spesso?"}
        </span>
        <ActionButton action={setStapleAction.bind(null, food.id, !food.staple)} variant="secondary" className="min-h-10 px-3 text-sm">
          {food.staple ? "Togli abituale" : "☆ Abituale"}
        </ActionButton>
      </Card>

      <Card className="p-4">
        <ActionForm action={updateCatalogFoodAction.bind(null, food.id)} resetOnSuccess={false} successMessage>
          <input type="hidden" name="version" value={food.version} />
          <Field label="Nome" name="name" defaultValue={food.name} required />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Marca" name="brand" defaultValue={food.brand} hint="Facoltativa" />
            <Field label="Codice a barre" name="barcode" inputMode="numeric" defaultValue={food.barcode} hint="Facoltativo" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <SelectField label="Categoria" name="category" defaultValue={food.category} options={FOOD_CATEGORIES.map((c) => ({ value: c.id, label: c.label }))} />
            <SelectField label="Di solito va in" name="default_storage" defaultValue={food.default_storage} options={STORAGES.map((s) => ({ value: s.id, label: s.label }))} />
          </div>
          <NutritionFields defaults={food} />
          <SubmitButton>Salva</SubmitButton>
        </ActionForm>
      </Card>
      {food.nutrition_source === "openfoodfacts" ? (
        <p className="text-xs text-muted">Valori nutrizionali da Open Food Facts (ODbL), verificali sulla confezione. Modificandoli diventano tuoi.</p>
      ) : null}
      <div className="flex justify-end">
        <ActionButton action={deleteCatalogFoodAction.bind(null, food.id)} variant="danger" confirmLabel="Conferma eliminazione">
          Elimina dagli alimenti
        </ActionButton>
      </div>
    </>
  );
}
