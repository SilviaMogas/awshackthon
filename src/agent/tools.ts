/**
 * Registered agent tools. The agent orchestrator may ONLY invoke tools present
 * in this registry — there is no unrestricted autonomy. Each tool wraps a
 * validated service call and records sanitised input/output for the technical
 * demo panel (no secrets, no chain-of-thought, no raw sensitive PII).
 */
import type {
  EscalationRequest,
  ProviderContactRequest,
  ToolName,
  TriageRequest,
  EmergencyScreeningRequest,
} from "../shared/types.js";
import { emergencyScreeningService } from "../services/emergency-screening/index.js";
import { triageService } from "../services/triage/index.js";
import { emergencyNumberService } from "../services/emergency-numbers/index.js";
import { providerContactService } from "../services/provider-contact/index.js";
import { escalationService } from "../services/escalation/index.js";
import { summaryService } from "../services/summary/index.js";
import { nextFollowUpQuestion } from "./follow-up.js";

/** AWS service that would back each tool in production (for the tech panel). */
export const TOOL_AWS_MAPPING: Record<ToolName, string> = {
  emergency_screening: "Lambda + Bedrock (structured screen)",
  generate_follow_up_question: "Bedrock (structured output)",
  submit_triage: "API Gateway -> Clinical Triage Service",
  generate_clinical_summary: "Lambda + Bedrock (factual summary)",
  get_emergency_number: "Amazon Location Service / verified table",
  request_medical_contact: "Lambda -> Provider booking endpoint",
  escalate_emergency: "Lambda -> Emergency response endpoint",
  check_escalation_status: "Lambda -> Emergency response endpoint",
  update_symptoms: "Agent orchestrator (DynamoDB session)",
  export_summary: "Lambda (document render)",
};

/** A sanitised record of a single tool invocation for the technical panel. */
export interface ToolTrace {
  tool: ToolName;
  input: unknown;
  output: unknown;
  requestId?: string;
  durationMs: number;
  mode: "mock" | "real";
  simulated?: boolean;
  awsService: string;
}

/** Redact obviously sensitive fields before exposing a trace to the client. */
export function sanitizeForPanel(value: unknown): unknown {
  const SENSITIVE = new Set([
    "chiefComplaint",
    "callbackNumber",
    "latitude",
    "longitude",
    "accuracy",
    "content",
  ]);
  const walk = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        if (SENSITIVE.has(k)) {
          out[k] = "[redacted]";
        } else if (k === "messages" || k === "answers") {
          out[k] = Array.isArray(val) ? `[${(val as unknown[]).length} items]` : "[redacted]";
        } else {
          out[k] = walk(val);
        }
      }
      return out;
    }
    return v;
  };
  return walk(value);
}

async function timed<T>(fn: () => Promise<T>): Promise<{ value: T; ms: number }> {
  const start = Date.now();
  const value = await fn();
  return { value, ms: Date.now() - start };
}

export const tools = {
  async emergency_screening(req: EmergencyScreeningRequest): Promise<ToolTrace> {
    const { value, ms } = await timed(() => emergencyScreeningService.screen(req));
    return {
      tool: "emergency_screening",
      input: sanitizeForPanel(req),
      output: value,
      requestId: value.requestId,
      durationMs: ms,
      mode: emergencyScreeningService.mode,
      awsService: TOOL_AWS_MAPPING.emergency_screening,
    };
  },

  generate_follow_up_question(req: TriageRequest): ToolTrace {
    const start = Date.now();
    const q = nextFollowUpQuestion(req.answers);
    return {
      tool: "generate_follow_up_question",
      input: sanitizeForPanel({ answered: req.answers.map((a) => a.questionId) }),
      output: q,
      durationMs: Date.now() - start,
      mode: "mock",
      awsService: TOOL_AWS_MAPPING.generate_follow_up_question,
    };
  },

  async submit_triage(req: TriageRequest): Promise<ToolTrace> {
    const { value, ms } = await timed(() => triageService.triage(req));
    return {
      tool: "submit_triage",
      input: sanitizeForPanel(req),
      output: {
        triageLevel: value.triageLevel,
        urgencyLabel: value.urgencyLabel,
        escalationRequired: value.escalationRequired,
        confidenceStatus: value.confidenceStatus,
        requestId: value.requestId,
      },
      requestId: value.requestId,
      durationMs: ms,
      mode: triageService.mode,
      awsService: TOOL_AWS_MAPPING.submit_triage,
    };
  },

  async get_emergency_number(country: string): Promise<ToolTrace> {
    const { value, ms } = await timed(() => emergencyNumberService.get(country));
    return {
      tool: "get_emergency_number",
      input: { country },
      output: value,
      requestId: value.requestId,
      durationMs: ms,
      mode: emergencyNumberService.mode,
      awsService: TOOL_AWS_MAPPING.get_emergency_number,
    };
  },

  async request_medical_contact(req: ProviderContactRequest): Promise<ToolTrace> {
    const { value, ms } = await timed(() => providerContactService.request(req));
    return {
      tool: "request_medical_contact",
      input: sanitizeForPanel(req),
      output: value,
      requestId: value.referenceId,
      durationMs: ms,
      mode: providerContactService.mode,
      simulated: value.simulated,
      awsService: TOOL_AWS_MAPPING.request_medical_contact,
    };
  },

  async escalate_emergency(req: EscalationRequest): Promise<ToolTrace> {
    const { value, ms } = await timed(() => escalationService.escalate(req));
    return {
      tool: "escalate_emergency",
      input: sanitizeForPanel(req),
      output: value,
      requestId: value.referenceId,
      durationMs: ms,
      mode: escalationService.mode,
      simulated: value.simulated,
      awsService: TOOL_AWS_MAPPING.escalate_emergency,
    };
  },

  async check_escalation_status(referenceId: string): Promise<ToolTrace> {
    const { value, ms } = await timed(() => escalationService.status(referenceId));
    return {
      tool: "check_escalation_status",
      input: { referenceId },
      output: value,
      requestId: value.referenceId,
      durationMs: ms,
      mode: escalationService.mode,
      simulated: value.simulated,
      awsService: TOOL_AWS_MAPPING.check_escalation_status,
    };
  },

  generate_clinical_summary(req: TriageRequest): ToolTrace {
    const start = Date.now();
    const summary = summaryService.build({
      chiefComplaint: req.chiefComplaint,
      answers: req.answers,
      availableVitalSigns: req.availableVitalSigns,
      userContext: req.userContext,
    });
    return {
      tool: "generate_clinical_summary",
      input: sanitizeForPanel({ answered: req.answers.map((a) => a.questionId) }),
      output: { fields: Object.keys(summary).length },
      durationMs: Date.now() - start,
      mode: "mock",
      awsService: TOOL_AWS_MAPPING.generate_clinical_summary,
    };
  },
};

export const REGISTERED_TOOLS: ToolName[] = [
  "emergency_screening",
  "generate_follow_up_question",
  "submit_triage",
  "generate_clinical_summary",
  "get_emergency_number",
  "request_medical_contact",
  "escalate_emergency",
  "check_escalation_status",
  "update_symptoms",
  "export_summary",
];

export function isRegisteredTool(name: string): name is ToolName {
  return REGISTERED_TOOLS.includes(name as ToolName);
}
