import { setFoodStatusAction } from "@/app/actions/kitchen";
import { setStapleAction } from "@/app/actions/catalog";
import { ActionButton, Field, SelectField } from "@/components/forms";
import { Badge, cx } from "@/components/ui";
import type { FoodItem } from "@/lib/db/types";
import { relativeDay } from "@/lib/dates";
import { effectiveExpiry, expiryState, STORAGES, UNITS, type ExpiryState } from "@/lib/food";
import { formatItalianNumber } from "@/lib/goals";
import type { Totals } from "@/lib/nutrition";

const fmt = (n: number | null | undefined) => (n === null || n === undefined ? undefined : formatItalianNumber(n, false));

/** kcal + macros per 100 g, 4 compact inputs; `nutrition_source` is set by the lookup. */
export function NutritionFields({ defaults }: { defaults?: Partial<Pick<FoodItem, "kcal_100g" | "protein_100g" | "carbs_100g" | "fat_100g" | "nutrition_source">> }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1 text-sm font-medium">Valori per 100 g</legend>
      <input type="hidden" name="nutrition_source" defaultValue={defaults?.nutrition_source ?? "manual"} />
      <div className="grid grid-cols-4 gap-2">
        <Field label="kcal" name="kcal_100g" inputMode="decimal" defaultValue={fmt(defaults?.kcal_100g)} />
        <Field label="Prot." name="protein_100g" inputMode="decimal" defaultValue={fmt(defaults?.protein_100g)} />
        <Field label="Carb." name="carbs_100g" inputMode="decimal" defaultValue={fmt(defaults?.carbs_100g)} />
        <Field label="Grassi" name="fat_100g" inputMode="decimal" defaultValue={fmt(defaults?.fat_100g)} />
      </div>
    </fieldset>
  );
}

/** What belongs to this package (D31): the food itself comes from the catalog. */
export function PantryItemFields({ item, today, defaultStorage }: { item?: FoodItem; today: string; defaultStorage?: string }) {
  const expiry = item ? effectiveExpiry(item) : null;
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Quantità" name="quantity" inputMode="decimal" defaultValue={item ? fmt(item.quantity) : "1"} />
        <SelectField label="Unità" name="unit" defaultValue={item?.unit ?? "pz"} options={UNITS.map((u) => ({ value: u.id, label: u.label }))} />
      </div>
      <SelectField
        key={defaultStorage}
        label="Dove"
        name="storage"
        defaultValue={item?.storage ?? defaultStorage ?? "fridge"}
        options={STORAGES.map((s) => ({ value: s.id, label: s.label }))}
      />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Scadenza" name="expires_on" type="date" defaultValue={expiry?.date} />
        <Field label="Acquistato il" name="purchased_on" type="date" defaultValue={item ? item.purchased_on : today} />
      </div>
      <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
        <input type="checkbox" name="expiry_estimated" defaultChecked={expiry?.estimated ?? false} className="size-5 accent-[var(--accent)]" />
        <span>La scadenza è una mia stima (non è scritta sulla confezione)</span>
      </label>
    </>
  );
}

const EXPIRY_TONE: Record<ExpiryState, "danger" | "accent" | "muted"> = {
  expired: "danger",
  today: "danger",
  soon: "accent",
  ok: "muted",
  none: "muted",
};

/** Expiry information inline: the Dispensa replaces the old «Scadenze» page (D25). */
export function ExpiryBadge({ item, today }: { item: FoodItem; today: string }) {
  const e = effectiveExpiry(item);
  const state = expiryState(item, today);
  if (!e) return null;
  const when = relativeDay(e.date, today);
  const text = e.estimated
    ? `stima: ${when}`
    : state === "expired"
      ? `scaduto ${when}`
      : state === "today"
        ? "scade oggi"
        : `scade ${when}`;
  return <Badge tone={EXPIRY_TONE[state]}>{text}</Badge>;
}

export function FoodQuickActions({ item, starred }: { item: FoodItem; starred?: boolean }) {
  return (
    <div className="flex items-center">
      {starred === undefined ? null : starred ? (
        <span className="px-2 text-xs text-[#b98a26]" aria-label="Prodotto abituale">
          ★ Abituale
        </span>
      ) : (
        <ActionButton action={setStapleAction.bind(null, item.food_id, true)} label={`Segna come abituale: ${item.product_name}`} className="min-h-10 px-2 text-xs">
          ☆ Abituale
        </ActionButton>
      )}
      {item.status === "available" ? (
        <ActionButton action={setFoodStatusAction.bind(null, item.id, item.version, "opened")} label={`Segna come aperto: ${item.product_name}`} className="min-h-10 px-2 text-xs">
          Aperto
        </ActionButton>
      ) : null}
      <ActionButton action={setFoodStatusAction.bind(null, item.id, item.version, "consumed")} label={`Finito: ${item.product_name}`} className="min-h-10 px-2 text-xs">
        Finito
      </ActionButton>
      <ActionButton
        action={setFoodStatusAction.bind(null, item.id, item.version, "discarded")}
        label={`Buttato: ${item.product_name}`}
        confirmLabel="Buttato?"
        className="min-h-10 px-2 text-xs"
      >
        Butta
      </ActionButton>
    </div>
  );
}

/** Summary row: kcal big, macros small; unknown macros shown as «—» (never as zero). */
export function MacroLine({ totals, className, hideKcal }: { totals: Totals; className?: string; hideKcal?: boolean }) {
  const m = (v: number | null, label: string) => (
    <span>
      <span className="font-medium text-foreground">{v === null ? "—" : formatItalianNumber(v)}</span> g {label}
    </span>
  );
  return (
    <p className={cx("flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-muted", className)}>
      {hideKcal ? null : (
        <span>
          <span className="text-lg font-semibold text-foreground">{formatItalianNumber(totals.kcal)}</span> kcal
        </span>
      )}
      {m(totals.protein, "prot.")}
      {m(totals.carbs, "carb.")}
      {m(totals.fat, "grassi")}
    </p>
  );
}
