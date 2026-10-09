"use client";

import { useSyncExternalStore } from "react";

/**
 * TradingView «mini symbol overview» (D26) as a plain cross-origin iframe. The official snippet
 * runs TradingView's script inside our page, where it could read non-httpOnly session cookies;
 * here only their iframe is loaded (same URL the snippet builds), sandboxed and without referrer.
 * Only the symbol and display settings reach TradingView.
 */
const WIDGET_URL = "https://www.tradingview-widget.com/embed-widget/mini-symbol-overview/";

export const DATE_RANGES = [
  { id: "1M", label: "1 mese" },
  { id: "12M", label: "1 anno" },
  { id: "60M", label: "5 anni" },
] as const;
export type DateRange = (typeof DATE_RANGES)[number]["id"];

const query = "(prefers-color-scheme: dark)";
function subscribe(onChange: () => void) {
  const media = window.matchMedia(query);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

export function MiniChart({ symbol, range, title }: { symbol: string; range: DateRange; title: string }) {
  const dark = useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
  const settings = {
    symbol,
    width: "100%",
    height: 190,
    locale: "it",
    dateRange: range,
    colorTheme: dark ? "dark" : "light",
    isTransparent: true,
    autosize: true,
    largeChartUrl: "",
    noTimeScale: false,
    chartOnly: false,
  };
  const src = `${WIDGET_URL}?locale=it#${encodeURIComponent(JSON.stringify(settings))}`;
  return (
    <iframe
      key={src}
      src={src}
      title={title}
      loading="lazy"
      referrerPolicy="no-referrer"
      sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      className="h-[190px] w-full border-0"
    />
  );
}
