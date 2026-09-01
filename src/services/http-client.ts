/**
 * Small fetch-with-timeout + validation helper for REAL service adapters.
 * Uses the global fetch available in Node 18+. Mock adapters do not use this.
 */
import { Schema } from "../shared/schema.js";
import { ServiceError } from "./errors.js";

declare const fetch: (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: unknown;
  },
) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
}>;

declare class AbortController {
  signal: unknown;
  abort(): void;
}

export interface HttpJsonOptions<T> {
  method?: "GET" | "POST";
  body?: unknown;
  headers?: Record<string, string>;
  timeoutMs?: number;
  responseSchema: Schema<T>;
  /** For safe retries only (never for emergency actions). */
  retries?: number;
}

export async function httpJson<T>(
  url: string,
  opts: HttpJsonOptions<T>,
): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? 8000;
  const retries = opts.retries ?? 0;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: opts.method ?? "POST",
        headers: { "content-type": "application/json", ...(opts.headers ?? {}) },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (!res.ok) {
        throw new ServiceError(
          "UPSTREAM_UNAVAILABLE",
          `Upstream returned ${res.status}`,
          { retriable: res.status >= 500 },
        );
      }
      const json = await res.json();
      const parsed = opts.responseSchema.safeParse(json);
      if (!parsed.ok) {
        throw new ServiceError(
          "INVALID_RESPONSE",
          `Response failed validation: ${parsed.errors.join("; ")}`,
        );
      }
      return parsed.value;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      const retriable = err instanceof ServiceError ? err.retriable : true;
      if (!retriable || attempt === retries) break;
    }
  }
  if (lastErr instanceof ServiceError) throw lastErr;
  throw new ServiceError("UPSTREAM_UNAVAILABLE", "Request failed", {
    retriable: false,
  });
}
