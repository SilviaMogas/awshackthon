/** Environment-agnostic helpers usable in both Node and the browser. */

export function nowIso(): string {
  return new Date().toISOString();
}

/** Generate a UUID-ish id without depending on node:crypto in the browser. */
export function genId(prefix = ""): string {
  const g = (globalThis as unknown as { crypto?: { randomUUID?: () => string } }).crypto;
  const uuid =
    g && typeof g.randomUUID === "function"
      ? g.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}-${Math.random()
          .toString(36)
          .slice(2, 10)}`;
  return prefix ? `${prefix}-${uuid}` : uuid;
}

export function shortId(prefix = ""): string {
  const rnd = Math.random().toString(36).slice(2, 8).toUpperCase();
  const t = Date.now().toString(36).toUpperCase().slice(-4);
  return prefix ? `${prefix}-${t}${rnd}` : `${t}${rnd}`;
}

/** Basic input sanitisation: strip control chars and clamp length. */
export function sanitizeText(input: unknown, maxLen = 2000): string {
  if (typeof input !== "string") return "";
  // Remove control characters except common whitespace.
  const cleaned = input.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  return cleaned.slice(0, maxLen).trim();
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Remove keys whose values are undefined (for clean JSON). */
export function compact<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as T;
}
