import { strict as assert } from "node:assert";
import { test } from "node:test";
import sharp from "sharp";
import { DomainError } from "@/lib/errors";
import { MAX_UPLOAD_BYTES, sniffImage } from "@/lib/image-check";
import { parseTags, seasonOf } from "@/lib/wardrobe";
import { preparePhoto } from "./wardrobe";

const file = (bytes: Uint8Array | Buffer, type = "image/jpeg") => new File([new Uint8Array(bytes)], "x", { type });
async function code(promise: Promise<unknown>) {
  try {
    await promise;
    return "ok";
  } catch (error) {
    return error instanceof DomainError ? error.code : String(error);
  }
}

test("sniffing trusts bytes, not names or declared types", () => {
  const pad = (head: number[]) => new Uint8Array([...head, ...new Array(16).fill(0)]);
  assert.equal(sniffImage(pad([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
  assert.equal(sniffImage(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "image/png");
  assert.equal(sniffImage(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ")), "image/webp");
  assert.equal(sniffImage(new TextEncoder().encode("\0\0\0\x18ftypheic\0\0\0\0")), "heic");
  assert.equal(sniffImage(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'>")), null);
  assert.equal(sniffImage(new Uint8Array([0xff, 0xd8])), null);
});

test("wardrobe helpers: seasons and tags", () => {
  assert.equal(seasonOf("2026-12-01"), "winter");
  assert.equal(seasonOf("2026-02-28"), "winter");
  assert.equal(seasonOf("2026-03-01"), "spring");
  assert.equal(seasonOf("2026-08-31"), "summer");
  assert.equal(seasonOf("2026-10-10"), "autumn");
  assert.deepEqual(parseTags(" Ufficio, preferito ,ufficio,, "), ["ufficio", "preferito"]);
  assert.equal(parseTags(Array.from({ length: 30 }, (_, i) => `t${i}`).join(",")).length, 20);
});

test("photos: real images pass, the thumbnail is rotated, small and without EXIF", async () => {
  // 1200x800 JPEG with EXIF orientation 6 (rotate 90°) and an artist tag.
  const jpeg = await sharp({ create: { width: 1200, height: 800, channels: 3, background: "#3366aa" } })
    .jpeg()
    .withMetadata({ orientation: 6, exif: { IFD0: { Artist: "Anna" } } })
    .toBuffer();
  assert.ok((await sharp(jpeg).metadata()).exif, "fixture carries EXIF");
  const prepared = await preparePhoto(file(jpeg));
  assert.equal(prepared.mime, "image/jpeg");
  const thumb = await sharp(prepared.thumb).metadata();
  assert.equal(thumb.format, "webp");
  assert.equal(thumb.exif, undefined, "no EXIF in the derivative");
  assert.deepEqual([thumb.width, thumb.height], [533, 800], "rotated by orientation, fitted in 800 px");
});

test("photos: fake, empty, HEIC, oversize and too many pixels are rejected", async () => {
  assert.equal(await code(preparePhoto(file(new TextEncoder().encode("GIF89a not really an image at all"), "image/jpeg"))), "image_invalid");
  assert.equal(await code(preparePhoto(file(new Uint8Array()))), "image_invalid");
  assert.equal(await code(preparePhoto(file(new TextEncoder().encode("\0\0\0\x18ftypheic\0\0\0\0mif1"), "image/heic"))), "image_heic");
  // JPEG header followed by garbage: sniffing passes, decoding must fail.
  assert.equal(await code(preparePhoto(file(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, ...new Array(64).fill(7)])))), "image_invalid");
  const big = new Uint8Array(MAX_UPLOAD_BYTES + 1);
  big.set([0xff, 0xd8, 0xff, 0xe0]);
  assert.equal(await code(preparePhoto(file(big))), "image_too_large");
  const huge = await sharp({ create: { width: 5000, height: 4100, channels: 3, background: "#000" } }).png({ compressionLevel: 9 }).toBuffer();
  assert.equal(await code(preparePhoto(file(huge, "image/png"))), "image_too_large");
});
