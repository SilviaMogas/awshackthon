/** Minimal routing + helpers for the zero-dependency Node http server. */
import type { IncomingMessage, ServerResponse } from "node:http";
import type { ApiEnvelope } from "../shared/types.js";
import { ServiceError, safeUserMessage } from "../services/errors.js";
import { SchemaError } from "../shared/schema.js";
import { shortId } from "../shared/util.js";

export interface Ctx {
  req: IncomingMessage;
  res: ServerResponse;
  method: string;
  pathname: string;
  query: Record<string, string>;
  params: Record<string, string>;
}

export type Handler = (ctx: Ctx) => Promise<void> | void;

interface RouteDef {
  method: string;
  // pattern segments; ":name" captures a param
  segments: string[];
  handler: Handler;
}

export class Router {
  private routes: RouteDef[] = [];

  add(method: string, pattern: string, handler: Handler): void {
    this.routes.push({
      method,
      segments: pattern.split("/").filter(Boolean),
      handler,
    });
  }
  get(p: string, h: Handler): void {
    this.add("GET", p, h);
  }
  post(p: string, h: Handler): void {
    this.add("POST", p, h);
  }

  match(
    method: string,
    pathname: string,
  ): { handler: Handler; params: Record<string, string> } | null {
    const parts = pathname.split("/").filter(Boolean);
    for (const r of this.routes) {
      if (r.method !== method) continue;
      if (r.segments.length !== parts.length) continue;
      const params: Record<string, string> = {};
      let ok = true;
      for (let i = 0; i < r.segments.length; i++) {
        const seg = r.segments[i];
        if (seg.startsWith(":")) params[seg.slice(1)] = decodeURIComponent(parts[i]);
        else if (seg !== parts[i]) {
          ok = false;
          break;
        }
      }
      if (ok) return { handler: r.handler, params };
    }
    return null;
  }
}

export function securityHeaders(res: ServerResponse): void {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'",
  );
  res.setHeader("Permissions-Policy", "geolocation=(self), microphone=(self)");
}

export function sendJson<T>(
  res: ServerResponse,
  status: number,
  envelope: ApiEnvelope<T>,
): void {
  const body = JSON.stringify(envelope);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

export function ok<T>(res: ServerResponse, data: T, status = 200): void {
  sendJson(res, status, { ok: true, data });
}

export function fail(
  res: ServerResponse,
  err: unknown,
  fallbackStatus = 500,
): void {
  const requestId = shortId("err");
  let status = fallbackStatus;
  let code = "INTERNAL";
  if (err instanceof ServiceError) {
    code = err.code;
    status =
      err.code === "CONSENT_REQUIRED"
        ? 403
        : err.code === "DUPLICATE_ACTION"
          ? 409
          : err.code === "NOT_FOUND"
            ? 404
            : err.code === "INVALID_REQUEST" || err.code === "INVALID_RESPONSE"
              ? 400
              : err.code === "TIMEOUT" || err.code === "UPSTREAM_UNAVAILABLE"
                ? 502
                : 500;
  } else if (err instanceof SchemaError) {
    code = "INVALID_REQUEST";
    status = 400;
  }
  // Log server-side only (never leak internals to the client body).
  console.warn(`[api-error] ${requestId} ${code}:`, safeErrString(err));
  sendJson(res, status, {
    ok: false,
    error: { code, message: safeUserMessage(err), requestId },
  });
}

function safeErrString(err: unknown): string {
  if (err instanceof Error) return `${err.name}: ${err.message}`;
  return String(err);
}

export async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  // Some serverless platforms (e.g. Vercel) pre-parse the request body and
  // consume the stream. If a parsed body is already present, use it directly
  // to avoid hanging on a stream that will never emit "data"/"end".
  const pre = (req as unknown as { body?: unknown }).body;
  if (pre !== undefined && pre !== null) {
    if (typeof pre === "string") {
      if (!pre) return {};
      try {
        return JSON.parse(pre);
      } catch {
        throw new ServiceError("INVALID_REQUEST", "Invalid JSON body");
      }
    }
    return pre;
  }
  return new Promise((resolve, reject) => {
    const chunks: string[] = [];
    let size = 0;
    req.setEncoding("utf8");
    req.on("data", (chunk: unknown) => {
      const str = String(chunk);
      size += str.length;
      if (size > 512 * 1024) {
        reject(new ServiceError("INVALID_REQUEST", "Request body too large"));
        return;
      }
      chunks.push(str);
    });
    req.on("end", () => {
      const raw = chunks.join("");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new ServiceError("INVALID_REQUEST", "Invalid JSON body"));
      }
    });
    req.on("error", () => reject(new ServiceError("INTERNAL", "Read error")));
  });
}
