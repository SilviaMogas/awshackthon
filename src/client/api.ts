/**
 * Central, typed API client. Every endpoint path is defined in one place
 * (shared/constants API_ROUTES) so backend route names can be changed centrally.
 * All responses are unwrapped from the ApiEnvelope and surfaced as typed data
 * or a sanitised Error. Never logs sensitive health data to the console.
 */
import { API_ROUTES } from "../shared/constants.js";
import type {
  ApiEnvelope,
  EscalationRequest,
  EscalationResponse,
  ProviderContactRequest,
  ProviderContactResponse,
  TriageRequest,
  TriageResponse,
  EmergencyNumberResponse,
  ClinicalSummary,
  FollowUpQuestion,
  AgentState,
  AuditEvent,
} from "../shared/types.js";

export interface AppConfig {
  appName: string;
  demoMode: boolean;
  defaultCountry: string;
  defaultLanguage: string;
  policyVersion: string;
  disclaimer: string;
  serviceMode: string;
  simulated: { escalation: boolean; providerContact: boolean };
}

export interface AgentStepResponse {
  state: AgentState;
  transitions: { from: AgentState; to: AgentState; at: string }[];
  userMessage: string;
  question: FollowUpQuestion | null;
  triage: TriageResponse | null;
  emergencyInterrupt: boolean;
  fallback: boolean;
  lastTool: unknown;
}

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const BASE = ""; // same-origin

async function call<T>(
  path: string,
  init?: { method?: string; body?: unknown; timeoutMs?: number },
): Promise<T> {
  const controller = new AbortController();
  const timeout = window.setTimeout(
    () => controller.abort(),
    init?.timeoutMs ?? 15000,
  );
  try {
    const res = await fetch(BASE + path, {
      method: init?.method ?? "GET",
      headers: init?.body ? { "content-type": "application/json" } : undefined,
      body: init?.body ? JSON.stringify(init.body) : undefined,
      signal: controller.signal,
    });
    const json = (await res.json().catch(() => ({}))) as ApiEnvelope<T>;
    if (!res.ok || !json.ok) {
      const err = json.error;
      throw new ApiError(
        err?.code ?? "HTTP_" + res.status,
        err?.message ?? "Request failed",
        err?.requestId,
      );
    }
    return json.data as T;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    if ((e as { name?: string }).name === "AbortError")
      throw new ApiError("TIMEOUT", "The request timed out.");
    throw new ApiError("NETWORK", "Network error. Check your connection.");
  } finally {
    window.clearTimeout(timeout);
  }
}

export const api = {
  getConfig: (): Promise<AppConfig> => call<AppConfig>(API_ROUTES.config),
  health: (): Promise<unknown> => call(API_ROUTES.health),

  agentMessage: (body: {
    userContext: unknown;
    message?: string;
    answer?: unknown;
    vitalSigns?: unknown;
    forceTriage?: boolean;
  }): Promise<AgentStepResponse> =>
    call<AgentStepResponse>(API_ROUTES.agentMessage, {
      method: "POST",
      body,
      timeoutMs: 20000,
    }),

  triage: (req: TriageRequest): Promise<TriageResponse> =>
    call<TriageResponse>(API_ROUTES.triage, { method: "POST", body: req }),

  summary: (
    req: TriageRequest,
  ): Promise<{ summary: ClinicalSummary; disclaimer: string }> =>
    call(API_ROUTES.summary, { method: "POST", body: req }),

  emergencyNumber: (country: string): Promise<EmergencyNumberResponse> =>
    call<EmergencyNumberResponse>(
      `${API_ROUTES.emergencyNumber}?country=${encodeURIComponent(country)}`,
    ),

  providerContact: (
    req: ProviderContactRequest,
  ): Promise<ProviderContactResponse> =>
    call<ProviderContactResponse>(API_ROUTES.providerContact, {
      method: "POST",
      body: req,
    }),

  escalate: (req: EscalationRequest): Promise<EscalationResponse> =>
    call<EscalationResponse>(API_ROUTES.escalate, { method: "POST", body: req }),

  escalationStatus: (referenceId: string): Promise<EscalationResponse> =>
    call<EscalationResponse>(API_ROUTES.escalateStatus(referenceId)),

  audit: (sessionId: string): Promise<{ events: AuditEvent[] }> =>
    call(`/api/audit/${encodeURIComponent(sessionId)}`),

  clearSession: (sessionId: string): Promise<{ cleared: boolean }> =>
    call(`/api/session/${encodeURIComponent(sessionId)}/clear`, {
      method: "POST",
      body: {},
    }),
};
