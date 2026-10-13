"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { buttonClass, cx } from "@/components/ui";

/** Longest side sent to the server (D29): small enough for Vercel's 4.5 MB body limit. */
const MAX_SIDE = 2048;
const QUALITY = 0.88;

/**
 * Downsizes in the browser before upload: honours EXIF orientation, re-encodes to JPEG and so
 * drops EXIF/GPS on the device. If the browser cannot decode the file (e.g. HEIC on desktop
 * Chrome) the original is sent and the server answers with a clear message.
 */
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

const DEFAULT_HINT = "JPEG, PNG o WebP. La foto resta privata: la vede solo chi può vedere il capo.";

/** Photo field for a form: «Scatta» (camera) or «Galleria»; the resized file is what gets sent. */
export function PhotoPicker({
  name = "photo",
  currentUrl,
  label = "Foto",
  alt = "Anteprima del capo",
  hint = DEFAULT_HINT,
  tall = false,
}: {
  name?: string;
  currentUrl?: string | null;
  label?: string;
  alt?: string;
  hint?: string;
  /** Receipts are long and narrow: a taller frame. */
  tall?: boolean;
}) {
  const target = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(currentUrl ?? null);
  const [busy, setBusy] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => () => {
    if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview);
  }, [preview]);

  // The form clears the file after a successful save: clear the preview with it.
  useEffect(() => {
    const form = target.current?.form;
    if (!form) return;
    const onReset = () => {
      setPreview(currentUrl ?? null);
      setInfo(null);
    };
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, [currentUrl]);

  async function pick(file: File | undefined) {
    if (!file || !target.current) return;
    setBusy(true);
    const ready = await downsize(file);
    const transfer = new DataTransfer();
    transfer.items.add(ready);
    target.current.files = transfer.files;
    setPreview(URL.createObjectURL(ready));
    setInfo(ready === file ? null : `Foto ridotta a ${Math.round(ready.size / 1024)} KB, senza dati di posizione.`);
    setBusy(false);
  }

  const pickerClass = cx(buttonClass.secondary, "flex-1 cursor-pointer px-3 text-sm");
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium">{label}</span>
      <div className={cx("flex w-full", tall ? "aspect-[3/4] max-h-96" : "aspect-[4/5]", " items-center justify-center overflow-hidden rounded-2xl border border-dashed border-border bg-surface")}>
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- local blob or short-lived signed URL
          <img src={preview} alt={alt} className="h-full w-full object-contain" />
        ) : (
          <span className="flex flex-col items-center gap-2 text-sm text-muted">
            <Icon name="camera" className="size-10" />
            Nessuna foto
          </span>
        )}
      </div>
      <div className="flex gap-2">
        <label className={pickerClass}>
          <Icon name="camera" className="size-5" />
          Scatta
          <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
        </label>
        <label className={pickerClass}>
          Galleria
          <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/*" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
        </label>
      </div>
      <input ref={target} type="file" name={name} hidden tabIndex={-1} aria-hidden />
      <p className="text-xs text-muted" role="status">
        {busy ? "Preparo la foto…" : (info ?? hint)}
      </p>
    </div>
  );
}
