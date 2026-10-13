"use client";

import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { BgRemovalPipeline } from "@/components/bg-removal-pipeline";
import { SubmitButton } from "@/components/forms";
import { Icon } from "@/components/icons";
import { PhotoPicker } from "@/components/photo-picker";
import { buttonClass, cx } from "@/components/ui";
import { WardrobeFields } from "@/components/wardrobe";
import { isBgRemovalAvailable } from "@/lib/background-removal";
import { initialActionState, type ActionState } from "@/lib/errors";
import { createWardrobeItemAction } from "@/app/actions/wardrobe";

type Step = "photo" | "processing" | "review" | "fields";

type Props = {
  /** Pre-selected clothing type from the URL param. */
  type: string;
  /** Optional expense ID for C5 integration. */
  expenseId?: string | null;
  /** Expense info text (if linking from a purchase). */
  expenseInfo?: string | null;
};

/** The longest side sent to the server (same as PhotoPicker). */
const MAX_SIDE = 2048;
const QUALITY = 0.88;

async function downsize(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", QUALITY));
    if (!blob) return file;
    return new File([blob], "foto.jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export function WardrobeAddForm({ type, expenseId, expenseInfo }: Props) {
  const [step, setStep] = useState<Step>("photo");
  const [originalFile, setOriginalFile] = useState<File | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [processedBlob, setProcessedBlob] = useState<Blob | null>(null);
  const [processedUrl, setProcessedUrl] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const processedInputRef = useRef<HTMLInputElement>(null);

  const bgAvailable = isBgRemovalAvailable();

  // Clean up blob URLs on unmount
  useEffect(() => {
    return () => {
      if (originalUrl) URL.revokeObjectURL(originalUrl);
      if (processedUrl) URL.revokeObjectURL(processedUrl);
    };
  }, [originalUrl, processedUrl]);

  const handlePhotoPicked = useCallback(
    async (file: File) => {
      const downsized = await downsize(file);
      setOriginalFile(downsized);
      const url = URL.createObjectURL(downsized);
      setOriginalUrl(url);

      if (bgAvailable) {
        setStep("processing");
      } else {
        setStep("fields");
      }
    },
    [bgAvailable],
  );

  const handleProcessingComplete = useCallback(
    (processed: Blob | null) => {
      setProcessedBlob(processed);
      if (processed) {
        const url = URL.createObjectURL(processed);
        setProcessedUrl(url);
      }
      setStep("fields");
    },
    [],
  );

  const handleChangePhoto = useCallback(() => {
    setOriginalFile(null);
    if (originalUrl) URL.revokeObjectURL(originalUrl);
    setOriginalUrl(null);
    setProcessedBlob(null);
    if (processedUrl) URL.revokeObjectURL(processedUrl);
    setProcessedUrl(null);
    setStep("photo");
  }, [originalUrl, processedUrl]);

  const [state, formAction] = useActionState(
    async (_: ActionState, formData: FormData) => {
      // Attach the photo file and processed blob to the FormData
      if (originalFile) {
        formData.set("photo", originalFile);
      }
      if (processedBlob) {
        formData.set("processed", new File([processedBlob], "processed.png", { type: "image/png" }));
      }
      formData.set("type", type);
      if (expenseId) {
        formData.set("expense_id", expenseId);
      }
      return createWardrobeItemAction(_, formData);
    },
    initialActionState,
  );

  if (step === "photo") {
    return (
      <div className="flex flex-col gap-4">
        <PhotoStep onPhotoPicked={handlePhotoPicked} />
        {/* Allow skipping photo entirely */}
        <button type="button" className={cx(buttonClass.ghost)} onClick={() => setStep("fields")}>
          Continua senza foto
        </button>
      </div>
    );
  }

  if (step === "processing" && originalFile && originalUrl) {
    return (
      <BgRemovalPipeline
        originalBlob={originalFile}
        originalUrl={originalUrl}
        onComplete={handleProcessingComplete}
        onChangePhoto={handleChangePhoto}
      />
    );
  }

  // Fields step
  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-4" noValidate>
      {expenseInfo ? (
        <p className="rounded-xl bg-accent/10 px-3 py-2 text-sm">{expenseInfo}</p>
      ) : null}

      {/* Photo preview */}
      {originalUrl ? (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Foto</span>
          <div className="relative flex aspect-[4/5] items-center justify-center overflow-hidden rounded-2xl border border-border bg-surface">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={processedUrl ?? originalUrl} alt="Anteprima" className="h-full w-full object-contain" />
            {processedBlob ? (
              <span className="absolute top-2 right-2 rounded-full bg-accent/90 px-2 py-0.5 text-xs font-medium text-on-accent">
                Sfondo rimosso
              </span>
            ) : null}
          </div>
          <button type="button" className={cx(buttonClass.ghost, "self-start")} onClick={handleChangePhoto}>
            Cambia foto
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Foto</span>
          <div className="flex aspect-[4/5] items-center justify-center overflow-hidden rounded-2xl border border-dashed border-border bg-surface">
            <span className="flex flex-col items-center gap-2 text-sm text-muted">
              <Icon name="camera" className="size-10" />
              Nessuna foto
            </span>
          </div>
          <button type="button" className={cx(buttonClass.ghost, "self-start")} onClick={() => setStep("photo")}>
            Aggiungi foto
          </button>
        </div>
      )}

      {/* Hidden inputs for type/expense */}
      <input type="hidden" name="type" value={type} />
      {expenseId ? <input type="hidden" name="expense_id" value={expenseId} /> : null}

      <WardrobeFields presetType={type} />

      {!state.ok && state.message ? (
        <p role="alert" className="text-sm text-danger">{state.message}</p>
      ) : null}
      {state.fieldErrors ? (
        Object.entries(state.fieldErrors).map(([field, msg]) => (
          <p key={field} role="alert" className="text-sm text-danger">{msg}</p>
        ))
      ) : null}

      <SubmitButton pendingLabel="Carico la foto…">Salva capo</SubmitButton>
    </form>
  );
}

/** Isolated photo selection step that doesn't need a form. */
function PhotoStep({ onPhotoPicked }: { onPhotoPicked: (file: File) => void }) {
  const [busy, setBusy] = useState(false);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    onPhotoPicked(file);
  }

  const pickerClass = cx(buttonClass.secondary, "flex-1 cursor-pointer px-3 text-sm");
  return (
    <div className="flex flex-col gap-3">
      <span className="text-sm font-medium">Foto</span>
      <div className="flex aspect-[4/5] items-center justify-center overflow-hidden rounded-2xl border border-dashed border-border bg-surface">
        <span className="flex flex-col items-center gap-2 text-sm text-muted">
          <Icon name="camera" className="size-10" />
          Nessuna foto
        </span>
      </div>
      <div className="flex gap-2">
        <label className={pickerClass}>
          <Icon name="camera" className="size-5" />
          Scatta
          <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} disabled={busy} />
        </label>
        <label className={pickerClass}>
          Galleria
          <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/*" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} disabled={busy} />
        </label>
      </div>
      <p className="text-xs text-muted">
        {busy ? "Preparo la foto…" : "JPEG, PNG o WebP. La foto resta privata: la vede solo chi può vedere il capo."}
      </p>
    </div>
  );
}
