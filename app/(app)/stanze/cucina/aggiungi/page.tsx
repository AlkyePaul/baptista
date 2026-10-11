import type { Metadata } from "next";
import Link from "next/link";
import { Card, EmptyState, Section } from "@/components/ui";
import { AddFoodForm } from "@/components/kitchen-add";
import { localDate } from "@/lib/dates";
import { foodLine } from "@/lib/food";
import { requireExecutionContext } from "@/lib/households/context";
import { listCatalog } from "@/services/catalog";

export const metadata: Metadata = { title: "Aggiungi alimento" };

/**
 * Cucina → Aggiungi adds a food and nothing else (D31): picked from the household catalog, from
 * Open Food Facts or created new, then into the pantry or onto the list. Recipes live in the
 * cookbook, meals in the diary.
 */
export default async function KitchenAddPage() {
  const ctx = await requireExecutionContext();
  const foods = await listCatalog(ctx);

  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">Aggiungi alimento</h1>
        <p className="text-muted">Cercalo tra gli alimenti di casa o su Open Food Facts, oppure crealo.</p>
      </header>

      <Card className="p-4">
        <AddFoodForm today={localDate(new Date(), ctx.household.timezone)} />
      </Card>

      <Section title={`Alimenti di casa (${foods.length})`}>
        {foods.length ? (
          <Card>
            <ul className="divide-y divide-border">
              {foods.map((f) => (
                <li key={f.id}>
                  <Link href={`/stanze/cucina/alimenti/${f.id}`} className="flex min-h-12 flex-col justify-center px-4 py-2">
                    <span className="flex items-center gap-2">
                      {f.name}
                      {f.staple ? <span className="text-xs text-[#b98a26]">★</span> : null}
                    </span>
                    <span className="text-xs text-muted">{foodLine(f)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ) : (
          <EmptyState>Ancora nessun alimento: il primo che aggiungi entra qui e sarà pronto per dispensa, lista, ricette e pasti.</EmptyState>
        )}
      </Section>
    </>
  );
}
