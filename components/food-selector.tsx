"use client";

import { memo, useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addFoodEntryDirectAction, addMealEntryDirectAction, listRecentFoodsAction } from "@/app/actions/kitchen";
import { searchCatalogAction, pickOffFoodAction, searchOffAction } from "@/app/actions/catalog";
import { BarcodeScanner } from "@/components/barcode-scanner";
import { Icon } from "@/components/icons";
import { buttonClass, cx } from "@/components/ui";
import type { Food, Meal } from "@/lib/db/types";
import { foodLine } from "@/lib/food";
import { formatItalianNumber } from "@/lib/goals";
import { SLOTS, portion, type Slot } from "@/lib/nutrition";
import type { FoodFacts } from "@/lib/openfoodfacts-parse";

type FoodSelectorProps = {
  /** Current date for the entry. */
  day: string;
  /** Pre-selected meal slot. */
  slot: Slot;
  /** Human-readable day label (e.g. "oggi", "mercoledì 14 ottobre"). */
  dayLabel: string;
  /** Saved meals for the "Pasti salvati" tab. */
  meals: Array<Meal & { kcal: number }>;
  /** Called when the selector should close. */
  onClose: () => void;
};

type Tab = "recenti" | "alimenti" | "ricette" | "pasti";
const TABS: Array<{ id: Tab; label: string }> = [
  { id: "recenti", label: "Recenti" },
  { id: "alimenti", label: "Alimenti" },
  { id: "pasti", label: "Pasti salvati" },
];

const inputClass =
  "min-h-12 w-full rounded-xl border border-border bg-surface px-4 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/25";

/**
 * Full-screen food selection experience. Opens when the user taps + inside a meal accordion.
 * Keeps the meal context (date + slot) visible in the header. Supports immediate food insertion.
 */
