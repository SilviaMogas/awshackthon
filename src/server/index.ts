/**
 * Zero-dependency HTTP server for the Health Response Agent.
 *
 * Serves the API routes (backed by the modular services + agent orchestrator)
 * and the static SPA. Uses only Node built-ins so it runs with no npm install.
 *
 * In production this maps to: Amazon API Gateway -> AWS Lambda handlers. Each
 * route here corresponds to a Lambda handler; the Router is the API Gateway
 * integration. See README "AWS architecture".
 */
import { createServer } from "node:http";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { Router, securityHeaders } from "./http.js";
import { registerRoutes } from "./routes.js";
import { serveStatic, serveStaticFallback } from "./static.js";
import { config } from "./config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
// dist/server/index.js -> dist/public
const PUBLIC_DIR = join(__dirname, "..", "public");

const router = new Router();
registerRoutes(router);

// Simple in-memory rate limiter (placeholder for AWS WAF / API Gateway throttling).
const RATE = new Map<string, { count: number; reset: number }>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const win = 60_000;
  const max = 240;
  const entry = RATE.get(ip);
  if (!entry || now > entry.reset) {
    RATE.set(ip, { count: 1, reset: now + win });
    return false;
  }
  entry.count += 1;
  return entry.count > max;
}

const server = createServer((req, res) => {
  securityHeaders(res);
  const method = (req.method ?? "GET").toUpperCase();
  const host = (req.headers.host as string) || "localhost";
  const url = new URL(req.url ?? "/", `http://${host}`);
  const pathname = url.pathname;

  const ip =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    "local";
  if (pathname.startsWith("/api/") && rateLimited(ip)) {
    res.writeHead(429, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: { code: "RATE_LIMITED", message: "Too many requests." } }));
    return;
  }

  const query: Record<string, string> = {};
  url.searchParams.forEach((v, k) => (query[k] = v));

  if (pathname.startsWith("/api/")) {
    const matched = router.match(method, pathname);
    if (!matched) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({ ok: false, error: { code: "NOT_FOUND", message: "Route not found." } }),
      );
      return;
    }
    void Promise.resolve(
      matched.handler({ req, res, method, pathname, query, params: matched.params }),
    ).catch(() => {
      if (!res.getHeader("Content-Type")) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: { code: "INTERNAL", message: "Server error." } }));
      }
    });
    return;
  }

  // Static assets + SPA fallback (serve index.html for unknown non-API paths).
  void serveStatic(PUBLIC_DIR, pathname, res)
    .then((served) => {
      if (!served) return serveStaticFallback(PUBLIC_DIR, res);
    })
    .catch(() => {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("Server error");
    });
});

server.listen(config.port, config.host, () => {
  console.info(
    `[health-response-agent] listening on http://${config.host}:${config.port}  (serviceMode=${config.serviceMode}, demoMode=${config.demoMode})`,
  );
});
