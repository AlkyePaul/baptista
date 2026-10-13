// Serves the barcode reader's WebAssembly from Baptista itself (no CDN at runtime): copies the
// file of the installed zxing-wasm (the one barcode-detector uses) into public/zxing/.
// Runs before `dev` and `build`.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const root = join(import.meta.dirname, "..");
const require = createRequire(join(root, "node_modules", "barcode-detector", "package.json"));
const wasm = require.resolve("zxing-wasm/reader/zxing_reader.wasm");
const outDir = join(root, "public", "zxing");
mkdirSync(outDir, { recursive: true });
copyFileSync(wasm, join(outDir, "zxing_reader.wasm"));
