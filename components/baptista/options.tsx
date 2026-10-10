"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Field, VisibilityField } from "@/components/forms";
import { buttonClass, cx } from "@/components/ui";
import type { FieldSpec, OptionSpec } from "@/lib/baptista/scripts";
import { SLOTS } from "@/lib/nutrition";

/** Full-width explicit options (mockup): the first/primary one filled, the others outlined. */
export function Options({ options, onChoose, disabled }: { options: OptionSpec[]; onChoose: (option: OptionSpec) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      {options.map((option) =>
        option.kind === "link" && option.href ? (
          <Link
            key={option.id}
            href={option.href}
            onClick={() => onChoose(option)}
            className={cx(option.primary ? buttonClass.primary : buttonClass.secondary, "w-full")}
          >
            {option.label}
          </Link>
        ) : (
          <button
            key={option.id}
            type="button"
            disabled={disabled}
            onClick={() => onChoose(option)}
            className={cx(option.primary ? buttonClass.primary : buttonClass.secondary, "w-full")}
          >
            {option.label}
          </button>
        ),
      )}
    </div>
  );
}

/** Typed mini-form inside the conversation (no free text is interpreted). */
export function MiniForm({
  form,
  onSubmit,
  onCancel,
  disabled,
}: {
  form: NonNullable<OptionSpec["form"]>;
  onSubmit: (payload: Record<string, string | string[]>) => void;
  onCancel: () => void;
  disabled?: boolean;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload: Record<string, string | string[]> = {};
    for (const [key, value] of new FormData(event.currentTarget).entries()) {
      if (typeof value !== "string") continue;
      const prev = payload[key];
      payload[key] = prev === undefined ? value : Array.isArray(prev) ? [...prev, value] : [prev, value];
    }
    onSubmit(payload);
  }
  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-3" noValidate>
      {form.fields.map((field) => (
        <FormField key={field.name} field={field} />
      ))}
      <div className="flex gap-2">
        <button type="submit" disabled={disabled} className={cx(buttonClass.primary, "flex-1")}>
          {disabled ? "…" : form.button}
        </button>
        <button type="button" onClick={onCancel} className={buttonClass.ghost}>
          Annulla
        </button>
      </div>
    </form>
  );
}

function FormField({ field }: { field: FieldSpec }) {
  switch (field.kind) {
    case "money":
      return <Field label={field.label} name={field.name} inputMode="decimal" placeholder="0,00" hint={field.hint} />;
    case "number":
      return <Field label={field.label} name={field.name} inputMode="decimal" defaultValue={field.defaultValue} hint={field.hint} />;
    case "date":
      return <Field label={field.label} name={field.name} type="date" defaultValue={field.defaultValue} />;
    case "text":
      return <Field label={field.label} name={field.name} hint={field.hint} />;
    case "visibility":
      return <VisibilityField defaultValue={field.defaultValue} />;
    case "slot":
      return <SlotField name={field.name} label={field.label} defaultValue={field.defaultValue} />;
    case "checklist":
      return <Checklist name={field.name} items={field.items} />;
  }
}

function SlotField({ name, label, defaultValue }: { name: string; label: string; defaultValue: string }) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-sm font-medium">{label}</legend>
      <div className="grid grid-cols-4 gap-1">
        {SLOTS.map((s) => (
          <label
            key={s.id}
            className="flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-border text-xs has-checked:border-accent has-checked:bg-accent/10 has-checked:text-accent"
          >
            <input type="radio" name={name} value={s.id} defaultChecked={s.id === defaultValue} className="sr-only" />
            {s.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function Checklist({ name, items }: { name: string; items: Array<{ value: string; label: string }> }) {
  const [checked, setChecked] = useState<Set<string>>(new Set(items.map((i) => i.value)));
  return (
    <ul className="flex flex-col">
      {items.map((item) => (
        <li key={item.value}>
          <label className="flex min-h-11 cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              name={name}
              value={item.value}
              checked={checked.has(item.value)}
              onChange={() =>
                setChecked((prev) => {
                  const next = new Set(prev);
                  if (next.has(item.value)) next.delete(item.value);
                  else next.add(item.value);
                  return next;
                })
              }
              className="size-5 accent-[var(--accent)]"
            />
            {item.label}
          </label>
        </li>
      ))}
    </ul>
  );
}
