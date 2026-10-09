import type { Metadata } from "next";
import Link from "next/link";
import { createFoodAction, createMealAction, createRecipeAction } from "@/app/actions/kitchen";
import { ActionForm, Field, SubmitButton, VisibilityField } from "@/components/forms";
import { FoodLookup } from "@/components/food-lookup";
import { FoodFields } from "@/components/kitchen";
import { Card, cx, EmptyState, PrivateMark, Section, TextLink } from "@/components/ui";
import { localDate } from "@/lib/dates";
import { formatItalianNumber } from "@/lib/goals";
import { requireExecutionContext, type ExecutionContext } from "@/lib/households/context";
import { mealTotals } from "@/lib/nutrition";
import { listPantry } from "@/services/food";
import { listMeals } from "@/services/meals";
import { listNotes } from "@/services/notes";

export const metadata: Metadata = { title: "Aggiungi in cucina" };

/** One module, three variants (like the Soggiorno «Aggiungi», D21/D25). */
const KINDS = [
  { id: "alimento", label: "Alimento", color: "#e0795b" },
  { id: "ricetta", label: "Ricetta", color: "#d9a33a" },
  { id: "pasto", label: "Pasto", color: "#3f9d8c" },
] as const;
type Kind = (typeof KINDS)[number]["id"];

export default async function KitchenAddPage({ searchParams }: PageProps<"/stanze/cucina/aggiungi">) {
  const ctx = await requireExecutionContext();
  const params = await searchParams;
  const kind: Kind = KINDS.find((k) => k.id === params.tipo)?.id ?? "alimento";
  const current = KINDS.find((k) => k.id === kind)!;

  return (
    <>
      <header className="flex flex-col gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">Aggiungi</h1>
        <nav aria-label="Tipo di elemento" className="grid grid-cols-3 gap-1 rounded-2xl border border-border bg-surface p-1">
          {KINDS.map((k) => (
            <Link
              key={k.id}
              href={`/stanze/cucina/aggiungi?tipo=${k.id}`}
              aria-current={k.id === kind ? "page" : undefined}
              scroll={false}
              className={cx(
                "flex min-h-11 items-center justify-center gap-1.5 rounded-xl text-sm font-medium transition-colors",
                k.id === kind ? "bg-foreground/[0.07] text-foreground" : "text-muted hover:text-foreground",
              )}
            >
              <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: k.color }} />
              {k.label}
            </Link>
          ))}
        </nav>
      </header>

      <Card className="p-4" style={{ borderTop: `3px solid ${current.color}` }}>
        <CreateForm kind={kind} ctx={ctx} />
      </Card>

      <Existing kind={kind} ctx={ctx} />
    </>
  );
}

function CreateForm({ kind, ctx }: { kind: Kind; ctx: ExecutionContext }) {
  switch (kind) {
    case "alimento":
      return (
        <ActionForm action={createFoodAction} successMessage key="alimento">
          <FoodLookup />
          <FoodFields today={localDate(new Date(), ctx.household.timezone)} />
          <VisibilityField />
          <SubmitButton>Aggiungi alla dispensa</SubmitButton>
        </ActionForm>
      );
    case "ricetta":
      return (
        <ActionForm action={createRecipeAction} key="ricetta">
          <Field label="Nome della ricetta" name="title" placeholder="Es. Pasta alla carbonara" required />
          <Field label="Ingredienti" name="items_text" multiline hint="Uno per riga, es. «200 g di guanciale». Diventano una lista da spuntare." />
          <Field label="Preparazione" name="body" multiline hint="Testo libero: passaggi, tempi, consigli." />
          <VisibilityField />
          <SubmitButton>Salva ricetta</SubmitButton>
        </ActionForm>
      );
    case "pasto":
      return (
        <ActionForm action={createMealAction} key="pasto">
          <p className="text-sm text-muted">
            Un pasto è una combinazione di alimenti con i grammi: calorie e macronutrienti si calcolano da soli. Dopo averlo creato aggiungi gli alimenti.
          </p>
          <Field label="Nome del pasto" name="title" placeholder="Es. Colazione classica" required />
          <Field label="Note" name="notes" multiline />
          <VisibilityField />
          <SubmitButton>Crea pasto</SubmitButton>
        </ActionForm>
      );
  }
}

async function Existing({ kind, ctx }: { kind: Kind; ctx: ExecutionContext }) {
  if (kind === "alimento") {
    const items = (await listPantry(ctx)).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 8);
    return (
      <Section title="Aggiunti di recente" action={<TextLink href="/stanze/cucina/dispensa">Dispensa</TextLink>}>
        {items.length ? (
          <Card>
            <ul className="divide-y divide-border">
              {items.map((item) => (
                <li key={item.id}>
                  <Link href={`/stanze/cucina/dispensa/${item.id}`} className="flex min-h-12 items-center justify-between gap-3 px-4">
                    <span>{item.product_name}</span>
                    <PrivateMark visibility={item.visibility} />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <EmptyState>La dispensa è vuota.</EmptyState>
        )}
      </Section>
    );
  }

  if (kind === "ricetta") {
    const recipes = await listNotes(ctx, 100, "recipe");
    return (
      <Section title="Ricette">
        {recipes.length ? (
          <ul className="grid grid-cols-2 gap-2">
            {recipes.map((r) => (
              <li key={r.id}>
                <Link href={`/stanze/cucina/ricette/${r.id}`} className="flex h-full min-h-24 flex-col gap-2 rounded-2xl border border-border bg-surface p-4">
                  <span className="font-medium">{r.title}</span>
                  <span className="mt-auto flex items-center gap-2 text-sm text-muted">
                    {r.items.length === 1 ? "1 ingrediente" : `${r.items.length} ingredienti`}
                    <PrivateMark visibility={r.visibility} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState>Nessuna ricetta ancora.</EmptyState>
        )}
      </Section>
    );
  }

  const meals = await listMeals(ctx);
  return (
    <Section title="Pasti salvati" action={<TextLink href="/stanze/cucina/dieta">Diario</TextLink>}>
      {meals.length ? (
        <ul className="grid grid-cols-2 gap-2">
          {meals.map((meal) => {
            const t = mealTotals(meal.items);
            return (
              <li key={meal.id}>
                <Link href={`/stanze/cucina/pasti/${meal.id}`} className="flex h-full min-h-24 flex-col gap-1 rounded-2xl border border-border bg-surface p-4">
                  <span className="font-medium">{meal.title}</span>
                  <span className="text-sm text-muted">
                    {meal.items.length === 1 ? "1 alimento" : `${meal.items.length} alimenti`}
                  </span>
                  <span className="mt-auto flex items-center gap-2 text-sm">
                    <span className="font-semibold">{formatItalianNumber(t.kcal)} kcal</span>
                    <PrivateMark visibility={meal.visibility} />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState>Nessun pasto salvato.</EmptyState>
      )}
    </Section>
  );
}
