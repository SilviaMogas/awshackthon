/**
 * Audit service. Records an append-only event history per session.
 *
 * MVP: in-memory store (per server process). The interface matches how a real
 * DynamoDB-backed implementation would behave (see AWS_ARCHITECTURE in README).
 * Audit events deliberately avoid duplicating raw health data — they store the
 * event type, tool name, request id and non-sensitive metadata only.
 */
import type { AuditEvent, AuditEventType } from "../../shared/types.js";
import { genId, nowIso } from "../../shared/util.js";

export interface AuditService {
  record(input: {
    sessionId: string;
    eventType: AuditEventType;
    toolName?: string;
    requestId?: string;
    metadata?: Record<string, unknown>;
  }): AuditEvent;
  list(sessionId: string): AuditEvent[];
  clear(sessionId: string): void;
}

class InMemoryAuditService implements AuditService {
  private events = new Map<string, AuditEvent[]>();

  record(input: {
    sessionId: string;
    eventType: AuditEventType;
    toolName?: string;
    requestId?: string;
    metadata?: Record<string, unknown>;
  }): AuditEvent {
    const event: AuditEvent = {
      id: genId("evt"),
      sessionId: input.sessionId,
      eventType: input.eventType,
      toolName: input.toolName,
      requestId: input.requestId,
      timestamp: nowIso(),
      metadata: sanitizeMetadata(input.metadata),
    };
    const list = this.events.get(input.sessionId) ?? [];
    list.push(event);
    this.events.set(input.sessionId, list);
    return event;
  }

  list(sessionId: string): AuditEvent[] {
    return [...(this.events.get(sessionId) ?? [])];
  }

  clear(sessionId: string): void {
    this.events.delete(sessionId);
  }
}

/**
 * Drop obviously sensitive keys from audit metadata. Audit is for traceability,
 * not a second copy of the health record.
 */
function sanitizeMetadata(
  metadata?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!metadata) return undefined;
  const blocked = new Set([
    "chiefComplaint",
    "clinicalSummary",
    "messages",
    "answers",
    "location",
    "latitude",
    "longitude",
    "callbackNumber",
  ]);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(metadata)) {
    if (blocked.has(k)) continue;
    out[k] = v;
  }
  return out;
}

export const auditService: AuditService = new InMemoryAuditService();
