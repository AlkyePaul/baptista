import type { Metadata } from "next";
import Link from "next/link";
import { buttonClass, cx, EmptyState, TextLink } from "@/components/ui";
import { WardrobeGrid } from "@/components/wardrobe-grid";
import { requireExecutionContext } from "@/lib/households/context";
import { CLOTHING_TYPES, COLORS, SEASONS } from "@/lib/wardrobe";
import { listWardrobe, signedUrls } from "@/services/wardrobe";
import { OwnedBeforeBulk } from "@/components/wardrobe-bulk";
import { BaptistaRoom } from "@/components/baptista/room";

export const metadata: Metadata = { title: "Capi" };

type Filters = { tipo?: string; stagione?: string; colore?: string; archivio?: string; risposta?: string };

function href(current: Filters, change: Partial<Filters>) {
  const next = { ...current, ...change };
  const query = Object.entries(next)
    .filter(([, v]) => v)
    .map(([k, v]) => `${k}=${encodeURIComponent(v!)}`)
    .join("&");
  return `/stanze/guardaroba/capi${query ? `?${query}` : ""}`;
}

/** The wardrobe as a photo grid, filtered by type, season and colour (all deterministic). */
export default async function ClothesPage({ searchParams }: PageProps<"/stanze/guardaroba/capi">) {
  const ctx = await requireExecutionContext();
  const params = await searchParams;
  const pick = (key: string, list: ReadonlyArray<{ id: string }>) => {
    const v = params[key];
    return typeof v === "string" && list.some((x) => x.id === v) ? v : undefined;
  };
  const filters: Filters = {
    tipo: pick("tipo", CLOTHING_TYPES),
    stagione: pick("stagione", SEASONS),
    colore: pick("colore", COLORS),
    archivio: params.archivio === "1" ? "1" : undefined,
    risposta: params.risposta === "1" ? "1" : undefined,
  };
  const all = await listWardrobe(ctx, filters.archivio ? "archived" : "active");
  // A-2: my items whose origin is still unknown («Da rispondere»).
  const unanswered = filters.archivio ? [] : all.filter((i) => i.acquisition === "unknown" && i.owner_user_id === ctx.user.id);
  if (filters.risposta) {
    const thumbs = await signedUrls(ctx, unanswered.map((i) => i.thumb_path));
    return (
      <>
        <TextLink href="/stanze/guardaroba/capi">← Capi</TextLink>
        <header>
          <h1 className="text-3xl font-semibold tracking-tight">Da rispondere</h1>
          <p className="text-muted">
            {unanswered.length === 1 ? "1 capo" : `${unanswered.length} capi`} senza risposta a «L&apos;hai comprato?»
          </p>
        </header>
        {unanswered.length ? (
          <>
            <OwnedBeforeBulk items={unanswered.map((i) => ({ id: i.id, name: i.name, thumb: i.thumb_path ? (thumbs.get(i.thumb_path) ?? null) : null }))} />
            {unanswered.length < 7 ? <WardrobeGrid items={unanswered} urls={thumbs} /> : null}
          </>
        ) : (
          <EmptyState>Hai risposto per tutti i capi.</EmptyState>
        )}
      </>
    );
  }
  const items = all.filter(
    (i) =>
      (!filters.tipo || i.type === filters.tipo) &&
      (!filters.stagione || i.seasons.includes(filters.stagione) || i.seasons.length === 0) &&
      (!filters.colore || i.primary_color === filters.colore || i.secondary_colors.includes(filters.colore)),
  );
  const urls = await signedUrls(ctx, items.map((i) => i.thumb_path));
  const typesInUse = CLOTHING_TYPES.filter((t) => all.some((i) => i.type === t.id));
  const chip = (active: boolean) =>
    cx(
      "flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm whitespace-nowrap",
      active ? "border-accent bg-accent/10 font-medium text-accent" : "border-border bg-surface text-muted",
    );

  return (
    <>
      <header className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">{filters.archivio ? "Archivio" : "Capi"}</h1>
          <p className="text-muted">{all.length === 1 ? "1 capo" : `${all.length} capi`}</p>
        </div>
        <Link href="/stanze/guardaroba/aggiungi" className={cx(buttonClass.primary, "px-4")}>
          + Capo
        </Link>
      </header>

      {all.length ? (
        <div className="flex flex-col gap-2">
          <nav aria-label="Tipo" className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
            <Link href={href(filters, { tipo: undefined })} className={chip(!filters.tipo)} scroll={false}>
              Tutti
            </Link>
            {typesInUse.map((t) => (
              <Link key={t.id} href={href(filters, { tipo: filters.tipo === t.id ? undefined : t.id })} className={chip(filters.tipo === t.id)} scroll={false}>
                {t.label}
              </Link>
            ))}
          </nav>
          <nav aria-label="Stagione" className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1">
            {SEASONS.map((s) => (
              <Link
                key={s.id}
                href={href(filters, { stagione: filters.stagione === s.id ? undefined : s.id })}
                className={chip(filters.stagione === s.id)}
                scroll={false}
              >
                {s.label}
              </Link>
            ))}
          </nav>
          {filters.colore ? (
            <Link href={href(filters, { colore: undefined })} className={cx(chip(true), "w-fit")} scroll={false}>
              Colore: {COLORS.find((c) => c.id === filters.colore)?.label} ×
            </Link>
          ) : null}
        </div>
      ) : null}

      <BaptistaRoom ctx={ctx} room="guardaroba" />

      {unanswered.length ? (
        <Link href={href(filters, { risposta: "1" })} className="flex min-h-12 items-center justify-between rounded-2xl border border-border bg-surface px-4 text-sm">
          <span>
            <span className="font-medium">Da rispondere:</span> {unanswered.length === 1 ? "1 capo" : `${unanswered.length} capi`}
          </span>
          <span className="text-accent">{unanswered.length >= 7 ? "Erano già miei →" : "Vedi →"}</span>
        </Link>
      ) : null}

      {items.length ? (
        <WardrobeGrid items={items} urls={urls} />
      ) : (
        <EmptyState>
          {all.length ? "Nessun capo con questi filtri." : filters.archivio ? "Nessun capo archiviato." : "Il guardaroba è vuoto. Fotografa il primo capo."}
        </EmptyState>
      )}
      {filters.stagione ? <p className="text-xs text-muted">I capi senza stagione indicata compaiono in tutte le stagioni.</p> : null}

      <div className="flex justify-center">
        <TextLink href={filters.archivio ? "/stanze/guardaroba/capi" : "/stanze/guardaroba/capi?archivio=1"}>
          {filters.archivio ? "← Capi attivi" : "Capi archiviati"}
        </TextLink>
      </div>
    </>
  );
}
