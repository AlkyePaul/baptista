import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { deleteKitchenRecordAction, updatePantryItemAction } from "@/app/actions/kitchen";
import { ActionButton, ActionForm, SubmitButton, VisibilityField } from "@/components/forms";
import { PantryItemFields } from "@/components/kitchen";
import { Badge, Card, PageHeader, TextLink } from "@/components/ui";
import type { FoodItem } from "@/lib/db/types";
import { formatDay, localDate } from "@/lib/dates";
import { foodLine, STATUS_LABELS } from "@/lib/food";
import { requireExecutionContext } from "@/lib/households/context";
import { getRecord } from "@/services/shared";

export const metadata: Metadata = { title: "In dispensa" };

/** One package in the house: quantity, place and dates; name and nutrition live in the catalog. */
export default async function PantryItemPage({ params }: PageProps<"/stanze/cucina/dispensa/[id]">) {
  const { id } = await params;
  const ctx = await requireExecutionContext();
  const item = await getRecord<FoodItem>(ctx, "food_items", id);
  if (!item) notFound();
  const today = localDate(new Date(), ctx.household.timezone);
  const isOwner = item.owner_user_id === ctx.user.id;
  const kcal = item.kcal_100g === null ? null : Number(item.kcal_100g);

  return (
    <>
      <TextLink href="/stanze/cucina/dispensa">← Dispensa</TextLink>
      <PageHeader
        title={item.product_name}
        subtitle={item.opened_on ? `Aperto ${formatDay(item.opened_on)}` : undefined}
        action={<Badge>{STATUS_LABELS[item.status]}</Badge>}
      />
      <Card className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
        <span className="text-muted">{foodLine({ brand: item.brand, category: item.category, kcal_100g: kcal })}</span>
        <TextLink href={`/stanze/cucina/alimenti/${item.food_id}`}>Alimento</TextLink>
      </Card>
      <Card className="p-4">
        <ActionForm action={updatePantryItemAction.bind(null, item.id)} resetOnSuccess={false}>
          <input type="hidden" name="version" value={item.version} />
          <PantryItemFields item={item} today={today} />
          {isOwner ? <VisibilityField defaultValue={item.visibility} /> : <input type="hidden" name="visibility" value={item.visibility} />}
          <SubmitButton>Salva</SubmitButton>
        </ActionForm>
      </Card>
      <div className="flex justify-end">
        <ActionButton action={deleteKitchenRecordAction.bind(null, "food_items", item.id)} variant="danger" confirmLabel="Conferma eliminazione">
          Elimina
        </ActionButton>
      </div>
    </>
  );
}
