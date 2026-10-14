"use client";

import { createContext, useActionState, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { BarcodeScanner } from "@/components/barcode-scanner";
import { initialActionState, type ActionState } from "@/lib/errors";
import { VISIBILITY_LABELS } from "@/lib/households/permissions";
import { Icon } from "@/components/icons";
import { buttonClass, cx } from "@/components/ui";

type Action = (state: ActionState, formData: FormData) => Promise<ActionState>;

const FormStateContext = createContext<ActionState>(initialActionState);

export const ACTION_SUCCESS_EVENT = "baptista:action-success";

/** Form bound to a Server Action with inline, accessible error reporting. */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess = true,
  successMessage,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  successMessage?: boolean;
}) {
  const [state, formAction] = useActionState(action, initialActionState);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (!state.ok) return;
    if (resetOnSuccess) ref.current?.reset();
    // Lets a surrounding Modal close itself after a successful submit.
    ref.current?.dispatchEvent(new CustomEvent(ACTION_SUCCESS_EVENT, { bubbles: true }));
  }, [state, resetOnSuccess]);
  return (
    <form ref={ref} action={formAction} className={cx("flex flex-col gap-4", className)} noValidate>
      <FormStateContext.Provider value={state}>
        {children}
        <FormMessage showSuccess={successMessage} />
      </FormStateContext.Provider>
    </form>
  );
}

function FormMessage({ showSuccess }: { showSuccess?: boolean }) {
  const state = useContext(FormStateContext);
  if (!state.message || (state.ok && !showSuccess)) return null;
  return (
    <p role={state.ok ? "status" : "alert"} className={cx("text-sm", state.ok ? "text-accent" : "text-danger")}>
      {state.message}
    </p>
  );
}

const inputClass =
  "min-h-12 w-full rounded-xl border border-border bg-surface px-4 text-base outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/25 aria-invalid:border-danger";

export function Field({
  label,
  name,
  type = "text",
  defaultValue,
  placeholder,
  required,
  hint,
  autoComplete,
  inputMode,
  step,
  min,
  max,
  multiline,
  scanBarcode,
  className,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string | number | null;
  placeholder?: string;
  required?: boolean;
  hint?: string;
  autoComplete?: string;
  inputMode?: "text" | "decimal" | "numeric" | "email";
  step?: string;
  min?: string | number;
  max?: string | number;
  multiline?: boolean;
  /** A camera button that fills the field with a scanned product barcode. */
  scanBarcode?: boolean;
  className?: string;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [scanning, setScanning] = useState(false);
  const state = useContext(FormStateContext);
  const error = state.fieldErrors?.[name];
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  const common = {
    id,
    name,
    defaultValue: defaultValue ?? undefined,
    placeholder,
    required,
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy,
  };
  return (
    <div className={cx("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {multiline ? (
        <textarea {...common} rows={5} className={cx(inputClass, "py-3")} />
      ) : (
        <div className="relative">
          <input
            {...common}
            ref={input}
            type={type}
            autoComplete={autoComplete}
            inputMode={inputMode}
            step={step}
            min={min}
            max={max}
            className={cx(inputClass, scanBarcode && "pr-12")}
          />
          {scanBarcode ? (
            <button
              type="button"
              onClick={() => setScanning(true)}
              aria-label={`${label}: scansiona`}
              className="absolute top-1/2 right-0.5 flex size-11 -translate-y-1/2 items-center justify-center rounded-lg text-accent hover:bg-accent/10"
            >
              <Icon name="camera" className="size-5" />
            </button>
          ) : null}
        </div>
      )}
      {scanning ? (
        <BarcodeScanner
          onClose={() => setScanning(false)}
          onDetected={(code) => {
            setScanning(false);
            if (input.current) input.current.value = code;
          }}
        />
      ) : null}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-sm text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function SelectField({
  label,
  name,
  options,
  defaultValue,
}: {
  label: string;
  name: string;
  options: Array<{ value: string; label: string }>;
  defaultValue?: string;
}) {
  const id = useId();
  const state = useContext(FormStateContext);
  const error = state.fieldErrors?.[name];
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <select id={id} name={name} defaultValue={defaultValue} className={inputClass} aria-invalid={error ? true : undefined}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}

export function VisibilityField({ defaultValue = "private" }: { defaultValue?: "household" | "private" }) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-sm font-medium">Chi può vederlo</legend>
      <div className="grid grid-cols-2 gap-2">
        {(["private", "household"] as const).map((value) => (
          <label
            key={value}
            className="flex min-h-12 cursor-pointer items-center justify-center rounded-xl border border-border bg-surface px-3 text-sm font-medium has-checked:border-accent has-checked:bg-accent/10 has-checked:text-accent"
          >
            <input type="radio" name="visibility" value={value} defaultChecked={value === defaultValue} className="sr-only" />
            {VISIBILITY_LABELS[value]}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function CheckboxField({ label, name, defaultChecked }: { label: string; name: string; defaultChecked?: boolean }) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center gap-3">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="size-5 accent-[var(--accent)]" />
      <span>{label}</span>
    </label>
  );
}

export function SubmitButton({
  children,
  variant = "primary",
  className,
  pendingLabel = "Salvataggio…",
}: {
  children: ReactNode;
  variant?: keyof typeof buttonClass;
  className?: string;
  pendingLabel?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={cx(buttonClass[variant], className)}>
      {pending ? pendingLabel : children}
    </button>
  );
}

/**
 * Single-button action (toggle, delete, dismiss). Destructive actions ask for a second tap
 * instead of a browser dialog.
 */
export function ActionButton({
  action,
  children,
  label,
  variant = "ghost",
  confirmLabel,
  className,
}: {
  action: Action;
  children: ReactNode;
  label?: string;
  variant?: keyof typeof buttonClass;
  confirmLabel?: string;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, initialActionState);
  const [armed, setArmed] = useState(false);
  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (confirmLabel && !armed) {
          event.preventDefault();
          setArmed(true);
        }
      }}
      className="inline-flex flex-col items-end"
    >
      <SubmitButton variant={variant} className={className} pendingLabel="…">
        <span aria-label={label}>{armed && confirmLabel ? confirmLabel : children}</span>
      </SubmitButton>
      {!state.ok && state.message ? (
        <span role="alert" className="max-w-56 text-right text-xs text-danger">
          {state.message}
        </span>
      ) : null}
    </form>
  );
}

/** Calendar form fields that switch between timed and all-day events. */
export function EventTimeFields({
  defaultAllDay = false,
  defaults,
}: {
  defaultAllDay?: boolean;
  defaults: { starts_at?: string; ends_at?: string; start_date?: string; end_date?: string };
}) {
  const [allDay, setAllDay] = useState(defaultAllDay);
  return (
    <div className="flex flex-col gap-4">
      <label className="flex min-h-12 cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          name="all_day"
          checked={allDay}
          onChange={(e) => setAllDay(e.target.checked)}
          className="size-5 accent-[var(--accent)]"
        />
        <span>Tutto il giorno</span>
      </label>
      {allDay ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Dal" name="start_date" type="date" defaultValue={defaults.start_date} />
          <Field label="Al" name="end_date" type="date" defaultValue={defaults.end_date} hint="Facoltativo" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Inizio" name="starts_at" type="datetime-local" defaultValue={defaults.starts_at} />
          <Field label="Fine" name="ends_at" type="datetime-local" defaultValue={defaults.ends_at} />
        </div>
      )}
    </div>
  );
}

