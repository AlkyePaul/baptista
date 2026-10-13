import "server-only";

import sharp from "sharp";
import { DomainError } from "@/lib/errors";
import { MAX_PIXELS, MAX_UPLOAD_BYTES, sniffImage, type ImageMime } from "@/lib/image-check";

/**
 * Validates an uploaded image by its real bytes (not the declared type), size and pixels
 * (SECURITY.md «Immagini e storage»). Decoding afterwards keeps sharp's own pixel limit as a
 * second guard: pass `limitInputPixels: MAX_PIXELS`.
 */
export async function checkImage(file: File): Promise<{ bytes: Uint8Array; mime: ImageMime }> {
  if (file.size === 0) throw new DomainError("image_invalid");
  if (file.size > MAX_UPLOAD_BYTES) throw new DomainError("image_too_large");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffImage(bytes);
  if (kind === "heic") throw new DomainError("image_heic");
  if (!kind) throw new DomainError("image_invalid");
  let width = 0;
  let height = 0;
  try {
    // Header only (no decode): gives the precise error before any pixel work.
    ({ width = 0, height = 0 } = await sharp(bytes, { limitInputPixels: false }).metadata());
  } catch {
    throw new DomainError("image_invalid");
  }
  if (!width || !height) throw new DomainError("image_invalid");
  if (width * height > MAX_PIXELS) throw new DomainError("image_too_large");
  return { bytes, mime: kind };
}
