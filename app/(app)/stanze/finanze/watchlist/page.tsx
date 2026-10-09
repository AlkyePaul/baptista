import type { Metadata } from "next";
import Link from "next/link";
import { addWatchlistAction, moveWatchlistAction, removeWatchlistAction } from "@/app/actions/finance";
import { ActionButton, ActionForm, Field, SubmitButton } from "@/components/forms";
import { Modal } from "@/components/modal";
import { DATE_RANGES, MiniChart, type DateRange } from "@/components/tradingview";
import { buttonClass, Card, cx, EmptyState } from "@/components/ui";
import { getUserContext } from "@/lib/households/context";
import { listWatchlist, MAX_WATCHLIST } from "@/services/watchlist";

export const metadata: Metadata = { title: "Watchlist" };

/** Personal list of securities/ETFs with TradingView charts (D26). Not investment advice. */
export default async function WatchlistPage({ searchParams }: PageProps<"/stanze/finanze/watchlist">) {
  const ctx = await getUserContext();
  const params = await searchParams;
  const range: DateRange = DATE_RANGES.find((r) => r.id === params.periodo)?.id ?? "12M";
  const items = await listWatchlist(ctx);

  return (
    <>
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Watchlist</h1>
          <p className="text-muted">Personale: la vedi solo tu.</p>
        </div>
        {items.length < MAX_WATCHLIST ? (
          <Modal trigger="+ Titolo" title="Aggiungi alla watchlist" triggerClassName={cx(buttonClass.primary, "px-4")}>
            <ActionForm action={addWatchlistAction}>
              <Field
                label="Simbolo"
                name="symbol"
                placeholder="Es. NASDAQ:AAPL"
                hint="Nel formato di TradingView, BORSA:TICKER. Esempi: MIL:ENI, XETR:VWCE, AMEX:SPY, NASDAQ:QQQ."
                required
              />
              <Field label="Nome" name="label" placeholder="Es. Apple" hint="Facoltativo" />
              <SubmitButton>Aggiungi</SubmitButton>
            </ActionForm>
          </Modal>
        ) : null}
      </header>

      {items.length ? (
        <nav aria-label="Periodo" className="grid grid-cols-3 gap-1 rounded-2xl border border-border bg-surface p-1">
          {DATE_RANGES.map((r) => (
            <Link
              key={r.id}
              href={`/stanze/finanze/watchlist?periodo=${r.id}`}
              aria-current={r.id === range ? "page" : undefined}
              scroll={false}
              className={cx(
                "flex min-h-11 items-center justify-center rounded-xl text-sm font-medium transition-colors",
                r.id === range ? "bg-foreground/[0.07] text-foreground" : "text-muted hover:text-foreground",
              )}
            >
              {r.label}
            </Link>
          ))}
        </nav>
      ) : null}

      {items.length ? (
        <ul className="flex flex-col gap-3">
          {items.map((item, i) => (
            <li key={item.id}>
              <Card className="overflow-hidden">
                <div className="flex items-center gap-2 py-2 pr-2 pl-4">
                  <span className="flex flex-1 flex-col">
                    <span className="font-medium">{item.label ?? item.symbol}</span>
                    {item.label ? <span className="text-xs text-muted">{item.symbol}</span> : null}
                  </span>
                  {i > 0 ? (
                    <ActionButton action={moveWatchlistAction.bind(null, item.id, -1)} label={`Sposta su: ${item.symbol}`} className="size-10 px-0">
                      ↑
                    </ActionButton>
                  ) : null}
                  {i < items.length - 1 ? (
                    <ActionButton action={moveWatchlistAction.bind(null, item.id, 1)} label={`Sposta giù: ${item.symbol}`} className="size-10 px-0">
                      ↓
                    </ActionButton>
                  ) : null}
                  <ActionButton action={removeWatchlistAction.bind(null, item.id)} label={`Rimuovi ${item.symbol}`} confirmLabel="Rimuovi?" className="min-h-10 px-2 text-xs">
                    ×
                  </ActionButton>
                </div>
                <MiniChart symbol={item.symbol} range={range} title={`Grafico di ${item.label ?? item.symbol}`} />
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState>Aggiungi titoli o ETF che vuoi seguire, per esempio NASDAQ:AAPL o XETR:VWCE.</EmptyState>
      )}

      <p className="text-xs text-muted">
        Grafici e prezzi forniti da TradingView: al loro servizio arriva solo il simbolo. Non sono consigli di investimento.
      </p>
    </>
  );
}
