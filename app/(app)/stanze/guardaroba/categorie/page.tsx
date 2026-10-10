import type { Metadata } from "next";
import Link from "next/link";
import { Card, EmptyState, Section } from "@/components/ui";
import { Swatch } from "@/components/wardrobe";
import { localDate } from "@/lib/dates";
import { requireExecutionContext } from "@/lib/households/context";
import { CLOTHING_TYPES, COLORS, SEASONS, seasonOf } from "@/lib/wardrobe";
import { listWardrobe } from "@/services/wardrobe";

export const metadata: Metadata = { title: "Categorie del guardaroba" };

/** Overview: how many clothes per type, season and colour; each row opens the filtered grid. */
export default async function WardrobeCategoriesPage() {
  const ctx = await requireExecutionContext();
  const items = await listWardrobe(ctx);
  const current = seasonOf(localDate(new Date(), ctx.household.timezone));
  const count = (pred: (i: (typeof items)[number]) => boolean) => items.filter(pred).length;

  const rows = (list: Array<{ key: string; label: string; n: number; href: string; color?: string }>) => (
    <Card>
      <ul className="divide-y divide-border">
        {list.map((r) => (
          <li key={r.key}>
            <Link href={r.href} className="flex min-h-12 items-center gap-3 px-4">
              {r.color ? <Swatch color={r.color} /> : null}
              <span className="flex-1">{r.label}</span>
              <span className="text-sm text-muted tabular-nums">{r.n}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );

  if (!items.length) {
    return (
      <>
        <h1 className="text-3xl font-semibold tracking-tight">Categorie</h1>
        <EmptyState>Aggiungi qualche capo per vedere il riepilogo.</EmptyState>
      </>
    );
  }

  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">Categorie</h1>
        <p className="text-muted">{items.length} capi attivi</p>
      </header>

      <Section title="Per tipo">
        {rows(
          CLOTHING_TYPES.map((t) => ({ key: t.id, label: t.label, n: count((i) => i.type === t.id), href: `/stanze/guardaroba/capi?tipo=${t.id}` })).filter(
            (r) => r.n > 0,
          ),
        )}
      </Section>

      <Section title="Per stagione">
        {rows(
          SEASONS.map((s) => ({
            key: s.id,
            label: s.id === current ? `${s.label} (adesso)` : s.label,
            n: count((i) => i.seasons.includes(s.id)),
            href: `/stanze/guardaroba/capi?stagione=${s.id}`,
          })),
        )}
        <p className="text-xs text-muted">{count((i) => i.seasons.length === 0)} capi senza stagione indicata.</p>
      </Section>

      <Section title="Per colore principale">
        {rows(
          COLORS.map((c) => ({ key: c.id, label: c.label, color: c.id, n: count((i) => i.primary_color === c.id), href: `/stanze/guardaroba/capi?colore=${c.id}` })).filter(
            (r) => r.n > 0,
          ),
        )}
      </Section>
    </>
  );
}
