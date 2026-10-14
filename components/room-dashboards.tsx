import Link from "next/link";
import { BudgetBar, Money } from "@/components/finance";
import { Icon } from "@/components/icons";
import { NewRecipe, RecipeGrid } from "@/components/recipes";
import { ProgressRing } from "@/components/progress-ring";
import { Card, EmptyState, Section, TextLink } from "@/components/ui";
import { localDate, monthOf } from "@/lib/dates";
import { STORAGES } from "@/lib/food";
import { formatItalianNumber } from "@/lib/goals";
import type { ExecutionContext } from "@/lib/households/context";
import { addAmounts, budgetUsage, monthElapsedShare, totalsByCurrency } from "@/lib/money";
import { diaryTotals, targetProgress } from "@/lib/nutrition";
import type { IconName } from "@/lib/rooms";
import { getKcalTarget, listDay } from "@/services/diet";
import { listBudgets, listFinanceGoals, listMonthExpenses, spentByGoal } from "@/services/finance";
import { listPantry } from "@/services/food";
import { listRecipes } from "@/services/recipes";
import { listWardrobe, signedUrls } from "@/services/wardrobe";
import { WardrobeGrid } from "@/components/wardrobe-grid";
import { SEASONS, seasonOf } from "@/lib/wardrobe";
import { BaptistaRoom } from "@/components/baptista/room";
import { BaptistaGreeting } from "@/components/baptista/greeting";
import { DeviceLocation } from "@/components/baptista/device-location";
import { financeGreeting, kitchenGreeting, wardrobeGreeting } from "@/lib/baptista/greetings";
import { getWeather } from "@/services/weather";

/** Home of each room: what matters today in that room, computed without any AI (D25/D26). */

function Shortcut({ href, icon, label: text }: { href: string; icon: IconName; label: string }) {
  return (
    <Link href={href} className="flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-2xl border border-border bg-surface text-sm font-medium">
      <Icon name={icon} />
      {text}
    </Link>
  );
}

/**
 * Cucina home (D31): the family cookbook first, then what is in the house and today's diary.
 * Expiries are not repeated here: Baptista and the Dispensa already show them.
 */
export async function KitchenRoom({ ctx, now }: { ctx: ExecutionContext; now: Date }) {
  const today = localDate(now, ctx.household.timezone);
  const [pantry, entries, target, recipes] = await Promise.all([listPantry(ctx), listDay(ctx, today), getKcalTarget(ctx), listRecipes(ctx)]);
  const kcal = diaryTotals(entries).kcal;
  const progress = targetProgress(kcal, target);
  // A «pasto» is a filled slot of the diary (colazione, pranzo, cena, spuntini).
  const meals = new Set(entries.map((e) => e.slot)).size;

  return (
    <>
      <BaptistaGreeting greeting={kitchenGreeting(meals, kcal, target)} />
      <BaptistaRoom ctx={ctx} room="cucina" />
      <div className="grid grid-cols-3 gap-2">
        <Shortcut href="/stanze/cucina/aggiungi" icon="food" label="Alimento" />
        <Shortcut href="/stanze/cucina/dispensa" icon="pantry" label="Dispensa" />
        <Shortcut href="/stanze/cucina/pasti" icon="meals" label="Pasti" />
      </div>

      <Section title="Ricettario" id="ricettario" action={<NewRecipe />}>
        {recipes.length ? (
          <>
            <RecipeGrid recipes={recipes.slice(0, 6)} />
            {recipes.length > 6 ? <TextLink href="/stanze/cucina/ricette">Tutte le ricette ({recipes.length})</TextLink> : null}
          </>
        ) : (
          <EmptyState>Il ricettario di famiglia è vuoto: scrivi la prima ricetta.</EmptyState>
        )}
      </Section>

      <Section title="In casa" action={<TextLink href="/stanze/cucina/dispensa">Dispensa</TextLink>}>
        <Link href="/stanze/cucina/dispensa" className="grid grid-cols-3 gap-2">
          {STORAGES.map((s) => (
            <span key={s.id} className="flex flex-col items-center gap-0.5 rounded-2xl border border-border bg-surface py-3">
              <span className="text-2xl font-semibold">{pantry.filter((i) => i.storage === s.id).length}</span>
              <span className="text-xs text-muted">{s.label}</span>
            </span>
          ))}
        </Link>
      </Section>

      <Section title="Oggi a tavola" action={<TextLink href="/stanze/cucina/pasti">Diario</TextLink>}>
        <Link href="/stanze/cucina/pasti" className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-4">
          <ProgressRing percent={progress.percent} color="#3f9d8c" label={`${kcal} kcal oggi`}>
            <span className="text-sm font-semibold">{formatItalianNumber(kcal)}</span>
          </ProgressRing>
          <span className="flex flex-col">
            <span className="font-medium">{formatItalianNumber(kcal)} kcal registrate</span>
            <span className="text-sm text-muted">
              {progress.left === null
                ? "Nessun obiettivo impostato"
                : progress.left >= 0
                  ? `Restano ${formatItalianNumber(progress.left)} kcal`
                  : `${formatItalianNumber(-progress.left)} kcal oltre l'obiettivo`}
            </span>
          </span>
        </Link>
      </Section>
    </>
  );
}

