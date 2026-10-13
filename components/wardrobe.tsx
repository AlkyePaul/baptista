import { Field, SelectField, VisibilityField } from "@/components/forms";
import { cx } from "@/components/ui";
import type { WardrobeItem } from "@/lib/db/types";
import { CLOTHING_TYPES, COLORS, FORMALITIES, PATTERNS, SEASONS } from "@/lib/wardrobe";

/** Chip group (radio or checkbox) styled through :has(:checked); no client JS. */
export function ChipGroup({
  legend,
  name,
  options,
  defaults = [],
  multiple,
}: {
  legend: string;
  name: string;
  options: ReadonlyArray<{ id: string; label: string }>;
  defaults?: string[];
  multiple?: boolean;
}) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label
            key={o.id}
            className="flex min-h-10 cursor-pointer items-center rounded-full border border-border bg-surface px-3 text-sm has-checked:border-accent has-checked:bg-accent/10 has-checked:font-medium has-checked:text-accent"
          >
            <input type={multiple ? "checkbox" : "radio"} name={name} value={o.id} defaultChecked={defaults.includes(o.id)} className="sr-only" />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function Swatch({ color, className }: { color: string; className?: string }) {
  const hex = COLORS.find((c) => c.id === color)?.hex ?? "#ccc";
  return <span aria-hidden className={cx("inline-block rounded-full border border-black/10", className ?? "size-4")} style={{ background: hex }} />;
}

function ColorGroup({ legend, name, defaults, multiple }: { legend: string; name: string; defaults: string[]; multiple?: boolean }) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-sm font-medium">{legend}</legend>
      <div className="grid grid-cols-8 gap-2">
        {COLORS.map((c) => (
          <label key={c.id} className="flex cursor-pointer items-center justify-center" title={c.label}>
            <input type={multiple ? "checkbox" : "radio"} name={name} value={c.id} defaultChecked={defaults.includes(c.id)} className="peer sr-only" aria-label={c.label} />
            <span
              aria-hidden
              className="size-9 rounded-full border border-black/10 ring-offset-2 ring-offset-surface transition peer-checked:ring-2 peer-checked:ring-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-accent"
              style={{ background: c.hex }}
            />
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Manual classification (D28): every field is the user's own statement, nothing is inferred. */
export function WardrobeFields({ item, presetType }: { item?: WardrobeItem; presetType?: string }) {
  return (
    <>
      <Field label="Nome" name="name" placeholder="Es. Giacca di jeans" defaultValue={item?.name} required />
      {presetType ? (
        <input type="hidden" name="type" value={presetType} />
      ) : (
        <ChipGroup legend="Tipo" name="type" options={CLOTHING_TYPES} defaults={[item?.type ?? "top"]} />
      )}
      <ColorGroup legend="Colore principale" name="primary_color" defaults={item?.primary_color ? [item.primary_color] : []} />
      <details className="rounded-2xl border border-border" open={Boolean(item?.secondary_colors.length)}>
        <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-medium">Altri colori</summary>
        <div className="border-t border-border p-3">
          <ColorGroup legend="Colori secondari (fino a 5)" name="secondary_colors" defaults={item?.secondary_colors ?? []} multiple />
        </div>
      </details>
      <ChipGroup legend="Stagioni" name="seasons" options={SEASONS} defaults={item?.seasons ?? []} multiple />
      <div className="grid grid-cols-2 gap-3">
        <SelectField
          label="Fantasia"
          name="pattern"
          defaultValue={item?.pattern ?? ""}
          options={[{ value: "", label: "—" }, ...PATTERNS.map((p) => ({ value: p.id, label: p.label }))]}
        />
        <SelectField
          label="Stile"
          name="formality"
          defaultValue={item?.formality ?? ""}
          options={[{ value: "", label: "—" }, ...FORMALITIES.map((f) => ({ value: f.id, label: f.label }))]}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Marca" name="brand" defaultValue={item?.brand} />
        <Field label="Taglia" name="size" defaultValue={item?.size} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Dettaglio" name="subtype" placeholder="Es. camicia, sneakers" defaultValue={item?.subtype} />
        <Field label="Materiale" name="material" placeholder="Es. cotone" defaultValue={item?.material} />
      </div>
      <Field label="Etichette" name="tags" placeholder="Es. ufficio, preferito" defaultValue={item?.tags.join(", ")} hint="Separate da virgole." />
      <Field label="Note" name="notes" defaultValue={item?.notes} multiline />
      <VisibilityField defaultValue={item?.visibility} />
    </>
  );
}
