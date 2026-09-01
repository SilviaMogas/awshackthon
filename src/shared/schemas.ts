/**
 * Runtime schemas for every cross-boundary payload. Used by API routes and
 * services to validate inputs and outputs. Built on the dependency-free
 * `schema.ts` validator (a Zod substitute for this sandbox).
 */
import { s, Schema } from "./schema.js";
import type {
  AgentMessage,
  ClinicalSummary,
  ConsentRecord,
  EscalationRequest,
  EscalationResponse,
  ProviderContactRequest,
  ProviderContactResponse,
  SymptomAnswer,
  TriageRequest,
  TriageResponse,
  VitalSign,
  EmergencyScreeningRequest,
  EmergencyScreeningResponse,
  EmergencyNumberResponse,
} from "./types.js";

export const ageRangeSchema = s.enum([
  "under_12",
  "12_17",
  "18_39",
  "40_64",
  "65_plus",
] as const);

export const geoLocationSchema = s.object({
  latitude: s.number().optional(),
  longitude: s.number().optional(),
  accuracy: s.number().optional(),
  capturedAt: s.string().optional(),
});

export const userContextSchema = s.object({
  sessionId: s.string().min(1),
  ageRange: ageRangeSchema.optional(),
  country: s.string().optional(),
  language: s.string().min(1),
  currentLocation: geoLocationSchema.optional(),
  healthDataSharingConsent: s.boolean(),
  locationSharingConsent: s.boolean(),
  providerContactConsent: s.boolean(),
  consentTimestamps: s.record(s.string()).optional(),
});

export const agentMessageSchema: Schema<AgentMessage> = s.object({
  id: s.string().min(1),
  role: s.enum(["user", "agent", "system"] as const),
  content: s.string(),
  timestamp: s.string(),
  messageType: s.enum([
    "text",
    "question",
    "safety_notice",
    "tool_status",
    "result",
    "error",
  ] as const),
}) as unknown as Schema<AgentMessage>;

const answerValueSchema = s.union<string | string[] | number | boolean | null>([
  s.string(),
  s.array(s.string()),
  s.number(),
  s.boolean(),
  s.string().nullable(),
]);

export const symptomAnswerSchema: Schema<SymptomAnswer> = s.object({
  questionId: s.string().min(1),
  question: s.string(),
  answer: answerValueSchema,
  answeredAt: s.string(),
  source: s.enum(["user", "device", "api"] as const),
}) as unknown as Schema<SymptomAnswer>;

export const vitalSignSchema: Schema<VitalSign> = s.object({
  type: s.enum([
    "heart_rate",
    "temperature",
    "blood_pressure",
    "oxygen_saturation",
    "respiratory_rate",
    "other",
  ] as const),
  value: s.union<string | number>([s.string(), s.number()]),
  unit: s.string().optional(),
  measuredAt: s.string().optional(),
  source: s.enum(["user_reported", "device"] as const),
}) as unknown as Schema<VitalSign>;

export const clinicalSummarySchema: Schema<ClinicalSummary> = s.object({
  chiefComplaint: s.string(),
  onset: s.string().optional(),
  duration: s.string().optional(),
  severity: s.string().optional(),
  progression: s.string().optional(),
  associatedSymptoms: s.array(s.string()),
  relevantConditions: s.array(s.string()),
  allergies: s.array(s.string()),
  medication: s.array(s.string()),
  recentInjury: s.string().optional(),
  pregnancyStatus: s.string().optional(),
  availableVitalSigns: s.array(vitalSignSchema),
  confirmedNegativeFindings: s.array(s.string()),
  missingInformation: s.array(s.string()),
  triageLevel: s.union<1 | 2 | 3>([s.literal(1), s.literal(2), s.literal(3)]).optional(),
  recommendedAction: s.string().optional(),
}) as unknown as Schema<ClinicalSummary>;

export const triageRequestSchema: Schema<TriageRequest> = s.object({
  sessionId: s.string().min(1),
  userContext: userContextSchema,
  chiefComplaint: s.string().min(1),
  messages: s.array(agentMessageSchema),
  answers: s.array(symptomAnswerSchema),
  availableVitalSigns: s.array(vitalSignSchema),
  submittedAt: s.string(),
}) as unknown as Schema<TriageRequest>;

