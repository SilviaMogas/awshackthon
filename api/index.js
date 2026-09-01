// Vercel serverless entry point for the Health Response Agent API.
//
// Vercel gives us Node http-compatible (req, res) objects. We reuse the exact
// same Router + route handlers as the standalone server (compiled into
// ../dist/server), so behaviour is identical in both environments.
//
// This file is plain JS (not TS) so Vercel's function bundler does not need to
// compile our NodeNext/ambient-typed sources; `vercel-build` already compiled
// them into ../dist/server via our own tsc.

import { Router, securityHeaders } from "../dist/server/http.js";
import { registerRoutes } from "../dist/server/routes.js";

const router = new Router();
registerRoutes(router);

export default async function handler(req, res) {
  securityHeaders(res);

  const method = (req.method || "GET").toUpperCase();
  const host = req.headers.host || "localhost";
  const url = new URL(req.url || "/", `https://${host}`);
  const pathname = url.pathname;

  const query = {};
  url.searchParams.forEach((v, k) => (query[k] = v));

  const matched = router.match(method, pathname);
  if (!matched) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: false, error: { code: "NOT_FOUND", message: "Route not found." } }));
    return;
  }

  try {
    await Promise.resolve(
      matched.handler({ req, res, method, pathname, query, params: matched.params }),
    );
  } catch {
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ ok: false, error: { code: "INTERNAL", message: "Server error." } }));
    }
  }
}
