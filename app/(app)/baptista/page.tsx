import type { Metadata } from "next";
import Link from "next/link";
import { BaptistaAvatar } from "@/components/baptista/avatar";
import { Conversation } from "@/components/baptista/conversation";
import { cx, EmptyState, PageHeader, Section } from "@/components/ui";
import { categorySentence, spendingComparison } from "@/lib/baptista/calculations";
import { addDays, addMonths, formatTime, localDate, monthOf, relativeDay } from "@/lib/dates";
import { compareByExpiry, effectiveExpiry } from "@/lib/food";
import { requireExecutionContext, type ExecutionContext } from "@/lib/households/context";
import { loadOpen, loadRecent } from "@/services/baptista";
import { listExpenseCategories, listMonthExpenses } from "@/services/finance";
import { listPantry } from "@/services/food";
import { getHabitWeeks, listHabits } from "@/services/habits";

export const metadata: Metadata = { title: "Baptista" };

/** Predefined questions (no free text): an exact calculation, then a sentence from a template. */
const CALCULATIONS = [
  { id: "alimentari", label: "Quanto abbiamo speso in alimentari questo mese?" },
  { id: "mese", label: "Stiamo spendendo più o meno del mese scorso?" },
  { id: "scadenze", label: "Cosa scade questa settimana?" },
  { id: "abitudini", label: "Come vanno le abitudini questa settimana?" },
] as const;

async function calculate(ctx: ExecutionContext, id: string): Promise<string | null> {
  const today = localDate(new Date(), ctx.household.timezone);
  const month = monthOf(today);
  switch (id) {
    case "alimentari": {
      const [rows, categories] = await Promise.all([listMonthExpenses(ctx, month), listExpenseCategories(ctx)]);
      const food = categories.find((c) => c.name.toLowerCase() === "spesa alimentare");
      return food ? categorySentence(rows, food.id, food.name) : "Non trovo la categoria «Spesa alimentare».";
    }
    case "mese": {
      const previousMonth = addMonths(month, -1);
      const [current, previous] = await Promise.all([listMonthExpenses(ctx, month), listMonthExpenses(ctx, previousMonth)]);
      return spendingComparison(current, previous, today, previousMonth);
    }
    case "scadenze": {
      const until = addDays(today, 7);
      const soon = (await listPantry(ctx))
        .filter((f) => {
          const e = effectiveExpiry(f);
          return e !== null && e.date <= until;
        })
        .sort(compareByExpiry);
      if (!soon.length) return "Niente in scadenza nei prossimi 7 giorni.";
      const parts = soon.slice(0, 8).map((f) => {
        const e = effectiveExpiry(f)!;
        return `${f.product_name} (${e.estimated ? "stima, " : ""}${relativeDay(e.date, today)})`;
      });
      return `In scadenza entro 7 giorni: ${parts.join(", ")}${soon.length > 8 ? ` e altri ${soon.length - 8}` : ""}.`;
    }
    case "abitudini": {
      const weeks = await getHabitWeeks(ctx, await listHabits(ctx, { activeOnly: true }), today);
      if (!weeks.length) return "Non ci sono abitudini attive.";
      const done = weeks.filter((w) => w.count >= w.habit.target_per_week).length;
      const list = weeks.map((w) => `${w.habit.title} ${w.count}/${w.habit.target_per_week}`).join(", ");
      return `Questa settimana: ${list}. ${done === weeks.length ? "Tutte a posto. Impeccabile." : done ? `${done} su ${weeks.length} già fatte.` : "Ancora nessuna completa: c'è tempo."}`;
    }
    default:
      return null;
  }
}

/** Baptista tab (B-6): what is open, what was done, calculations on request. No text input. */
export default async function BaptistaPage({ searchParams }: PageProps<"/baptista">) {
  const ctx = await requireExecutionContext();
  const params = await searchParams;
  const chosen = CALCULATIONS.find((c) => c.id === params.calcolo) ?? null;
  const [open, recent, answer] = await Promise.all([loadOpen(ctx), loadRecent(ctx), chosen ? calculate(ctx, chosen.id) : Promise.resolve(null)]);
  const tz = ctx.household.timezone;
  const today = localDate(new Date(), tz);

  return (
    <>
      <PageHeader title="Baptista" subtitle="Il maggiordomo di casa, senza intelligenza artificiale" />

      <Section title="Chiedi a Baptista">
        <div className="flex flex-col gap-2">
          {CALCULATIONS.map((c) => (
            <Link
              key={c.id}
              href={chosen?.id === c.id ? "/baptista" : `/baptista?calcolo=${c.id}`}
              scroll={false}
              aria-current={chosen?.id === c.id ? "true" : undefined}
              className={cx(
                "flex min-h-12 items-center rounded-2xl border px-4 py-2 text-left text-sm",
                chosen?.id === c.id ? "border-accent bg-accent/10 font-medium" : "border-border bg-surface",
              )}
            >
              {c.label}
            </Link>
          ))}
        </div>
        {answer ? (
          <div className="flex items-start gap-3" role="status">
            <BaptistaAvatar expression="suggestion" size={44} />
            <p className="rounded-2xl rounded-tl-md border border-border bg-surface px-4 py-3">{answer}</p>
          </div>
        ) : null}
      </Section>

      <Section title="Da rispondere">
        {open.length ? (
          <div className="flex flex-col gap-6">
            {open.map((view) => (
              <Conversation key={view.key} view={view} timeZone={tz} compact />
            ))}
          </div>
        ) : (
          <EmptyState>Niente in sospeso. Un po&apos; di respiro.</EmptyState>
        )}
      </Section>

      <Section title="Fatto di recente">
        {recent.length ? (
          <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-surface">
            {recent.map((r) => (
              <li key={r.key} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span>✓ {r.text}</span>
                <span className="shrink-0 text-xs text-muted">
                  {relativeDay(localDate(new Date(r.at), tz), today)} {formatTime(new Date(r.at), tz)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState>Le risposte confermate degli ultimi 7 giorni compariranno qui.</EmptyState>
        )}
      </Section>
    </>
  );
}