/** Category picker: "Nessuna" + the caller's list (system first), each with its colour. */
export function CategoryField({
  categories,
  defaultValue,
}: {
  categories: Array<{ id: string; name: string; color: string }>;
  defaultValue?: string | null;
}) {
  const state = useContext(FormStateContext);
  const error = state.fieldErrors?.category_id;
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-sm font-medium">Categoria</legend>
      <div className="flex flex-wrap gap-2">
        <label className="flex min-h-10 cursor-pointer items-center gap-2 rounded-full border border-border bg-surface px-3 text-sm has-checked:border-foreground has-checked:font-medium">
          <input type="radio" name="category_id" value="" defaultChecked={!defaultValue} className="sr-only" />
          <span aria-hidden className="size-3 rounded-full border border-dashed border-muted" />
          Nessuna
        </label>
        {categories.map((c) => (
          <label
            key={c.id}
            className="flex min-h-10 cursor-pointer items-center gap-2 rounded-full border border-border bg-surface px-3 text-sm has-checked:border-[var(--cat)] has-checked:bg-[color-mix(in_srgb,var(--cat)_14%,transparent)] has-checked:font-medium"
            style={{ ["--cat" as string]: c.color }}
          >
            <input type="radio" name="category_id" value={c.id} defaultChecked={defaultValue === c.id} className="peer sr-only" />
            <span aria-hidden className="size-3 rounded-full" style={{ backgroundColor: c.color }} />
            {c.name}
          </label>
        ))}
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </fieldset>
  );
}

/** Colour palette (radio swatches) for categories. */
export function ColorField({ colors, defaultValue }: { colors: readonly string[]; defaultValue?: string }) {
  const state = useContext(FormStateContext);
  const error = state.fieldErrors?.color;
  const initial = defaultValue ?? colors[0];
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-sm font-medium">Colore</legend>
      <div className="grid grid-cols-6 gap-2">
        {colors.map((color) => (
          <label key={color} className="flex cursor-pointer items-center justify-center">
            <input type="radio" name="color" value={color} defaultChecked={color === initial} className="peer sr-only" aria-label={color} />
            <span
              aria-hidden
              className="size-10 rounded-full ring-offset-2 ring-offset-surface transition peer-checked:ring-2 peer-checked:ring-foreground peer-focus-visible:ring-2 peer-focus-visible:ring-accent"
              style={{ backgroundColor: color }}
            />
          </label>
        ))}
      </div>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
    </fieldset>
  );
}
