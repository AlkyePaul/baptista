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

  // Enhance: lift shadows, boost brightness & saturation for a cleaner flat-lay look.
  enhancePixels(outCtx, canvasSize, canvasSize);

  return new Promise<Blob>((resolve) => {
    outCanvas.toBlob((blob) => resolve(blob!), "image/png");
  });
}

/**
 * Per-pixel enhancement applied to the normalized garment:
 * 1. Shadow lift — raises dark tones (reduces wrinkle/fold shadows)
 * 2. Brightness — subtle overall lift
 * 3. Saturation — makes colours slightly more vivid
 *
 * Only touches pixels with alpha > 0; transparent background is untouched.
 */
function enhancePixels(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;

  const SHADOW_LIFT = 28;     // max lift for pure-black pixels
  const BRIGHTNESS  = 1.06;   // multiplicative brightness
  const SAT_BOOST   = 1.18;   // saturation multiplier

  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue; // skip transparent

    let r = d[i], g = d[i + 1], b = d[i + 2];

    // 1. Shadow lift: add more to darker values, almost nothing to bright ones.
    //    curve: value += LIFT * (1 - value/255)^2
    const rr = 1 - r / 255, gr = 1 - g / 255, br = 1 - b / 255;
    r = r + SHADOW_LIFT * rr * rr;
    g = g + SHADOW_LIFT * gr * gr;
    b = b + SHADOW_LIFT * br * br;

    // 2. Brightness
    r *= BRIGHTNESS;
    g *= BRIGHTNESS;
    b *= BRIGHTNESS;

    // 3. Saturation boost (luminance-preserving)
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    r = lum + (r - lum) * SAT_BOOST;
    g = lum + (g - lum) * SAT_BOOST;
    b = lum + (b - lum) * SAT_BOOST;

    d[i]     = Math.min(255, Math.max(0, Math.round(r)));
    d[i + 1] = Math.min(255, Math.max(0, Math.round(g)));
    d[i + 2] = Math.min(255, Math.max(0, Math.round(b)));
  }

  ctx.putImageData(img, 0, 0);
}
