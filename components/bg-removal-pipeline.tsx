"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { removeBackground, type BgRemovalProgress } from "@/lib/background-removal";
import { normalizeGarment } from "@/lib/image-normalize";
import { buttonClass, cx, ProgressBar } from "@/components/ui";

type PipelineState = "idle" | "processing" | "review" | "error";

type Props = {
  /** The original photo blob to process. */
  originalBlob: Blob;
  /** Original photo URL for before/after display. */
  originalUrl: string;
  /** Called with the processed PNG blob (or null if skipped). */
  onComplete: (processed: Blob | null) => void;
  /** Called when the user wants to pick a different photo. */
  onChangePhoto: () => void;
};

export function BgRemovalPipeline({ originalBlob, originalUrl, onComplete, onChangePhoto }: Props) {
  const [state, setState] = useState<PipelineState>("idle");
  const [progress, setProgress] = useState<BgRemovalProgress>({ phase: "download", progress: 0, label: "Avvio…" });
  const [processedUrl, setProcessedUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const processedBlobRef = useRef<Blob | null>(null);

  const processImage = useCallback(async () => {
    setState("processing");
    setProgress({ phase: "download", progress: 0, label: "Avvio…" });
    setErrorMessage(null);

    try {
      const bgRemoved = await removeBackground(originalBlob, setProgress);
      const normalized = await normalizeGarment(bgRemoved);
      processedBlobRef.current = normalized;
      const url = URL.createObjectURL(normalized);
      setProcessedUrl(url);
      setState("review");
    } catch (error) {
      console.error("[baptista] bg removal failed:", error);
      setErrorMessage(error instanceof Error ? error.message : "Errore sconosciuto.");
      setState("error");
    }
  }, [originalBlob]);

  // Start processing on mount; cleanup blob URLs on unmount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const bgRemoved = await removeBackground(originalBlob, (p) => { if (!cancelled) setProgress(p); });
        if (cancelled) return;
        const normalized = await normalizeGarment(bgRemoved);
        if (cancelled) return;
        processedBlobRef.current = normalized;
        const url = URL.createObjectURL(normalized);
        setProcessedUrl(url);
        setState("review");
      } catch (error) {
        if (cancelled) return;
        console.error("[baptista] bg removal failed:", error);
        setErrorMessage(error instanceof Error ? error.message : "Errore sconosciuto.");
        setState("error");
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  // Cleanup blob URLs on unmount.
  useEffect(() => () => {
    if (processedUrl) URL.revokeObjectURL(processedUrl);
  }, [processedUrl]);

  if (state === "idle" || state === "processing") {
    return (
      <div className="flex flex-col gap-3">
        <div className="relative flex aspect-[4/5] items-center justify-center overflow-hidden rounded-2xl border border-border bg-surface">
          {/* eslint-disable-next-line @next/next/no-img-element -- local blob URL */}
          <img src={originalUrl} alt="" className="h-full w-full object-contain opacity-50" />
          <div className="absolute inset-x-4 bottom-4 flex flex-col gap-2 rounded-xl bg-background/90 p-3 backdrop-blur-sm">
            <p className="text-sm font-medium">{progress.label}</p>
            <ProgressBar value={progress.progress * 100} label={progress.label} />
          </div>
        </div>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex aspect-[4/5] items-center justify-center overflow-hidden rounded-2xl border border-border bg-surface">
          {/* eslint-disable-next-line @next/next/no-img-element -- local blob URL */}
          <img src={originalUrl} alt="" className="h-full w-full object-contain" />
        </div>
        <p className="text-sm text-danger">{errorMessage ?? "Errore durante l'elaborazione."}</p>
        <div className="flex gap-2">
          <button type="button" className={cx(buttonClass.secondary, "flex-1")} onClick={processImage}>
            Riprova
          </button>
          <button type="button" className={cx(buttonClass.secondary, "flex-1")} onClick={() => onComplete(null)}>
            Salta
          </button>
          <button type="button" className={cx(buttonClass.ghost, "flex-1")} onClick={onChangePhoto}>
            Cambia foto
          </button>
        </div>
      </div>
    );
  }

  // Review state: before/after comparison
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted">Originale</span>
          <div className="flex aspect-[4/5] items-center justify-center overflow-hidden rounded-xl border border-border bg-surface">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={originalUrl} alt="Originale" className="h-full w-full object-contain" />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted">Elaborata</span>
          <div className="checkerboard flex aspect-[4/5] items-center justify-center overflow-hidden rounded-xl border border-border">
            {processedUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={processedUrl} alt="Sfondo rimosso" className="h-full w-full object-contain" />
            ) : null}
          </div>
        </div>
      </div>
      <div className="flex gap-2">
        <button type="button" className={cx(buttonClass.primary, "flex-1")} onClick={() => onComplete(processedBlobRef.current)}>
          Conferma
        </button>
        <button type="button" className={cx(buttonClass.secondary, "flex-1")} onClick={processImage}>
          Riprova
        </button>
      </div>
      <div className="flex gap-2">
        <button type="button" className={cx(buttonClass.ghost, "flex-1")} onClick={() => onComplete(null)}>
          Salta
        </button>
        <button type="button" className={cx(buttonClass.ghost, "flex-1")} onClick={onChangePhoto}>
          Cambia foto
        </button>
      </div>
      <style>{`
        .checkerboard {
          background-image: linear-gradient(45deg, #e0e0e0 25%, transparent 25%),
            linear-gradient(-45deg, #e0e0e0 25%, transparent 25%),
            linear-gradient(45deg, transparent 75%, #e0e0e0 75%),
            linear-gradient(-45deg, transparent 75%, #e0e0e0 75%);
          background-size: 16px 16px;
          background-position: 0 0, 0 8px, 8px -8px, -8px 0px;
        }
      `}</style>
    </div>
  );
}
