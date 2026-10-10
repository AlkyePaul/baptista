import type { Metadata } from "next";
import { createWardrobeItemAction } from "@/app/actions/wardrobe";
import { ActionForm, SubmitButton } from "@/components/forms";
import { PhotoPicker } from "@/components/photo-picker";
import { Card } from "@/components/ui";
import { WardrobeFields } from "@/components/wardrobe";
import { requireExecutionContext } from "@/lib/households/context";
import { uuidSchema } from "@/lib/households/permissions";
import { formatDay } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { getLinkedExpense } from "@/services/wardrobe";

export const metadata: Metadata = { title: "Aggiungi capo" };

/** Photo + manual classification (D28). Automatic recognition arrives with Phase 05. */
export default async function AddClothingPage({ searchParams }: PageProps<"/stanze/guardaroba/aggiungi">) {
  const ctx = await requireExecutionContext();
  const params = await searchParams;
  // C5: the item is born from a clothing expense (read through RLS; unknown ids are ignored).
  const expense = typeof params.spesa === "string" ? await getLinkedExpense(ctx, uuidSchema.safeParse(params.spesa).success ? params.spesa : null) : null;
  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">Aggiungi capo</h1>
        <p className="text-muted">Una foto e poche informazioni: tipo, colore, stagioni.</p>
      </header>
      <Card className="p-4">
        <ActionForm action={createWardrobeItemAction} resetOnSuccess={false}>
          {expense ? (
            <p className="rounded-xl bg-accent/10 px-3 py-2 text-sm">
              Dalla spesa del {formatDay(expense.occurred_on)} · {formatMoney(expense.total, expense.currency)}: il capo sarà segnato come acquistato.
              <input type="hidden" name="expense_id" value={expense.id} />
            </p>
          ) : null}
          <PhotoPicker />
          <WardrobeFields />
          <SubmitButton pendingLabel="Carico la foto…">Salva capo</SubmitButton>
        </ActionForm>
      </Card>
    </>
  );
}
