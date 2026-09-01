/** Server-side configuration, derived from environment variables. */

function env(name: string, fallback = ""): string {
  const v = process.env[name];
  return v === undefined || v === "" ? fallback : v;
}

function pub(name: string, fallback = ""): string {
  // Prefer PUBLIC_*, fall back to NEXT_PUBLIC_* for parity with the spec.
  return env(`PUBLIC_${name}`, env(`NEXT_PUBLIC_${name}`, fallback));
}

export interface ServiceEndpoints {
  triage: string;
  emergencyScreening: string;
  medicalProvider: string;
  emergencyEscalation: string;
}

export interface ServerConfig {
  port: number;
  host: string;
  /** "mock" forces all services to their mock adapters. */
  serviceMode: "mock" | "auto";
  mockLatencyMs: number;
  demoMode: boolean;
  appName: string;
  defaultCountry: string;
  defaultLanguage: string;
  endpoints: ServiceEndpoints;
  aws: {
    region: string;
    bedrockModelId: string;
    cognitoUserPoolId: string;
    cognitoClientId: string;
    dynamoSessionsTable: string;
    dynamoAuditTable: string;
    locationPlaceIndex: string;
  };
}

export function loadConfig(): ServerConfig {
  return {
    port: Number(env("PORT", "3000")) || 3000,
    host: env("HOST", "0.0.0.0"),
    serviceMode: env("SERVICE_MODE", "mock") === "auto" ? "auto" : "mock",
    mockLatencyMs: Number(env("MOCK_LATENCY_MS", "1200")) || 1200,
    demoMode: pub("DEMO_MODE", "true") !== "false",
    appName: pub("APP_NAME", "Health Response Agent"),
    defaultCountry: pub("DEFAULT_COUNTRY", "SA"),
    defaultLanguage: pub("DEFAULT_LANGUAGE", "en"),
    endpoints: {
      triage: env("TRIAGE_ENDPOINT"),
      emergencyScreening: env("EMERGENCY_SCREENING_ENDPOINT"),
      medicalProvider: env("MEDICAL_PROVIDER_ENDPOINT"),
      emergencyEscalation: env("EMERGENCY_ESCALATION_ENDPOINT"),
    },
    aws: {
      region: env("AWS_REGION"),
      bedrockModelId: env("AWS_BEDROCK_MODEL_ID"),
      cognitoUserPoolId: env("AWS_COGNITO_USER_POOL_ID"),
      cognitoClientId: env("AWS_COGNITO_CLIENT_ID"),
      dynamoSessionsTable: env("DYNAMODB_SESSIONS_TABLE"),
      dynamoAuditTable: env("DYNAMODB_AUDIT_TABLE"),
      locationPlaceIndex: env("LOCATION_PLACE_INDEX"),
    },
  };
}

export const config = loadConfig();

/**
 * Decide whether a given service should use its real adapter. A real adapter is
 * used only when SERVICE_MODE=auto AND an endpoint URL is configured. Otherwise
 * we fall back to the mock adapter (which is always clearly labelled).
 */
export function useRealAdapter(endpoint: string): boolean {
  return config.serviceMode === "auto" && endpoint.trim().length > 0;
}