export function FoodSelector({ day, slot: initialSlot, dayLabel, meals, onClose }: FoodSelectorProps) {
  const router = useRouter();
  const [currentSlot, setCurrentSlot] = useState<Slot>(initialSlot);
  const [tab, setTab] = useState<Tab>("recenti");
  const [pending, startTransition] = useTransition();

  // Search state
  const [query, setQuery] = useState("");
  const [catalogResults, setCatalogResults] = useState<Food[] | null>(null);
  const [offResults, setOffResults] = useState<FoodFacts[] | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Recent foods
  const [recentFoods, setRecentFoods] = useState<Food[] | null>(null);
  const [recentLoaded, setRecentLoaded] = useState(false);

  // Portion selector
  const [selectedFood, setSelectedFood] = useState<Food | null>(null);

  // Barcode scanner
  const [scanning, setScanning] = useState(false);

  // Added items counter (for feedback)
  const [addedCount, setAddedCount] = useState(0);

  // Load recent foods on mount
  useEffect(() => {
    if (!recentLoaded) {
      startTransition(async () => {
        const result = await listRecentFoodsAction();
        if (result.ok) setRecentFoods(result.foods);
        setRecentLoaded(true);
      });
    }
  }, [recentLoaded]);

  // Cleanup timer
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // Prevent body scroll when selector is open
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const slotLabel = SLOTS.find((s) => s.id === currentSlot)?.label ?? "";

  // ── Search ──────────────────────────────────────────────────────────

  function search(value: string) {
    setQuery(value);
    setOffResults(null);
    setMessage(null);
    if (timer.current) clearTimeout(timer.current);
    if (value.trim().length < 2) {
      setCatalogResults(null);
      return;
    }
    timer.current = setTimeout(() => {
      startTransition(async () => {
        const r = await searchCatalogAction(value);
        if (r.ok) setCatalogResults(r.foods);
        else setMessage(r.message);
      });
    }, 250);
  }

  function searchOff() {
    setMessage(null);
    startTransition(async () => {
      const r = await searchOffAction(query);
      if (!r.ok) setMessage(r.message);
      else {
        setOffResults(r.results);
        if (!r.results.length) setMessage("Nessun prodotto trovato su Open Food Facts.");
      }
    });
  }

  function pickOff(facts: FoodFacts) {
    startTransition(async () => {
      const r = await pickOffFoodAction(facts);
      if (r.ok) setSelectedFood(r.food);
      else setMessage(r.message);
    });
  }

  function scanned(code: string) {
    setScanning(false);
    setTab("alimenti");
    search(code);
    // Also do an immediate OFF lookup for barcodes
    startTransition(async () => {
      const own = await searchCatalogAction(code);
      const match = own.ok ? own.foods.find((f) => f.barcode === code) : undefined;
      if (match) {
        setSelectedFood(match);
        return;
      }
      const r = await searchOffAction(code);
      if (r.ok) {
        setOffResults(r.results);
        if (!r.results.length) setMessage(`Codice ${code}: non trovato.`);
      }
    });
  }

  // ── Add food ────────────────────────────────────────────────────────

  function addFood(food: Food, grams: number) {
    startTransition(async () => {
      const result = await addFoodEntryDirectAction({
        eaten_on: day,
        slot: currentSlot,
        food_id: food.id,
        grams,
      });
      if (result.ok) {
        setSelectedFood(null);
        setAddedCount((c) => c + 1);
        // Refresh recent foods
        setRecentLoaded(false);
        router.refresh();
      } else {
        setMessage(result.message ?? "Errore nell'aggiunta.");
      }
    });
  }

  const addMeal = useCallback((meal: Meal & { kcal: number }, portions: number) => {
    startTransition(async () => {
      const result = await addMealEntryDirectAction({
        eaten_on: day,
        slot: currentSlot,
        meal_id: meal.id,
        portions,
      });
      if (result.ok) {
        setAddedCount((c) => c + 1);
        router.refresh();
      } else {
        setMessage(result.message ?? "Errore nell'aggiunta.");
      }
    });
  }, [day, currentSlot, router]);

  // ── Portion selector ────────────────────────────────────────────────

  if (selectedFood) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col bg-background">
        <SelectorHeader
          slotLabel={slotLabel}
          dayLabel={dayLabel}
          onClose={() => setSelectedFood(null)}
          onSlotChange={setCurrentSlot}
          currentSlot={currentSlot}
          backLabel="← Indietro"
        />
        <div className="flex flex-1 flex-col items-center justify-center gap-6 px-5">
          <PortionPicker food={selectedFood} onConfirm={(grams) => addFood(selectedFood, grams)} pending={pending} />
        </div>
      </div>
    );
  }

  // ── Main selector ───────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Header */}
      <SelectorHeader
        slotLabel={slotLabel}
        dayLabel={dayLabel}
        onClose={onClose}
        onSlotChange={setCurrentSlot}
        currentSlot={currentSlot}
        addedCount={addedCount}
      />

      {/* Tabs */}
      <div className="flex border-b border-border px-4">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cx(
              "flex-1 py-2.5 text-center text-sm font-medium transition-colors",
              t.id === tab
                ? "border-b-2 border-accent text-accent"
                : "text-muted hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {tab === "recenti" && (
          <RecentTab
            foods={recentFoods}
            loaded={recentLoaded}
            onSelect={setSelectedFood}
          />
        )}

        {tab === "alimenti" && (
          <SearchTab
            query={query}
            onSearch={search}
            catalogResults={catalogResults}
            offResults={offResults}
            message={message}
            pending={pending}
            onSelect={setSelectedFood}
            onSearchOff={searchOff}
            onPickOff={pickOff}
          />
        )}

        {tab === "pasti" && (
          <MealsTab
            meals={meals}
            onAdd={addMeal}
            pending={pending}
          />
        )}
      </div>

      {/* Bottom action bar */}
      <div className="flex items-center justify-around border-t border-border bg-surface px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
        <button
          type="button"
          onClick={() => setScanning(true)}
          className="flex flex-col items-center gap-1 text-accent"
        >
          <Icon name="camera" className="size-6" />
          <span className="text-[10px] font-medium">Barcode</span>
        </button>
      </div>

      {/* Barcode scanner overlay */}
      {scanning ? <BarcodeScanner onDetected={scanned} onClose={() => setScanning(false)} /> : null}
    </div>
  );
}

// ── Header ────────────────────────────────────────────────────────────

