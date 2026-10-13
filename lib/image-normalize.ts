"use client";

/**
 * Canvas-based garment normalization: crops to the non-transparent bounding box, then centers
 * on a square transparent canvas with padding. No external libraries — pure Canvas API.
 */

/** Finds the bounding box of non-transparent pixels. Returns null if fully transparent. */
export function findBounds(
  data: Uint8ClampedArray,
  w: number,
  h: number,
): { top: number; left: number; bottom: number; right: number } | null {
  let top = h;
  let left = w;
  let bottom = 0;
  let right = 0;
  let found = false;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const alpha = data[(y * w + x) * 4 + 3];
      if (alpha > 0) {
        found = true;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        if (x < left) left = x;
        if (x > right) right = x;
      }
    }
  }

  return found ? { top, left, bottom, right } : null;
}

/**
 * Crops the subject from a transparent PNG, centers it on a square canvas with ~5% padding,
 * and returns the result as a PNG blob. Never upscales.
 */
export async function normalizeGarment(pngBlob: Blob, canvasSize = 1024): Promise<Blob> {
  const bitmap = await createImageBitmap(pngBlob);
  const { width: w, height: h } = bitmap;

  // Draw to a temporary canvas to read pixel data.
  const tmpCanvas = document.createElement("canvas");
  tmpCanvas.width = w;
  tmpCanvas.height = h;
  const tmpCtx = tmpCanvas.getContext("2d")!;
  tmpCtx.drawImage(bitmap, 0, 0);
  const imageData = tmpCtx.getImageData(0, 0, w, h);

  const bounds = findBounds(imageData.data, w, h);
  if (!bounds) {
    // Fully transparent — return as-is.
    bitmap.close();
    return pngBlob;
  }

  const cropW = bounds.right - bounds.left + 1;
  const cropH = bounds.bottom - bounds.top + 1;

  // Available area after ~5% padding on each side.
  const padding = Math.round(canvasSize * 0.05);
  const available = canvasSize - padding * 2;

  // Scale to fit, never upscale.
  const scale = Math.min(1, available / cropW, available / cropH);
  const drawW = Math.round(cropW * scale);
  const drawH = Math.round(cropH * scale);

  const outCanvas = document.createElement("canvas");
  outCanvas.width = canvasSize;
  outCanvas.height = canvasSize;
  const outCtx = outCanvas.getContext("2d")!;

  // Center the cropped subject.
  const dx = Math.round((canvasSize - drawW) / 2);
  const dy = Math.round((canvasSize - drawH) / 2);

  outCtx.drawImage(bitmap, bounds.left, bounds.top, cropW, cropH, dx, dy, drawW, drawH);
  bitmap.close();

  return new Promise<Blob>((resolve) => {
    outCanvas.toBlob((blob) => resolve(blob!), "image/png");
  });
}
