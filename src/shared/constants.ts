/** Shared constants used across server and client. */

export const POLICY_VERSION = "2026-09-01.v1";

export const DISCLAIMER =
  "This service provides general health guidance and does not replace a qualified healthcare professional. It does not provide a diagnosis. If you believe you are in immediate danger, contact local emergency services now.";

/**
 * Country -> emergency number lookup table. This is the authoritative source
 * used by the get_emergency_number tool. The language model must NEVER invent
 * an emergency number; it may only surface values retrieved from this table
 * (or a configured Amazon Location / real endpoint in production).
 */
export interface EmergencyNumberEntry {
  emergencyNumber: string;
  label: string;
}

export const EMERGENCY_NUMBERS: Record<string, EmergencyNumberEntry> = {
  SA: { emergencyNumber: "997", label: "Saudi Red Crescent (ambulance)" },
  AE: { emergencyNumber: "998", label: "Ambulance (UAE)" },
  US: { emergencyNumber: "911", label: "Emergency services (US)" },
  CA: { emergencyNumber: "911", label: "Emergency services (Canada)" },
  GB: { emergencyNumber: "999", label: "Emergency services (UK)" },
  IE: { emergencyNumber: "112", label: "Emergency services (Ireland)" },
  AU: { emergencyNumber: "000", label: "Emergency services (Australia)" },
  NZ: { emergencyNumber: "111", label: "Emergency services (New Zealand)" },
  IN: { emergencyNumber: "112", label: "Emergency services (India)" },
  EG: { emergencyNumber: "123", label: "Ambulance (Egypt)" },
  JO: { emergencyNumber: "911", label: "Emergency services (Jordan)" },
  KW: { emergencyNumber: "112", label: "Emergency services (Kuwait)" },
  QA: { emergencyNumber: "999", label: "Emergency services (Qatar)" },
  BH: { emergencyNumber: "999", label: "Emergency services (Bahrain)" },
  OM: { emergencyNumber: "9999", label: "Emergency services (Oman)" },
};

/** EU / EEA and many other countries share 112. */
export const UNIVERSAL_FALLBACK_EMERGENCY = {
  emergencyNumber: "112",
  label: "International emergency number (112) — verify locally",
};

export function lookupEmergencyNumber(country?: string): {
  emergencyNumber: string;
  label: string;
  source: string;
} {
  const code = (country ?? "").trim().toUpperCase();
  const entry = EMERGENCY_NUMBERS[code];
  if (entry) {
    return { ...entry, source: "static-table" };
  }
  return { ...UNIVERSAL_FALLBACK_EMERGENCY, source: "static-fallback" };
}

export const SUPPORTED_COUNTRIES = [
  { code: "SA", name: "Saudi Arabia" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "US", name: "United States" },
  { code: "GB", name: "United Kingdom" },
  { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" },
  { code: "IN", name: "India" },
  { code: "EG", name: "Egypt" },
  { code: "JO", name: "Jordan" },
  { code: "KW", name: "Kuwait" },
  { code: "QA", name: "Qatar" },
  { code: "BH", name: "Bahrain" },
  { code: "OM", name: "Oman" },
];

export const SUPPORTED_LANGUAGES = [
  { code: "en", name: "English", dir: "ltr" as const },
  { code: "ar", name: "العربية", dir: "rtl" as const },
];

/** API endpoint paths — the single place to change route names. */
export const API_ROUTES = {
  health: "/api/health",
  config: "/api/config",
  agentMessage: "/api/agent/message",
  emergencyScreening: "/api/emergency-screening",
  triage: "/api/triage",
  triageFollowUp: "/api/triage/follow-up",
  summary: "/api/summary",
  emergencyNumber: "/api/emergency-number",
  providerContact: "/api/provider/contact",
  escalate: "/api/escalate",
  escalateStatus: (referenceId: string): string =>
    `/api/escalate/${encodeURIComponent(referenceId)}/status`,
  auditEvent: "/api/audit/event",
} as const;
