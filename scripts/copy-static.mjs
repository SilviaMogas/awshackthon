// Copies static assets (HTML, CSS, i18n JSON, config) into dist/public so the
// zero-dependency server can serve them alongside the compiled client JS.
import { cp, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "src", "client", "public");
const dest = join(root, "dist", "public");

async function main() {
  if (!existsSync(dest)) await mkdir(dest, { recursive: true });
  if (existsSync(src)) {
    await cp(src, dest, { recursive: true });
    console.log(`[copy-static] copied ${src} -> ${dest}`);
  } else {
    console.warn(`[copy-static] no static source at ${src}`);
  }
}

main().catch((e) => {
  console.error("[copy-static] failed:", e);
  process.exit(1);
});
