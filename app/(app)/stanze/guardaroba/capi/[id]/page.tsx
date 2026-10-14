import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { deleteWardrobeItemAction, replacePhotoAction, setWardrobeStatusAction, updateWardrobeItemAction } from "@/app/actions/wardrobe";
import { ActionButton, ActionForm, Field, SubmitButton, VisibilityField } from "@/components/forms";
import { Icon } from "@/components/icons";
import { PhotoPicker } from "@/components/photo-picker";
import { Badge, Card, PageHeader, PrivateMark, TextLink } from "@/components/ui";
import { Swatch, WardrobeFields } from "@/components/wardrobe";
import { WardrobePhotoDisplay } from "@/components/wardrobe-photo-display";
import type { WardrobeItem } from "@/lib/db/types";
import { requireExecutionContext } from "@/lib/households/context";
import { CLOTHING_TYPES, COLORS, FORMALITIES, PATTERNS, SEASONS } from "@/lib/wardrobe";
import { getRecord } from "@/services/shared";
import { getLinkedExpense, signedUrls, type LinkedExpense } from "@/services/wardrobe";
import { registerPurchaseAction, setAcquisitionAction } from "@/app/actions/wardrobe";
import { formatMoney } from "@/lib/money";
import { formatDay, localDate } from "@/lib/dates";
import Link from "next/link";

export const metadata: Metadata = { title: "Capo" };

const labelOf = (list: ReadonlyArray<{ id: string; label: string }>, id: string | null) => (id ? (list.find((x) => x.id === id)?.label ?? id) : null);

export default async function ClothingPage({ params }: PageProps<"/stanze/guardaroba/capi/[id]">) {
  const { id } = await params;
  const ctx = await requireExecutionContext();
  const item = await getRecord<WardrobeItem>(ctx, "wardrobe_items", id);
  if (!item) notFound();
  const urls = await signedUrls(ctx, [item.original_path, item.thumb_path, item.processed_path]);
  const originalPhoto = (item.original_path && urls.get(item.original_path)) || (item.thumb_path && urls.get(item.thumb_path)) || null;
  const processedPhoto = item.processed_path ? (urls.get(item.processed_path) ?? null) : null;
  const photo = processedPhoto ?? originalPhoto;
  const isOwner = item.owner_user_id === ctx.user.id;
  const expense = await getLinkedExpense(ctx, item.expense_id);
  const today = localDate(new Date(), ctx.household.timezone);
  const facts = [
    labelOf(CLOTHING_TYPES, item.type),
    item.subtype,
    labelOf(PATTERNS, item.pattern),
    labelOf(FORMALITIES, item.formality),
    item.material,
    item.brand,
    item.size ? `Taglia ${item.size}` : null,
  ].filter(Boolean);

  return (
    <>
      <TextLink href="/stanze/guardaroba/capi">← Capi</TextLink>
      <PageHeader
        title={item.name}
        action={
          <span className="flex items-center gap-1">
            {item.favourite ? <span className="text-lg text-amber-400">★</span> : null}
            {item.status === "archived" ? <Badge>Archiviato</Badge> : null}
            <PrivateMark visibility={item.visibility} />
          </span>
        }
      />

      <Card className="overflow-hidden">
        {photo ? (
          <WardrobePhotoDisplay originalUrl={originalPhoto} processedUrl={processedPhoto} alt={item.name} />
        ) : (
          <div className="flex aspect-[4/5] items-center justify-center bg-foreground/[0.03]">
            <Icon name="hanger" className="size-16 text-muted" />
          </div>
        )}
        <div className="flex flex-col gap-2 p-4">
          <p className="text-sm text-muted">{facts.join(" · ")}</p>
          <div className="flex flex-wrap items-center gap-2">
            {[item.primary_color, ...item.secondary_colors].filter((c): c is string => Boolean(c)).map((c) => (
              <span key={c} className="flex items-center gap-1.5 text-sm">
                <Swatch color={c} />
                {COLORS.find((x) => x.id === c)?.label}
              </span>
            ))}
          </div>
          {item.seasons.length || item.tags.length ? (
            <div className="flex flex-wrap gap-1.5">
              {item.seasons.map((s) => (
                <Badge key={s} tone="accent">
                  {labelOf(SEASONS, s)}
                </Badge>
              ))}
              {item.tags.map((t) => (
                <Badge key={t}>#{t}</Badge>
              ))}
            </div>
          ) : null}
          {item.notes ? <p className="text-sm whitespace-pre-line">{item.notes}</p> : null}
        </div>
      </Card>

      <AcquisitionBlock item={item} isOwner={isOwner} expense={expense} today={today} />

      <details className="rounded-2xl border border-border bg-surface">
        <summary className="flex min-h-12 cursor-pointer items-center px-4 font-medium">Modifica</summary>
        <div className="border-t border-border p-4">
          <ActionForm action={updateWardrobeItemAction.bind(null, item.id)} resetOnSuccess={false} successMessage>
            <input type="hidden" name="version" value={item.version} />
            <WardrobeFields item={item} />
            {isOwner ? null : <p className="text-xs text-muted">Solo chi ha aggiunto il capo può cambiarne la visibilità.</p>}
            <SubmitButton>Salva</SubmitButton>
          </ActionForm>
        </div>
      </details>

      <details className="rounded-2xl border border-border bg-surface">
        <summary className="flex min-h-12 cursor-pointer items-center px-4 font-medium">{photo ? "Cambia foto" : "Aggiungi foto"}</summary>
        <div className="border-t border-border p-4">
          <ActionForm action={replacePhotoAction.bind(null, item.id)} successMessage>
            <input type="hidden" name="version" value={item.version} />
            <PhotoPicker />
            <SubmitButton pendingLabel="Carico la foto…">Salva foto</SubmitButton>
          </ActionForm>
        </div>
      </details>

      <div className="flex justify-between">
        <ActionButton action={setWardrobeStatusAction.bind(null, item.id, item.version, item.status === "active" ? "archived" : "active")}>
          {item.status === "active" ? "Archivia" : "Rimetti tra i capi"}
        </ActionButton>
        <ActionButton action={deleteWardrobeItemAction.bind(null, item.id)} variant="danger" confirmLabel="Conferma eliminazione">
          Elimina
        </ActionButton>
      </div>
    </>
  );
}

