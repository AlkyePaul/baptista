import type { Metadata } from "next";
import Link from "next/link";
import { setFoodStatusAction } from "@/app/actions/kitchen";
import { ActionButton } from "@/components/forms";
import { ExpiryBadge, FoodQuickActions } from "@/components/kitchen";
import { Badge, buttonClass, Card, cx, EmptyState, PrivateMark, Section } from "@/components/ui";
import type { FoodItem } from "@/lib/db/types";
import { localDate } from "@/lib/dates";
import { compareByExpiry, expiryState, STATUS_LABELS, STORAGES, UNITS, label } from "@/lib/food";
import { formatItalianNumber } from "@/lib/goals";
import { requireExecutionContext } from "@/lib/households/context";
import { knownFoods, listPantry, listRecentlyClosed } from "@/services/food";
import { shoppingView } from "@/services/shopping";
import { ShoppingList } from "@/components/shopping-list";
import { BaptistaRoom } from "@/components/baptista/room";
import { nameKey } from "@/lib/shopping";

export const metadata: Metadata = { title: "Dispensa" };

const FILTERS = [{ id: "tutto", label: "Tutto" }, ...STORAGES.map((s) => ({ id: s.id, label: s.label }))] as const;

/** Inventory with expiries merged in (D25): what needs attention first, then by place. */
export default async function PantryPage({ searchParams }: PageProps<"/stanze/cucina/dispensa">) {
  const ctx = await requireExecutionContext();
  const params = await searchParams;
  const filter = FILTERS.find((f) => f.id === params.dove)?.id ?? "tutto";
  const today = localDate(new Date(), ctx.household.timezone);
  const [all, closed, known] = await Promise.all([listPantry(ctx), listRecentlyClosed(ctx), knownFoods(ctx)]);
  const list = await shoppingView(ctx, all);
  const staples = new Set(list.staples);
  const items = (filter === "tutto" ? all : all.filter((i) => i.storage === filter)).sort(compareByExpiry);
  const attention = items.filter((i) => ["expired", "today", "soon"].includes(expiryState(i, today)));
  const rest = items.filter((i) => !attention.includes(i));

  return (
    <>
      <header className="flex flex-col gap-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Dispensa</h1>
            <p className="text-muted">
              {all.length === 1 ? "1 alimento in casa" : `${all.length} alimenti in casa`}
            </p>
          </div>
          <Link href="/stanze/cucina/aggiungi?tipo=alimento" className={cx(buttonClass.primary, "px-4")}>
            + Alimento
          </Link>
        </div>
        <nav aria-label="Dove" className="grid grid-cols-4 gap-1 rounded-2xl border border-border bg-surface p-1">
          {FILTERS.map((f) => {
            const count = f.id === "tutto" ? all.length : all.filter((i) => i.storage === f.id).length;
            return (
              <Link
                key={f.id}
                href={f.id === "tutto" ? "/stanze/cucina/dispensa" : `/stanze/cucina/dispensa?dove=${f.id}`}
                aria-current={f.id === filter ? "page" : undefined}
                scroll={false}
                className={cx(
                  "flex min-h-11 items-center justify-center gap-1 rounded-xl text-sm font-medium transition-colors",
                  f.id === filter ? "bg-foreground/[0.07] text-foreground" : "text-muted hover:text-foreground",
                )}
              >
                {f.label}
                <span className="text-xs text-muted">{count}</span>
              </Link>
            );
          })}
        </nav>
      </header>

      <BaptistaRoom ctx={ctx} room="cucina" />

      <ShoppingList items={list.items} inPantry={list.inPantry} staples={list.staples} known={known} />

      {attention.length ? (
        <Section title="Da controllare">
          <FoodList items={attention} today={today} showPlace={filter === "tutto"} staples={staples} />
        </Section>
      ) : null}

      <Section title={attention.length ? "Il resto" : "In casa"}>
        {rest.length ? (
          <FoodList items={rest} today={today} showPlace={filter === "tutto"} staples={staples} />
        ) : (
          <EmptyState>{items.length ? "Tutto il resto è qui sopra." : "Niente qui. Aggiungi quello che hai comprato."}</EmptyState>
        )}
      </Section>

      {closed.length ? (
        <details className="rounded-2xl border border-border bg-surface">
          <summary className="flex min-h-12 cursor-pointer items-center px-4 text-sm font-medium text-muted">
            Finiti o buttati di recente ({closed.length})
          </summary>
          <ul className="divide-y divide-border border-t border-border">
            {closed.map((item) => (
              <li key={item.id} className="flex items-center gap-2 px-4 py-2">
                <span className="flex-1 text-muted line-through">{item.product_name}</span>
                <Badge>{STATUS_LABELS[item.status]}</Badge>
                <ActionButton action={setFoodStatusAction.bind(null, item.id, item.version, "available")} label={`Rimetti in dispensa: ${item.product_name}`} className="min-h-10 px-2 text-xs">
                  Ripristina
                </ActionButton>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </>
  );
}

function FoodList({ items, today, showPlace, staples }: { items: FoodItem[]; today: string; showPlace: boolean; staples: Set<string> }) {
  return (
    <Card>
      <ul className="divide-y divide-border">
        {items.map((item) => (
          <li key={item.id} className="flex flex-col gap-1 px-4 py-3">
            <Link href={`/stanze/cucina/dispensa/${item.id}`} className="flex min-h-11 items-start justify-between gap-3">
              <span className="flex flex-col">
                <span className="font-medium">{item.product_name}</span>
                <span className="text-sm text-muted">
                  {formatItalianNumber(item.quantity)} {label(UNITS, item.unit)}
                  {showPlace ? ` · ${label(STORAGES, item.storage)}` : ""}
                  {item.kcal_100g !== null ? ` · ${formatItalianNumber(item.kcal_100g)} kcal/100 g` : ""}
                </span>
              </span>
              <span className="flex shrink-0 flex-wrap justify-end gap-1">
                {item.status === "opened" ? <Badge>Aperto</Badge> : null}
                <ExpiryBadge item={item} today={today} />
                <PrivateMark visibility={item.visibility} />
              </span>
            </Link>
            <div className="-mx-2 flex justify-end">
              <FoodQuickActions item={item} starred={staples.has(nameKey(item.product_name))} />
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
