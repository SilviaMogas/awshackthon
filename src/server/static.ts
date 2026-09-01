/** Serves static assets from dist/public (HTML, CSS, compiled client JS). */
import { readFile } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import { join, extname, resolve } from "node:path";
import type { ServerResponse } from "node:http";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
};

export async function serveStatic(
  publicDir: string,
  pathname: string,
  res: ServerResponse,
): Promise<boolean> {
  // Normalise and prevent path traversal.
  const rel = pathname === "/" ? "/index.html" : pathname;
  const target = resolve(join(publicDir, rel));
  if (!target.startsWith(resolve(publicDir))) {
    return false;
  }
  if (!existsSync(target) || !statSync(target).isFile()) {
    return false;
  }
  const ext = extname(target).toLowerCase();
  const type = MIME[ext] ?? "application/octet-stream";
  const data = await readFile(target);
  res.writeHead(200, {
    "Content-Type": type,
    "Cache-Control": ext === ".html" ? "no-store" : "public, max-age=300",
  });
  res.end(data);
  return true;
}


/** SPA fallback: serve index.html for unknown non-API routes. */
export async function serveStaticFallback(
  publicDir: string,
  res: ServerResponse,
): Promise<void> {
  const index = join(publicDir, "index.html");
  if (existsSync(index)) {
    const data = await readFile(index);
    res.writeHead(200, { "Content-Type": MIME[".html"], "Cache-Control": "no-store" });
    res.end(data);
    return;
  }
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not found");
}
