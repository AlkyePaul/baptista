"use client";

/**
 * Client-side background removal via @imgly/background-removal (AGPL-3.0).
 * See docs/architecture/IMGLY_LICENSE.md for license obligations.
 *
 * The WASM model is downloaded once and cached by the browser; subsequent calls are fast.
 * GPU acceleration is used when available, with automatic CPU fallback.
 */

export type BgRemovalProgress = {
  phase: "download" | "process" | "done" | "error";
  progress: number; // 0-1
  label: string; // Italian
};

const LABELS: Record<string, string> = {
  download: "Scarico il modello…",
  process: "Rimuovo lo sfondo…",
  done: "Fatto!",
  error: "Errore durante l'elaborazione.",
};

/** Cached dynamic import so the ~5 MB WASM bundle is loaded only once per session. */
let modulePromise: Promise<typeof import("@imgly/background-removal")> | null = null;

function getModule() {
  if (!modulePromise) {
    modulePromise = import("@imgly/background-removal");
  }
  return modulePromise;
}

/** Feature gate: env var + browser check. */
export function isBgRemovalAvailable(): boolean {
  if (typeof window === "undefined") return false;
  const flag = process.env.NEXT_PUBLIC_BG_REMOVAL_ENABLED;
  // Default to "true" when the env var is not set (dev convenience).
  return flag !== "false";
}

/**
 * Removes the background from an image blob and returns a transparent PNG.
 * Progress is reported via the callback with Italian labels.
 */
export async function removeBackground(
  imageBlob: Blob,
  onProgress: (p: BgRemovalProgress) => void,
): Promise<Blob> {
  onProgress({ phase: "download", progress: 0, label: LABELS.download });

  const mod = await getModule();

  const result = await mod.removeBackground(imageBlob, {
    progress: (key: string, current: number, total: number) => {
      const ratio = total > 0 ? current / total : 0;
      if (key.includes("fetch") || key.includes("download")) {
        onProgress({ phase: "download", progress: ratio, label: LABELS.download });
      } else {
        onProgress({ phase: "process", progress: ratio, label: LABELS.process });
      }
    },
    output: { format: "image/png" as const },
  });

  onProgress({ phase: "done", progress: 1, label: LABELS.done });
  return result;
}
