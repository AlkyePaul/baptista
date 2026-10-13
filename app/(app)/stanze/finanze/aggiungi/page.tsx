import type { Metadata } from "next";
import Link from "next/link";
import { createExpenseAction, createFinanceGoalAction, setBudgetAction } from "@/app/actions/finance";
import { ExpenseFields } from "@/components/finance";
import { ActionForm, Field, SelectField, SubmitButton, VisibilityField } from "@/components/forms";
import { PhotoPicker } from "@/components/photo-picker";
import { Card, cx } from "@/components/ui";
import { localDate } from "@/lib/dates";
import { requireExecutionContext } from "@/lib/households/context";
import { CURRENCIES } from "@/lib/money";
import { listExpenseCategories, listFinanceGoals } from "@/services/finance";

export const metadata: Metadata = { title: "Aggiungi in Finanze" };

/** One place to add in Finanze (user 2026-10-11): an expense, a monthly budget or a project. */
const KINDS = [
  { id: "spesa", label: "Spesa", color: "#3f9d8c" },
  { id: "budget", label: "Budget", color: "#4f8fd6" },
  { id: "progetto", label: "Progetto", color: "#7a6fd0" },
] as const;
type Kind = (typeof KINDS)[number]["id"];

const RECEIPT_HINT = "Resta privato come la spesa: lo vede solo chi può vedere la spesa. Per ora è solo allegato, non viene letto.";

export default async function FinanceAddPage({ searchParams }: PageProps<"/stanze/finanze/aggiungi">) {
  const ctx = await requireExecutionContext();
  const params = await searchParams;
  const kind: Kind = KINDS.find((k) => k.id === params.tipo)?.id ?? "spesa";
  const current = KINDS.find((k) => k.id === kind)!;
  const [categories, goals] = await Promise.all([listExpenseCategories(ctx), listFinanceGoals(ctx)]);
  const today = localDate(new Date(), ctx.household.timezone);

  return (
    <>
      <header className="flex flex-col gap-4">
        <h1 className="text-3xl font-semibold tracking-tight">Aggiungi</h1>
        <nav aria-label="Cosa aggiungere" className="grid grid-cols-3 gap-1 rounded-2xl border border-border bg-surface p-1">
          {KINDS.map((k) => (
            <Link
              key={k.id}
              href={`/stanze/finanze/aggiungi?tipo=${k.id}`}
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
        {kind === "spesa" ? (
          <ActionForm action={createExpenseAction} successMessage key="spesa">
            <ExpenseFields categories={categories} goals={goals} today={today} />
            <PhotoPicker name="receipt" label="Scontrino (facoltativo)" alt="Anteprima dello scontrino" hint={RECEIPT_HINT} tall />
            <SubmitButton pendingLabel="Salvo la spesa…">Salva spesa</SubmitButton>
          </ActionForm>
        ) : kind === "budget" ? (
          <ActionForm action={setBudgetAction} successMessage key="budget">
            <SelectField
              label="Per"
              name="category_id"
              options={[{ value: "", label: "Tutte le spese (totale)" }, ...categories.map((c) => ({ value: c.id, label: c.name }))]}
            />
            <div className="grid grid-cols-[1fr_6.5rem] gap-3">
              <Field label="Importo al mese" name="monthly_amount" inputMode="decimal" placeholder="Es. 400" />
              <SelectField label="Valuta" name="currency" defaultValue="EUR" options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
            </div>
            <p className="text-xs text-muted">Se esiste già un budget per questa voce viene aggiornato. È condiviso con la casa.</p>
            <SubmitButton>Salva budget</SubmitButton>
          </ActionForm>
        ) : (
          <ActionForm action={createFinanceGoalAction} key="progetto">
            <Field label="Progetto" name="title" placeholder="Es. Vacanza in Puglia" required />
            <div className="grid grid-cols-[1fr_6.5rem] gap-3">
              <Field label="Entro il" name="target_date" type="date" hint="Facoltativo" />
              <SelectField label="Valuta" name="currency" defaultValue="EUR" options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
            </div>
            <Field label="Preventivo" name="estimate_lines" multiline hint="Una voce per riga con l'importo alla fine, es. «Volo 300», «Hotel 1.250». Potrai cambiarlo nel tempo." />
            <VisibilityField />
            <SubmitButton>Crea progetto</SubmitButton>
          </ActionForm>
        )}
      </Card>
    </>
  );
}
