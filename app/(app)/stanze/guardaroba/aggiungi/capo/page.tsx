import type { Metadata } from "next";
import { Card, TextLink } from "@/components/ui";
import { WardrobeAddForm } from "@/components/wardrobe-add-form";
import { requireExecutionContext } from "@/lib/households/context";
import { uuidSchema } from "@/lib/households/permissions";
import { CLOTHING_TYPES } from "@/lib/wardrobe";
import { formatDay } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { getLinkedExpense } from "@/services/wardrobe";

export const metadata: Metadata = { title: "Aggiungi capo" };

export default async function AddClothingItemPage({ searchParams }: PageProps<"/stanze/guardaroba/aggiungi/capo">) {
  const ctx = await requireExecutionContext();
  const params = await searchParams;

  const tipo = typeof params.tipo === "string" ? params.tipo : "other";
  const typeLabel = CLOTHING_TYPES.find((t) => t.id === tipo)?.label ?? "Altro";

  // C5: the item is born from a clothing expense.
  const spesa = typeof params.spesa === "string" && uuidSchema.safeParse(params.spesa).success ? params.spesa : null;
  const expense = spesa ? await getLinkedExpense(ctx, spesa) : null;
  const expenseInfo = expense
    ? `Dalla spesa del ${formatDay(expense.occurred_on)} · ${formatMoney(expense.total, expense.currency)}: il capo sarà segnato come acquistato.`
    : null;

  return (
    <>
      <TextLink href="/stanze/guardaroba/aggiungi">← Categoria</TextLink>
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">{typeLabel}</h1>
        <p className="text-muted">Una foto e poche informazioni.</p>
      </header>
      <Card className="p-4">
        <WardrobeAddForm type={tipo} expenseId={spesa} expenseInfo={expenseInfo} />
      </Card>
    </>
  );
}
