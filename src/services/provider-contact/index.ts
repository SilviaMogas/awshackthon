/**
 * Provider-contact service (Level 2). Requests contact, booking or a callback
 * from a configured provider. Requires explicit provider_contact +
 * health_data_sharing consent. Deduplicated by idempotency key. Mock responses
 * are always labelled simulated:true.
 */
import type {
  ProviderContactRequest,
  ProviderContactResponse,
} from "../../shared/types.js";
import { config, useRealAdapter } from "../../server/config.js";
import { httpJson } from "../http-client.js";
import { providerContactResponseSchema } from "../../shared/schemas.js";
import { ServiceError } from "../errors.js";
import { shortId, nowIso, delay } from "../../shared/util.js";

export interface ProviderContactService {
  request(req: ProviderContactRequest): Promise<ProviderContactResponse>;
  readonly mode: "mock" | "real";
  readonly simulated: boolean;
}

function assertConsent(req: ProviderContactRequest): void {
  const has = (t: string): boolean =>
    req.userConsent.some((c) => c.consentType === t && c.granted);
  if (!has("provider_contact") || !has("health_data_sharing")) {
    throw new ServiceError(
      "CONSENT_REQUIRED",
      "Contacting a provider requires explicit consent to share health data.",
    );
  }
}

const byIdempotencyKey = new Map<string, ProviderContactResponse>();

class MockProviderContactService implements ProviderContactService {
  readonly mode = "mock" as const;
  readonly simulated = true;
  async request(req: ProviderContactRequest): Promise<ProviderContactResponse> {
    assertConsent(req);
    const existing = byIdempotencyKey.get(req.idempotencyKey);
    if (existing) {
      throw new ServiceError(
        "DUPLICATE_ACTION",
        "A provider contact with this idempotency key was already submitted.",
        { requestId: existing.referenceId },
      );
    }
    await delay(config.mockLatencyMs);
    const resp: ProviderContactResponse = {
      status: "simulated",
      referenceId: config.demoMode ? "DEMO-PROVIDER-001" : shortId("PRV"),
      destination: "Simulated healthcare provider",
      timestamp: nowIso(),
      simulated: true,
    };
    byIdempotencyKey.set(req.idempotencyKey, resp);
    return resp;
  }
}

class RealProviderContactService implements ProviderContactService {
  readonly mode = "real" as const;
  readonly simulated = false;
  constructor(private readonly endpoint: string) {}
  async request(req: ProviderContactRequest): Promise<ProviderContactResponse> {
    assertConsent(req);
    const existing = byIdempotencyKey.get(req.idempotencyKey);
    if (existing) {
      throw new ServiceError(
        "DUPLICATE_ACTION",
        "A provider contact with this idempotency key was already submitted.",
        { requestId: existing.referenceId },
      );
    }
    const resp = await httpJson<ProviderContactResponse>(this.endpoint, {
      method: "POST",
      body: req,
      headers: { "idempotency-key": req.idempotencyKey },
      responseSchema: providerContactResponseSchema,
      timeoutMs: 9000,
      retries: 0,
    });
    byIdempotencyKey.set(req.idempotencyKey, resp);
    return resp;
  }
}

export function createProviderContactService(): ProviderContactService {
  const ep = config.endpoints.medicalProvider;
  return useRealAdapter(ep)
    ? new RealProviderContactService(ep)
    : new MockProviderContactService();
}

export const providerContactService = createProviderContactService();