export async function FinanceRoom({ ctx, now }: { ctx: ExecutionContext; now: Date }) {
  const today = localDate(now, ctx.household.timezone);
  const month = monthOf(today);
  const [expenses, budgets, goals, goalSpending] = await Promise.all([listMonthExpenses(ctx, month), listBudgets(ctx), listFinanceGoals(ctx), spentByGoal(ctx)]);
  const totals = totalsByCurrency(expenses);
  const main = totals[0]?.currency ?? "EUR";
  const mainTotal = totals[0]?.total ?? 0;
  const overall = budgets.find((b) => b.category_id === null && b.currency === main);
  const activeGoals = goals.filter((g) => g.status === "active").slice(0, 3);

  return (
    <>
      <BaptistaGreeting greeting={financeGreeting(monthElapsedShare(today), mainTotal, overall ? Number(overall.monthly_amount) : null, main)} />
      <BaptistaRoom ctx={ctx} room="finanze" />
      <div className="grid grid-cols-3 gap-2">
        <Shortcut href="/stanze/finanze/aggiungi?tipo=spesa" icon="coins" label="Spesa" />
        <Shortcut href="/stanze/finanze/budget" icon="piggybank" label="Budget" />
        <Shortcut href="/stanze/finanze/aggiungi?tipo=progetto" icon="chart" label="Progetto" />
      </div>

      <Section title="Questo mese" action={<TextLink href="/stanze/finanze/spese">Spese</TextLink>}>
        <Card className="flex flex-col gap-3 p-4">
          <div className="flex flex-wrap items-baseline gap-x-4">
            <Money amount={mainTotal} currency={main} className="text-3xl font-semibold" />
            {totals.slice(1).map((t) => (
              <Money key={t.currency} amount={t.total} currency={t.currency} className="text-muted" />
            ))}
          </div>
          {overall ? (
            <>
              <BudgetBar usage={budgetUsage(mainTotal, Number(overall.monthly_amount))} color="#3f9d8c" label="Budget del mese" />
              <p className="text-sm text-muted">
                su un budget di <Money amount={overall.monthly_amount} currency={main} />
              </p>
            </>
          ) : (
            <p className="text-sm text-muted">
              Nessun budget totale. <TextLink href="/stanze/finanze/budget">Impostalo</TextLink>
            </p>
          )}
        </Card>
      </Section>

      <Section title="Progetti" action={<TextLink href="/stanze/finanze/budget#progetti">Tutti</TextLink>}>
        {activeGoals.length ? (
          <ul className="flex flex-col gap-2">
            {activeGoals.map((g) => {
              const estimate = addAmounts(g.estimate_lines.map((l) => l.amount));
              const spent = addAmounts(goalSpending.filter((s) => s.goal_id === g.id && s.currency === g.currency).map((s) => s.total));
              return (
                <li key={g.id}>
                  <Link href={`/stanze/finanze/budget/progetti/${g.id}`} className="flex flex-col gap-2 rounded-2xl border border-border bg-surface p-4">
                    <span className="flex justify-between gap-2 font-medium">
                      {g.title}
                      <span className="text-sm font-normal text-muted">
                        <Money amount={spent} currency={g.currency} /> / <Money amount={estimate} currency={g.currency} />
                      </span>
                    </span>
                    {estimate > 0 ? <BudgetBar usage={budgetUsage(spent, estimate)} color="#7a6fd0" label={g.title} /> : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState>Nessun progetto di spesa in corso.</EmptyState>
        )}
      </Section>
    </>
  );
}

export async function WardrobeRoom({ ctx, now }: { ctx: ExecutionContext; now: Date }) {
  const season = seasonOf(localDate(now, ctx.household.timezone));
  const [items, weather] = await Promise.all([listWardrobe(ctx), getWeather(ctx.household.timezone)]);
  const inSeason = items.filter((i) => i.seasons.includes(season));
  const recent = items.slice(0, 4);
  const urls = await signedUrls(ctx, recent.map((i) => i.thumb_path));
  const seasonLabel = SEASONS.find((s) => s.id === season)!.label.toLowerCase();

  return (
    <>
      <BaptistaGreeting greeting={wardrobeGreeting(weather)}>
        <DeviceLocation active={weather?.source === "device"} />
      </BaptistaGreeting>
      <BaptistaRoom ctx={ctx} room="guardaroba" />
      <div className="grid grid-cols-3 gap-2">
        <Shortcut href="/stanze/guardaroba/aggiungi" icon="camera" label="Fotografa" />
        <Shortcut href="/stanze/guardaroba/capi" icon="hanger" label="Capi" />
        <Shortcut href="/stanze/guardaroba/capi?risposta=1" icon="tag" label="Da rispondere" />
      </div>

      <Section title="Per la stagione" action={<TextLink href={`/stanze/guardaroba/capi?stagione=${season}`}>Vedi</TextLink>}>
        <Link href={`/stanze/guardaroba/capi?stagione=${season}`} className="flex flex-col gap-1 rounded-2xl border border-border bg-surface p-4">
          <span className="text-lg font-semibold">
            {inSeason.length === 1 ? "1 capo" : `${inSeason.length} capi`} {season === "spring" ? `per la ${seasonLabel}` : `per l’${seasonLabel}`}
          </span>
          <span className="text-sm text-muted">
            {items.length} capi in tutto · {items.filter((i) => i.seasons.length === 0).length} senza stagione indicata
          </span>
        </Link>
      </Section>

      <Section title="Aggiunti di recente" action={<TextLink href="/stanze/guardaroba/capi">Tutti</TextLink>}>
        {recent.length ? <WardrobeGrid items={recent} urls={urls} /> : <EmptyState>Il guardaroba è vuoto. Fotografa il primo capo.</EmptyState>}
      </Section>
    </>
  );
}
