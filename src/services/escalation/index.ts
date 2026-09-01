/**
 * Emergency escalation service.
 *
 * Sends the emergency handoff to a configured medical response endpoint.
 * Safety rules enforced here:
 *   - Requires explicit health-data AND location (if shared) consent.
 *   - Requires an emergency_escalation consent record.
 *   - Deduplicates by idempotencyKey — an emergency action is NEVER retried
 *     automatically, because that could create duplicate alerts.
 *   - Mock responses are ALWAYS labelled simulated:true. We never present a
 *     simulated action as a real one.
 */
import type {
  EscalationRequest,
  EscalationResponse,
} from "../../shared/types.js";
import { config, useRealAdapter } from "../../server/config.js";
import { httpJson } from "../http-client.js";
import { escalationResponseSchema } from "../../shared/schemas.js";
import { ServiceError } from "../errors.js";
import { shortId, nowIso, delay } from "../../shared/util.js";

export interface EscalationService {
  escalate(req: EscalationRequest): Promise<EscalationResponse>;
  status(referenceId: string): Promise<EscalationResponse>;
  readonly mode: "mock" | "real";
  readonly simulated: boolean;
}

function assertConsent(req: EscalationRequest): void {
  const has = (t: string): boolean =>
    req.userConsent.some((c) => c.consentType === t && c.granted);
  if (!has("emergency_escalation") || !has("health_data_sharing")) {
    throw new ServiceError(
      "CONSENT_REQUIRED",
      "Emergency escalation requires explicit consent to share health data.",
    );
  }
  // If a location is attached, location sharing consent must be present.
  if (req.location && !has("location_sharing")) {
    throw new ServiceError(
      "CONSENT_REQUIRED",
      "Location was attached without location sharing consent.",
    );
  }
}

/** Shared in-memory dedup + status store (mock and as a guard for real). */
const byIdempotencyKey = new Map<string, EscalationResponse>();
const byReference = new Map<string, EscalationResponse>();

/** Simulated status progression to demonstrate monitoring. */
const STATUS_TIMELINE = ["pending", "received", "acknowledged"] as const;

class MockEscalationService implements EscalationService {
  readonly mode = "mock" as const;
  readonly simulated = true;

  async escalate(req: EscalationRequest): Promise<EscalationResponse> {
    assertConsent(req);
    // Deduplicate: same idempotency key returns the original response.
    const existing = byIdempotencyKey.get(req.idempotencyKey);
    if (existing) {
      throw new ServiceError(
        "DUPLICATE_ACTION",
        "An escalation with this idempotency key was already submitted.",
        { requestId: existing.referenceId },
      );
    }
    await delay(config.mockLatencyMs);
    const referenceId = config.demoMode ? "DEMO-EMERGENCY-001" : shortId("EMG");
    const resp: EscalationResponse = {
      status: "simulated",
      referenceId,
      destination: "Simulated medical response team",
      timestamp: nowIso(),
      simulated: true,
    };
    byIdempotencyKey.set(req.idempotencyKey, resp);
    byReference.set(referenceId, { ...resp, status: "pending" });
    return resp;
  }

  async status(referenceId: string): Promise<EscalationResponse> {
    const current = byReference.get(referenceId);
    if (!current) {
      throw new ServiceError("NOT_FOUND", "Unknown escalation reference.");
    }
    // Advance the simulated status one step each poll, up to "acknowledged".
    const idx = STATUS_TIMELINE.indexOf(
      current.status as (typeof STATUS_TIMELINE)[number],
    );
    const nextStatus =
      idx >= 0 && idx < STATUS_TIMELINE.length - 1
        ? STATUS_TIMELINE[idx + 1]
        : "acknowledged";
    const updated: EscalationResponse = {
      status: nextStatus,
      referenceId,
      destination: "Simulated medical response team",
      timestamp: nowIso(),
      simulated: true,
    };
    byReference.set(referenceId, updated);
    return updated;
  }
}

class RealEscalationService implements EscalationService {
  readonly mode = "real" as const;
  readonly simulated = false;
  constructor(private readonly endpoint: string) {}

  async escalate(req: EscalationRequest): Promise<EscalationResponse> {
    assertConsent(req);
    const existing = byIdempotencyKey.get(req.idempotencyKey);
    if (existing) {
      throw new ServiceError(
        "DUPLICATE_ACTION",
        "An escalation with this idempotency key was already submitted.",
        { requestId: existing.referenceId },
      );
    }
    // Emergency action: NEVER auto-retry (retries: 0) to avoid duplicate alerts.
    const resp = await httpJson<EscalationResponse>(this.endpoint, {
      method: "POST",
      body: req,
      headers: { "idempotency-key": req.idempotencyKey },
      responseSchema: escalationResponseSchema,
      timeoutMs: 10000,
      retries: 0,
    });
    byIdempotencyKey.set(req.idempotencyKey, resp);
    byReference.set(resp.referenceId, resp);
    return resp;
  }

  async status(referenceId: string): Promise<EscalationResponse> {
    const url = `${this.endpoint}/${encodeURIComponent(referenceId)}/status`;
    return httpJson<EscalationResponse>(url, {
      method: "GET",
      responseSchema: escalationResponseSchema,
      timeoutMs: 6000,
      retries: 1,
    });
  }
}

export function createEscalationService(): EscalationService {
  const ep = config.endpoints.emergencyEscalation;
  return useRealAdapter(ep)
    ? new RealEscalationService(ep)
    : new MockEscalationService();
}

export const escalationService = createEscalationService();
