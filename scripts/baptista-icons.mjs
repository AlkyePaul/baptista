// Derives the WebP expression icons served by the app (B-1) from the original PNGs, which stay
// as sources. Run: node scripts/baptista-icons.mjs
import { readdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const dir = join(import.meta.dirname, "..", "public", "icons", "baptista-icons");
for (const file of readdirSync(dir).filter((f) => /^baptista-[a-z]+\.png$/.test(f))) {
  for (const size of [192, 384]) {
    const out = join(dir, file.replace(".png", `-${size}.webp`));
    await sharp(join(dir, file)).resize({ width: size, height: size, fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ quality: 82, alphaQuality: 90 }).toFile(out);
    console.log(out);
  }
}
