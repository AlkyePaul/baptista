// Home-screen icons of the installed app, from the Baptista «confirmation» expression on the app
// background (opaque: iOS fills transparency with black). Run: node scripts/app-icons.mjs
// - app/apple-icon.png (180): iOS «Aggiungi a Home», linked by Next automatically.
// - public/icons/app/icon-{192,512}.png: manifest «any»; icon-maskable-512.png keeps Baptista
//   inside the 80% safe zone that Android masks may crop to.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const root = join(import.meta.dirname, "..");
const source = join(root, "public", "icons", "baptista-icons", "baptista-confirmation.png");
const background = "#f7f5f0"; // --background (light) in app/globals.css
const outDir = join(root, "public", "icons", "app");
mkdirSync(outDir, { recursive: true });

// The figure is a bust cut at the bottom: keep it flush with the bottom edge, centered.
async function icon(size, scale, out) {
  const inner = Math.round(size * scale);
  const figure = await sharp(source).trim().resize({ width: inner, height: inner, fit: "inside" }).toBuffer();
  const { width, height } = await sharp(figure).metadata();
  const bottom = Math.round((size - inner) / (scale < 0.8 ? 2 : 4));
  await sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: figure, left: Math.round((size - width) / 2), top: size - height - bottom }])
    .flatten({ background })
    .png({ compressionLevel: 9 })
    .toFile(out);
  console.log(out);
}

await icon(180, 0.86, join(root, "app", "apple-icon.png"));
await icon(192, 0.86, join(outDir, "icon-192.png"));
await icon(512, 0.86, join(outDir, "icon-512.png"));
await icon(512, 0.66, join(outDir, "icon-maskable-512.png"));