export const followUpQuestionSchema = s.object({
  questionId: s.string().min(1),
  question: s.string(),
  answerType: s.enum([
    "text",
    "boolean",
    "single_select",
    "multiple_select",
    "number",
  ] as const),
  answerOptions: s.array(s.string()).optional(),
  canSkip: s.boolean(),
  whyNeededCategory: s.string().optional(),
});

export const triageResponseSchema: Schema<TriageResponse> = s.object({
  triageLevel: s.union<1 | 2 | 3>([s.literal(1), s.literal(2), s.literal(3)]),
  urgencyLabel: s.string(),
  recommendedAction: s.string(),
  timeframe: s.string(),
  followUpQuestions: s.array(followUpQuestionSchema).optional(),
  warningSigns: s.array(s.string()),
  selfCareGuidance: s.array(s.string()).optional(),
  escalationRequired: s.boolean(),
  suggestedProviderType: s.string().optional(),
  clinicalSummary: clinicalSummarySchema,
  confidenceStatus: s
    .enum(["sufficient_information", "limited_information"] as const)
    .optional(),
  sources: s.array(s.string()).optional(),
  requestId: s.string().min(1),
  timestamp: s.string(),
}) as unknown as Schema<TriageResponse>;

export const emergencyScreeningRequestSchema: Schema<EmergencyScreeningRequest> =
  s.object({
    sessionId: s.string().min(1),
    chiefComplaint: s.string(),
    messages: s.array(agentMessageSchema),
    answers: s.array(symptomAnswerSchema),
    availableVitalSigns: s.array(vitalSignSchema),
  }) as unknown as Schema<EmergencyScreeningRequest>;

export const emergencyScreeningResponseSchema: Schema<EmergencyScreeningResponse> =
  s.object({
    possibleEmergency: s.boolean(),
    emergencySignals: s.array(s.string()),
    requiredAction: s.string(),
    requestId: s.string().min(1),
    timestamp: s.string(),
  }) as unknown as Schema<EmergencyScreeningResponse>;

export const emergencyNumberResponseSchema: Schema<EmergencyNumberResponse> =
  s.object({
    country: s.string(),
    emergencyNumber: s.string(),
    label: s.string(),
    source: s.string(),
    requestId: s.string().min(1),
    timestamp: s.string(),
  }) as unknown as Schema<EmergencyNumberResponse>;

export const consentRecordSchema: Schema<ConsentRecord> = s.object({
  consentType: s.enum([
    "health_data_sharing",
    "location_sharing",
    "provider_contact",
    "emergency_escalation",
  ] as const),
  granted: s.boolean(),
  timestamp: s.string(),
  policyVersion: s.string(),
}) as unknown as Schema<ConsentRecord>;

const actionStatusSchema = s.enum([
  "pending",
  "received",
  "acknowledged",
  "completed",
  "failed",
  "simulated",
] as const);

export const escalationRequestSchema: Schema<EscalationRequest> = s.object({
  sessionId: s.string().min(1),
  triageRequestId: s.string().min(1),
  userConsent: s.array(consentRecordSchema),
  clinicalSummary: clinicalSummarySchema,
  location: geoLocationSchema.optional(),
  callbackNumber: s.string().optional(),
  submittedAt: s.string(),
  idempotencyKey: s.string().min(1),
}) as unknown as Schema<EscalationRequest>;

export const escalationResponseSchema: Schema<EscalationResponse> = s.object({
  status: actionStatusSchema,
  referenceId: s.string().min(1),
  destination: s.string().optional(),
  timestamp: s.string(),
  errorMessage: s.string().optional(),
  simulated: s.boolean(),
}) as unknown as Schema<EscalationResponse>;

export const providerContactRequestSchema: Schema<ProviderContactRequest> =
  s.object({
    sessionId: s.string().min(1),
    triageRequestId: s.string().min(1),
    userConsent: s.array(consentRecordSchema),
    clinicalSummary: clinicalSummarySchema,
    suggestedProviderType: s.string().optional(),
    callbackNumber: s.string().optional(),
    submittedAt: s.string(),
    idempotencyKey: s.string().min(1),
  }) as unknown as Schema<ProviderContactRequest>;

export const providerContactResponseSchema: Schema<ProviderContactResponse> =
  s.object({
    status: actionStatusSchema,
    referenceId: s.string().min(1),
    destination: s.string().optional(),
    timestamp: s.string(),
    errorMessage: s.string().optional(),
    simulated: s.boolean(),
  }) as unknown as Schema<ProviderContactResponse>;
