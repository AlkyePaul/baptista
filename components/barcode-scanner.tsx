"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/icons";
import { buttonClass, cx } from "@/components/ui";
import { acceptReading, PRODUCT_FORMATS } from "@/lib/barcode";

type Detector = { detect(source: ImageBitmapSource): Promise<Array<{ rawValue: string; format: string }>> };
type DetectorClass = {
  new (options: { formats: string[] }): Detector;
  getSupportedFormats(): Promise<readonly string[]>;
};

const SCAN_INTERVAL_MS = 200;
/** WebAssembly served by Baptista (scripts/copy-zxing.mjs): no CDN, nothing leaves the phone. */
const WASM_PATH = "/zxing/zxing_reader.wasm";

let detectorPromise: Promise<Detector> | null = null;

/**
 * The browser's own BarcodeDetector when it reads product codes (Chrome on Android); otherwise
 * the zxing-wasm ponyfill (Safari/iPhone, desktop). Decoding is always local to the device.
 */
function loadDetector(): Promise<Detector> {
  detectorPromise ??= (async () => {
    const native = (globalThis as { BarcodeDetector?: DetectorClass }).BarcodeDetector;
    if (native) {
      try {
        const supported = await native.getSupportedFormats();
        if (supported.includes("ean_13")) return new native({ formats: PRODUCT_FORMATS.filter((f) => supported.includes(f)) });
      } catch {
        // fall through to the ponyfill
      }
    }
    const { BarcodeDetector, prepareZXingModule } = await import("barcode-detector/ponyfill");
    prepareZXingModule({
      overrides: { locateFile: (path: string, prefix: string) => (path.endsWith(".wasm") ? WASM_PATH : prefix + path) },
    });
    return new BarcodeDetector({ formats: [...PRODUCT_FORMATS] }) as unknown as Detector;
  })();
  detectorPromise.catch(() => {
    detectorPromise = null;
  });
  return detectorPromise;
}

function cameraMessage(error: unknown): string {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "Baptista non ha il permesso di usare la fotocamera. Consentilo nelle impostazioni del browser, oppure scatta una foto del codice.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "Nessuna fotocamera disponibile. Puoi scattare una foto del codice o scriverlo a mano.";
  if (name === "NotReadableError") return "La fotocamera è usata da un'altra app. Chiudila e riprova.";
  return "Non riesco ad avviare la fotocamera. Puoi scattare una foto del codice o scriverlo a mano.";
}

/**
 * Full-screen camera reader for product barcodes. A code is accepted after two equal readings
 * with a valid check digit; the video never leaves the device and the stream stops on close.
 */
export function BarcodeScanner({ onDetected, onClose }: { onDetected: (code: string) => void; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState("Avvio la fotocamera…");
  const [failed, setFailed] = useState(false);
  const callbacks = useRef({ onDetected, onClose });
  useEffect(() => {
    callbacks.current = { onDetected, onClose };
  });

  useEffect(() => {
    if (dialog.current && !dialog.current.open) dialog.current.showModal();
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    let last: string | null = null;

    const done = (code: string) => {
      stopped = true;
      callbacks.current.onDetected(code);
    };

    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new DOMException("", "NotFoundError");
        const [detector, media] = await Promise.all([
          loadDetector(),
          navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } }, audio: false }),
        ]);
        if (stopped || !video.current) {
          media.getTracks().forEach((t) => t.stop()); // closed while the camera was starting
          return;
        }
        stream = media;
        video.current.srcObject = media;
        await video.current.play();
        setStatus("Inquadra il codice a barre dentro il riquadro.");
        const tick = async () => {
          if (stopped || !video.current) return;
          if (video.current.readyState >= 2) {
            try {
              for (const hit of await detector.detect(video.current)) {
                const code = acceptReading(hit.format, hit.rawValue);
                if (!code) continue;
                if (code === last) return done(code);
                last = code;
              }
            } catch {
              // a frame that cannot be read: try the next one
            }
          }
          timer = setTimeout(tick, SCAN_INTERVAL_MS);
        };
        tick();
      } catch (error) {
        if (stopped) return;
        setFailed(true);
        setStatus(cameraMessage(error));
      }
    }
    start();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  /** Fallback: a still photo of the code, decoded on the device. */
  async function fromPhoto(file: File | undefined) {
    if (!file) return;
    setStatus("Leggo la foto…");
    try {
      const [detector, bitmap] = await Promise.all([loadDetector(), createImageBitmap(file)]);
      const hits = await detector.detect(bitmap);
      bitmap.close();
      const code = hits.map((h) => acceptReading(h.format, h.rawValue)).find(Boolean);
      if (code) return callbacks.current.onDetected(code);
      setStatus("Nessun codice a barre leggibile nella foto. Riprova più da vicino, con il codice dritto e ben illuminato.");
    } catch {
      setStatus("Non riesco a leggere questa foto. Riprova o scrivi il codice a mano.");
    }
  }

  return (
    <dialog
      ref={dialog}
      aria-label="Scansiona codice a barre"
      onCancel={(e) => {
        e.preventDefault();
        callbacks.current.onClose();
      }}
      className="m-0 h-dvh max-h-none w-full max-w-none bg-black p-0 text-white backdrop:bg-black"
    >
      <div className="relative flex h-full flex-col">
        <video ref={video} playsInline muted className={cx("absolute inset-0 h-full w-full object-cover", failed && "hidden")} />
        {/* Viewfinder: wide and short, like a product barcode. */}
        {!failed ? (
          <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-36 w-[80%] max-w-sm rounded-2xl border-2 border-white/90 shadow-[0_0_0_100vmax_rgba(0,0,0,0.45)]" />
          </div>
        ) : null}
        <div className="relative mt-auto flex flex-col gap-3 bg-gradient-to-t from-black/80 to-transparent p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))]">
          <p role="status" className="text-center text-sm">
            {status}
          </p>
          <div className="flex gap-2">
            <label className={cx(buttonClass.secondary, "flex-1 cursor-pointer px-3 text-sm")}>
              <Icon name="camera" className="size-5" />
              Foto del codice
              <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => fromPhoto(e.target.files?.[0])} />
            </label>
            <button type="button" onClick={() => callbacks.current.onClose()} className={cx(buttonClass.primary, "flex-1")}>
              Annulla
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
