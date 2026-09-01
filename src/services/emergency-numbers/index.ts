/**
 * Emergency number service. Returns the authoritative emergency number for a
 * country. The language model must NEVER invent an emergency number — it may
 * only surface a value returned by this service (static table for the MVP; an
 * Amazon Location Service / verified endpoint in production).
 */
import type { EmergencyNumberResponse } from "../../shared/types.js";
import { lookupEmergencyNumber } from "../../shared/constants.js";
import { config, useRealAdapter } from "../../server/config.js";
import { httpJson } from "../http-client.js";
import { emergencyNumberResponseSchema } from "../../shared/schemas.js";
import { shortId, nowIso } from "../../shared/util.js";

export interface EmergencyNumberService {
  get(country: string): Promise<EmergencyNumberResponse>;
  readonly mode: "mock" | "real";
}

class StaticEmergencyNumberService implements EmergencyNumberService {
  readonly mode = "mock" as const;
  async get(country: string): Promise<EmergencyNumberResponse> {
    const { emergencyNumber, label, source } = lookupEmergencyNumber(country);
    return {
      country: (country || "").toUpperCase(),
      emergencyNumber,
      label,
      source,
      requestId: shortId("emg"),
      timestamp: nowIso(),
    };
  }
}

class RealEmergencyNumberService implements EmergencyNumberService {
  readonly mode = "real" as const;
  constructor(private readonly endpoint: string) {}
  async get(country: string): Promise<EmergencyNumberResponse> {
    const url = `${this.endpoint}?country=${encodeURIComponent(country)}`;
    return httpJson<EmergencyNumberResponse>(url, {
      method: "GET",
      responseSchema: emergencyNumberResponseSchema,
      timeoutMs: 5000,
      retries: 1,
    });
  }
}

export function createEmergencyNumberService(): EmergencyNumberService {
  // The emergency-number lookup rides on the emergency-screening endpoint host
  // in production; for the MVP it is always the static, verified table.
  const ep = config.endpoints.emergencyScreening;
  return useRealAdapter(ep) && ep.includes("emergency-number")
    ? new RealEmergencyNumberService(ep)
    : new StaticEmergencyNumberService();
}

export const emergencyNumberService = createEmergencyNumberService();
