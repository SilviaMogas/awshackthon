/**
 * Core domain types for the Health Response Agent.
 * These are shared by the server (services, agent, API) and the browser client.
 */

export type TriageLevel = 1 | 2 | 3;

export type AgeRange = "under_12" | "12_17" | "18_39" | "40_64" | "65_plus";

export interface GeoLocation {
  latitude?: number;
  longitude?: number;
  accuracy?: number;
  capturedAt?: string;
}

export interface UserContext {
  sessionId: string;
  ageRange?: AgeRange;
  country?: string;
  language: string;
  currentLocation?: GeoLocation;
  healthDataSharingConsent: boolean;
  locationSharingConsent: boolean;
  providerContactConsent: boolean;
  consentTimestamps?: Record<string, string>;
}

export type MessageRole = "user" | "agent" | "system";

export type MessageType =
  | "text"
  | "question"
  | "safety_notice"
  | "tool_status"
  | "result"
  | "error";

export interface AgentMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: string;
  messageType: MessageType;
}

export type AnswerSource = "user" | "device" | "api";

export interface SymptomAnswer {
  questionId: string;
  question: string;
  answer: string | string[] | number | boolean | null;
  answeredAt: string;
  source: AnswerSource;
}

export type VitalSignType =
  | "heart_rate"
  | "temperature"
  | "blood_pressure"
  | "oxygen_saturation"
  | "respiratory_rate"
  | "other";

export interface VitalSign {
  type: VitalSignType;
  value: string | number;
  unit?: string;
  measuredAt?: string;
  source: "user_reported" | "device";
}

export type AnswerType =
  | "text"
  | "boolean"
  | "single_select"
  | "multiple_select"
  | "number";

export interface FollowUpQuestion {
  questionId: string;
  question: string;
  answerType: AnswerType;
  answerOptions?: string[];
  canSkip: boolean;
  /** Non-sensitive category explaining why the field is needed (no chain-of-thought). */
  whyNeededCategory?: string;
}

export interface ClinicalSummary {
  chiefComplaint: string;
  onset?: string;
  duration?: string;
  severity?: string;
  progression?: string;
  associatedSymptoms: string[];
  relevantConditions: string[];
  allergies: string[];
  medication: string[];
  recentInjury?: string;
  pregnancyStatus?: string;
  availableVitalSigns: VitalSign[];
  confirmedNegativeFindings: string[];
  missingInformation: string[];
  triageLevel?: TriageLevel;
  recommendedAction?: string;
}

export interface TriageRequest {
  sessionId: string;
  userContext: UserContext;
  chiefComplaint: string;
  messages: AgentMessage[];
  answers: SymptomAnswer[];
  availableVitalSigns: VitalSign[];
  submittedAt: string;
}

export type ConfidenceStatus = "sufficient_information" | "limited_information";

export interface TriageResponse {
  triageLevel: TriageLevel;
  urgencyLabel: string;
  recommendedAction: string;
  timeframe: string;
  followUpQuestions?: FollowUpQuestion[];
  warningSigns: string[];
  selfCareGuidance?: string[];
  escalationRequired: boolean;
  suggestedProviderType?: string;
  clinicalSummary: ClinicalSummary;
  confidenceStatus?: ConfidenceStatus;
  sources?: string[];
  requestId: string;
  timestamp: string;
}

export interface EmergencyScreeningRequest {
  sessionId: string;
  chiefComplaint: string;
  messages: AgentMessage[];
  answers: SymptomAnswer[];
  availableVitalSigns: VitalSign[];
}

export interface EmergencyScreeningResponse {
  possibleEmergency: boolean;
  emergencySignals: string[];
  requiredAction: string;
  requestId: string;
  timestamp: string;
}

export type ConsentType =
  | "health_data_sharing"
  | "location_sharing"
  | "provider_contact"
  | "emergency_escalation";

export interface ConsentRecord {
  consentType: ConsentType;
  granted: boolean;
  timestamp: string;
  policyVersion: string;
}

export interface EmergencyNumberResponse {
  country: string;
  emergencyNumber: string;
  label: string;
  source: string;
  requestId: string;
  timestamp: string;
}

export type ActionStatus =
  | "pending"
  | "received"
  | "acknowledged"
  | "completed"
  | "failed"
  | "simulated";

export interface EscalationRequest {
  sessionId: string;
  triageRequestId: string;
  userConsent: ConsentRecord[];
  clinicalSummary: ClinicalSummary;
  location?: GeoLocation;
  callbackNumber?: string;
  submittedAt: string;
  /** Idempotency key to prevent duplicate emergency alerts. */
  idempotencyKey: string;
}

export interface EscalationResponse {
  status: ActionStatus;
  referenceId: string;
  destination?: string;
  timestamp: string;
  errorMessage?: string;
  simulated: boolean;
}

export interface ProviderContactRequest {
  sessionId: string;
  triageRequestId: string;
  userConsent: ConsentRecord[];
  clinicalSummary: ClinicalSummary;
  suggestedProviderType?: string;
  callbackNumber?: string;
  submittedAt: string;
  idempotencyKey: string;
}

export interface ProviderContactResponse {
  status: ActionStatus;
  referenceId: string;
  destination?: string;
  timestamp: string;
  errorMessage?: string;
  simulated: boolean;
}

export type AuditEventType =
  | "session_started"
  | "user_message"
  | "agent_message"
  | "tool_called"
  | "tool_completed"
  | "tool_failed"
  | "consent_changed"
  | "triage_completed"
  | "action_requested"
  | "action_completed"
  | "action_failed";

export interface AuditEvent {
  id: string;
  sessionId: string;
  eventType: AuditEventType;
  toolName?: string;
  requestId?: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

/** The finite set of agent orchestrator states. */
export type AgentState =
  | "idle"
  | "collecting_context"
  | "screening_for_emergency"
  | "asking_follow_up"
  | "awaiting_user_response"
  | "submitting_triage"
  | "triage_complete"
  | "presenting_level_1"
  | "presenting_level_2"
  | "presenting_level_3"
  | "awaiting_consent"
  | "executing_action"
  | "monitoring_action"
  | "completed"
  | "failed"
  | "fallback_required";

/** Names of the registered agent tools (the only actions the agent may take). */
export type ToolName =
  | "emergency_screening"
  | "generate_follow_up_question"
  | "submit_triage"
  | "generate_clinical_summary"
  | "get_emergency_number"
  | "request_medical_contact"
  | "escalate_emergency"
  | "check_escalation_status"
  | "update_symptoms"
  | "export_summary";

/** Envelope returned by every API route. */
export interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string; requestId?: string };
}
