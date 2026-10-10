/**
 * Upload limits and real-content sniffing (SECURITY.md «Immagini e storage»): the declared MIME
 * type and file name are never trusted, only the leading bytes.
 */

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_PIXELS = 20_000_000;

export type ImageMime = "image/jpeg" | "image/png" | "image/webp";
export type Sniffed = ImageMime | "heic" | null;

const startsWith = (bytes: Uint8Array, sig: number[], offset = 0) => sig.every((b, i) => bytes[offset + i] === b);
const ascii = (bytes: Uint8Array, from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));

export function sniffImage(bytes: Uint8Array): Sniffed {
  if (bytes.length < 12) return null;
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return "image/webp";
  // ISO-BMFF "ftyp" box with a HEIF brand: recognised only to give a clear message.
  if (ascii(bytes, 4, 8) === "ftyp" && /^(heic|heix|hevc|mif1|msf1|heim|heis)$/.test(ascii(bytes, 8, 12))) return "heic";
  return null;
}

export const EXTENSION: Record<ImageMime, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