const SelectorHeader = memo(function SelectorHeader({
  slotLabel,
  dayLabel,
  onClose,
  onSlotChange,
  currentSlot,
  addedCount,
  backLabel,
}: {
  slotLabel: string;
  dayLabel: string;
  onClose: () => void;
  onSlotChange: (slot: Slot) => void;
  currentSlot: Slot;
  addedCount?: number;
  backLabel?: string;
}) {
  const [showSlotPicker, setShowSlotPicker] = useState(false);

  return (
    <div className="flex items-center gap-3 border-b border-border px-4 py-3 pt-[calc(0.75rem+env(safe-area-inset-top,0px))]">
      <button type="button" onClick={onClose} className={cx(buttonClass.ghost, "min-h-10 px-2")}>
        {backLabel ?? "×"}
      </button>
      <div className="relative flex flex-1 flex-col items-center">
        <button
          type="button"
          onClick={() => setShowSlotPicker((s) => !s)}
          className="flex items-center gap-1 text-sm font-semibold"
        >
          {slotLabel}
          <Icon name="chevron-down" className="size-3.5 text-muted" />
        </button>
        <span className="text-xs text-muted first-letter:uppercase">{dayLabel}</span>

        {/* Slot dropdown */}
        {showSlotPicker ? (
          <div className="absolute top-full z-10 mt-1 w-40 rounded-xl border border-border bg-surface py-1 shadow-lg">
            {SLOTS.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  onSlotChange(s.id);
                  setShowSlotPicker(false);
                }}
                className={cx(
                  "flex w-full items-center px-4 py-2.5 text-sm",
                  s.id === currentSlot ? "font-semibold text-accent" : "text-foreground hover:bg-foreground/5",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        ) : null}
      </div>
      {addedCount ? (
        <span className="rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-on-accent">
          +{addedCount}
        </span>
      ) : (
        <span className="min-h-10 w-10" />
      )}
    </div>
  );
});

// ── Recent tab ────────────────────────────────────────────────────────

const RecentTab = memo(function RecentTab({
  foods,
  loaded,
  onSelect,
}: {
  foods: Food[] | null;
  loaded: boolean;
  onSelect: (food: Food) => void;
}) {
  if (!loaded) return <p className="text-sm text-muted">Caricamento…</p>;
  if (!foods?.length) return <p className="py-8 text-center text-sm text-muted">Nessun alimento utilizzato di recente. Cerca nella scheda Alimenti.</p>;

  return (
    <div className="flex flex-col gap-1">
      <p className="mb-2 text-xs font-medium text-muted">Utilizzati di recente</p>
      <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-surface">
        {foods.map((f) => (
          <li key={f.id}>
            <button
              type="button"
              onClick={() => onSelect(f)}
              className="flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left hover:bg-foreground/5"
            >
              <span className="flex flex-1 flex-col">
                <span className="text-sm font-medium">{f.name}</span>
                <span className="text-xs text-muted">{foodLine(f)}</span>
              </span>
              {f.kcal_100g !== null ? (
                <span className="shrink-0 text-xs text-muted">{formatItalianNumber(f.kcal_100g)} kcal/100g</span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
});

// ── Search tab ────────────────────────────────────────────────────────

const SearchTab = memo(function SearchTab({
  query,
  onSearch,
  catalogResults,
  offResults,
  message,
  pending,
  onSelect,
  onSearchOff,
  onPickOff,
}: {
  query: string;
  onSearch: (q: string) => void;
  catalogResults: Food[] | null;
  offResults: FoodFacts[] | null;
  message: string | null;
  pending: boolean;
  onSelect: (food: Food) => void;
  onSearchOff: () => void;
  onPickOff: (facts: FoodFacts) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="relative">
        <Icon name="search" className="pointer-events-none absolute top-1/2 left-3 size-5 -translate-y-1/2 text-muted" />
        <input
          type="search"
          value={query}
          onChange={(e) => onSearch(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") e.preventDefault(); }}
          placeholder="Cerca alimenti, ricette…"
          autoComplete="off"
          autoFocus
          className={cx(inputClass, "pl-10")}
        />
      </div>

      {catalogResults?.length ? (
        <ul className="flex max-h-64 flex-col divide-y divide-border overflow-y-auto rounded-xl border border-border bg-surface">
          {catalogResults.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                onClick={() => onSelect(f)}
                className="flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left hover:bg-foreground/5"
              >
                <span className="flex flex-1 flex-col">
                  <span className="text-sm font-medium">{f.name}</span>
                  <span className="text-xs text-muted">{foodLine(f)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : catalogResults && !pending ? (
        <p className="text-sm text-muted">Non è negli alimenti di casa.</p>
      ) : null}

      {query.trim().length >= 2 ? (
        <button
          type="button"
          onClick={onSearchOff}
          disabled={pending}
          className={cx(buttonClass.secondary, "min-h-10 text-sm")}
        >
          Cerca su Open Food Facts
        </button>
      ) : null}

      {offResults?.length ? (
        <ul className="flex max-h-64 flex-col divide-y divide-border overflow-y-auto rounded-xl border border-border bg-surface">
          {offResults.map((f, i) => (
            <li key={`${f.barcode ?? f.name}-${i}`}>
              <button
                type="button"
                onClick={() => onPickOff(f)}
                disabled={pending}
                className="flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left hover:bg-foreground/5"
              >
                <span className="flex flex-1 flex-col">
                  <span className="text-sm font-medium">{f.name}</span>
                  {f.brand ? <span className="text-xs text-muted">{f.brand}</span> : null}
                </span>
                <span className="shrink-0 text-xs text-muted">{f.kcal_100g ?? "?"} kcal</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {pending ? <p className="text-xs text-muted">Cerco…</p> : null}
      {message ? <p role="status" className="text-sm text-muted">{message}</p> : null}
    </div>
  );
});

// ── Meals tab ─────────────────────────────────────────────────────────

const MealsTab = memo(function MealsTab({
  meals,
  onAdd,
  pending,
}: {
  meals: Array<Meal & { kcal: number }>;
  onAdd: (meal: Meal & { kcal: number }, portions: number) => void;
  pending: boolean;
}) {
  if (!meals.length) return <p className="py-8 text-center text-sm text-muted">Nessun pasto salvato. Crea un pasto dalla pagina Pasti.</p>;

  return (
    <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-surface">
      {meals.map((m) => (
        <li key={m.id} className="flex items-center gap-3 px-4 py-3">
          <span className="flex flex-1 flex-col">
            <span className="text-sm font-medium">{m.title}</span>
            <span className="text-xs text-muted">{formatItalianNumber(m.kcal)} kcal</span>
          </span>
          <button
            type="button"
            onClick={() => onAdd(m, 1)}
            disabled={pending}
            className={cx(buttonClass.ghost, "min-h-9 px-3 text-sm font-medium text-accent")}
          >
            + Aggiungi
          </button>
        </li>
      ))}
    </ul>
  );
});

// ── Portion picker ────────────────────────────────────────────────────

const PortionPicker = memo(function PortionPicker({
  food,
  onConfirm,
  pending,
}: {
  food: Food;
  onConfirm: (grams: number) => void;
  pending: boolean;
}) {
  const hasUnit = food.portion_label && food.portion_weight_g;
  const [value, setValue] = useState(hasUnit ? "1" : "100");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const numValue = Number(value.replace(",", "."));
  const grams = hasUnit ? numValue * food.portion_weight_g! : numValue;
  const isValid = Number.isFinite(grams) && grams > 0 && grams <= 3000;

  const kcalPreview = isValid && food.kcal_100g !== null
    ? portion({ ...food, kcal_100g: food.kcal_100g }, grams)
    : null;

  return (
    <div className="flex w-full max-w-sm flex-col gap-5">
      <div className="flex flex-col items-center gap-1">
        <h3 className="text-lg font-semibold">{food.name}</h3>
        <p className="text-sm text-muted">{foodLine(food)}</p>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium" htmlFor="__portion_input">
          {hasUnit ? `Quantità (${food.portion_label})` : "Grammi"}
        </label>
        <input
          ref={inputRef}
          id="__portion_input"
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && isValid) onConfirm(grams);
          }}
          className={inputClass}
        />
        {hasUnit ? (
          <p className="text-xs text-muted">
            {food.portion_label} · {food.portion_weight_g} g/unità
            {isValid ? ` = ${formatItalianNumber(grams)} g` : ""}
          </p>
        ) : null}
      </div>

      {kcalPreview ? (
        <div className="flex items-baseline gap-3 text-sm text-muted">
          <span>
            <span className="text-lg font-semibold text-foreground">{formatItalianNumber(kcalPreview.kcal)}</span> kcal
          </span>
          {kcalPreview.protein !== null ? <span>{formatItalianNumber(kcalPreview.protein)} g prot.</span> : null}
          {kcalPreview.carbs !== null ? <span>{formatItalianNumber(kcalPreview.carbs)} g carb.</span> : null}
          {kcalPreview.fat !== null ? <span>{formatItalianNumber(kcalPreview.fat)} g grassi</span> : null}
        </div>
      ) : food.kcal_100g === null ? (
        <p className="text-sm text-muted">Calorie non disponibili per questo alimento.</p>
      ) : null}

      <button
        type="button"
        onClick={() => isValid && onConfirm(grams)}
        disabled={!isValid || pending}
        className={buttonClass.primary}
      >
        {pending ? "Aggiungo…" : "Aggiungi"}
      </button>

      {/* Quick portion buttons */}
      {!hasUnit ? (
        <div className="flex flex-wrap justify-center gap-2">
          {[50, 100, 150, 200, 250, 300].map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setValue(String(g))}
              className={cx(
                "rounded-lg border px-3 py-1.5 text-sm transition-colors",
                value === String(g) ? "border-accent bg-accent/10 text-accent" : "border-border text-muted hover:bg-foreground/5",
              )}
            >
              {g} g
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
});