const ACQUISITION_TEXT = { gift: "È un regalo.", owned_before: "Era già tuo prima di Baptista." } as const;

/** A-2: «L'hai comprato?» on the item itself; the answer can be changed by its owner. */
function AcquisitionBlock({ item, isOwner, expense, today }: { item: WardrobeItem; isOwner: boolean; expense: LinkedExpense | null; today: string }) {
  if (item.acquisition === "unknown") {
    if (!isOwner) return null;
    return (
      <Card className="flex flex-col gap-3 p-4">
        <h2 className="font-semibold">L&apos;hai comprato?</h2>
        <details className="rounded-xl border border-border">
          <summary className="flex min-h-12 cursor-pointer items-center px-3 font-medium">Sì, l&apos;ho comprato</summary>
          <div className="border-t border-border p-3">
            <ActionForm action={registerPurchaseAction.bind(null, item.id)} successMessage>
              <input type="hidden" name="version" value={item.version} />
              <div className="grid grid-cols-2 gap-3">
                <Field label="Prezzo (€)" name="price" inputMode="decimal" hint="Senza prezzo non creo nessuna spesa." />
                <Field label="Data" name="occurred_on" type="date" defaultValue={today} />
              </div>
              <Field label="Negozio" name="merchant" hint="Facoltativo" />
              <VisibilityField defaultValue={item.visibility} />
              <SubmitButton>Registra</SubmitButton>
            </ActionForm>
          </div>
        </details>
        <div className="grid grid-cols-2 gap-2">
          <ActionButton action={setAcquisitionAction.bind(null, item.id, item.version, "owned_before")} variant="secondary" className="w-full">
            Era già mio
          </ActionButton>
          <ActionButton action={setAcquisitionAction.bind(null, item.id, item.version, "gift")} variant="secondary" className="w-full">
            È un regalo
          </ActionButton>
        </div>
      </Card>
    );
  }
  const text =
    item.acquisition === "purchased"
      ? expense
        ? null
        : "Acquistato, senza prezzo registrato."
      : ACQUISITION_TEXT[item.acquisition];
  return (
    <Card className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
      {expense ? (
        <Link href={`/stanze/finanze/spese/${expense.id}`} className="font-medium text-accent">
          Acquistato il {formatDay(expense.occurred_on)} · {formatMoney(expense.total, expense.currency)}
        </Link>
      ) : (
        <span className="text-muted">{text}</span>
      )}
      {isOwner && !expense ? (
        <ActionButton action={setAcquisitionAction.bind(null, item.id, item.version, "unknown")} className="min-h-10 px-2 text-xs">
          Cambia risposta
        </ActionButton>
      ) : null}
    </Card>
  );
}
