/**
 * Clinical triage service — the SOURCE OF TRUTH for the final response level.
 *
 * The frontend and agent orchestrator must never compute the final triage
 * level themselves; they must call this service. The mock implementation is a
 * deterministic, conservative rule engine that returns schema-valid responses
 * matching the three demo scenarios. In production, SERVICE_MODE=auto plus a
 * TRIAGE_ENDPOINT routes to the real clinical service instead.
 *
 * NOTE: This mock is NOT a clinically validated triage system. It exists so the
 * end-to-end agent flow is demonstrable offline.
 */
import type {
  ClinicalSummary,
  FollowUpQuestion,
  TriageRequest,
  TriageResponse,
} from "../../shared/types.js";
import { config, useRealAdapter } from "../../server/config.js";
import { httpJson } from "../http-client.js";
import { triageResponseSchema } from "../../shared/schemas.js";
import { shortId, nowIso, delay } from "../../shared/util.js";
import { summaryService } from "../summary/index.js";
import { emergencyScreeningService } from "../emergency-screening/index.js";

export interface TriageService {
  triage(req: TriageRequest): Promise<TriageResponse>;
  readonly mode: "mock" | "real";
}

function collectText(req: TriageRequest): string {
  const parts = [req.chiefComplaint];
  for (const m of req.messages) if (m.role === "user") parts.push(m.content);
  for (const a of req.answers) {
    if (typeof a.answer === "string") parts.push(a.answer);
    else if (Array.isArray(a.answer)) parts.push(a.answer.join(" "));
  }
  return parts.join("  ").toLowerCase();
}

const LEVEL_1: Omit<TriageResponse, "clinicalSummary" | "requestId" | "timestamp"> = {
  triageLevel: 1,
  urgencyLabel: "General guidance",
  recommendedAction:
    "Monitor your symptoms and follow the general guidance provided.",
  timeframe: "Reassess if symptoms change or become worse.",
  warningSigns: [
    "A sudden severe headache",
    "Confusion or loss of consciousness",
    "Weakness or numbness",
    "Difficulty speaking",
    "Persistent vomiting",
  ],
  selfCareGuidance: [
    "Rest in a calm environment.",
    "Stay hydrated if you can drink normally.",
    "Monitor whether the symptom changes or becomes worse.",
  ],
  escalationRequired: false,
  confidenceStatus: "sufficient_information",
};

const LEVEL_2: Omit<TriageResponse, "clinicalSummary" | "requestId" | "timestamp"> = {
  triageLevel: 2,
  urgencyLabel: "Medical attention recommended within 24 hours",
  recommendedAction:
    "Arrange an assessment with a qualified healthcare professional within the next 24 hours.",
  timeframe: "Within 24 hours",
  warningSigns: [
    "Severe or rapidly worsening pain",
    "Fainting or confusion",
    "Persistent vomiting",
    "Blood in vomit or stool",
    "Difficulty breathing",
  ],
  selfCareGuidance: [],
  suggestedProviderType: "Primary care or urgent care",
  escalationRequired: false,
  confidenceStatus: "sufficient_information",
};

const LEVEL_3: Omit<TriageResponse, "clinicalSummary" | "requestId" | "timestamp"> = {
  triageLevel: 3,
  urgencyLabel: "Urgent medical help may be needed",
  recommendedAction: "Contact local emergency services immediately.",
  timeframe: "Now",
  warningSigns: [
    "Chest pressure",
    "Difficulty breathing",
    "Sweating",
    "Dizziness",
  ],
  selfCareGuidance: [],
  escalationRequired: true,
  confidenceStatus: "sufficient_information",
};

/**
 * Follow-up questions the triage service may request when information is
 * limited. Selection of the *next* question is done by the agent tool; this is
 * the pool the mock triage can attach to a "limited_information" response.
 */
export const FOLLOW_UP_POOL: FollowUpQuestion[] = [
  {
    questionId: "onset",
    question: "When did this start?",
    answerType: "single_select",
    answerOptions: ["Just now", "Today", "Yesterday", "A few days ago", "Longer"],
    canSkip: true,
    whyNeededCategory: "timing",
  },
  {
    questionId: "severity",
    question: "How would you rate the severity right now?",
    answerType: "single_select",
    answerOptions: ["Mild", "Moderate", "Severe"],
    canSkip: true,
    whyNeededCategory: "severity",
  },
  {
    questionId: "sudden_onset",
    question: "Did it start suddenly?",
    answerType: "boolean",
    canSkip: true,
    whyNeededCategory: "onset_pattern",
  },
  {
    questionId: "progression",
    question: "Is it improving, staying the same, or getting worse?",
    answerType: "single_select",
    answerOptions: ["Improving", "About the same", "Getting worse"],
    canSkip: true,
    whyNeededCategory: "progression",
  },
  {
    questionId: "associated_symptoms",
    question: "Do you have any other symptoms alongside this?",
    answerType: "text",
    canSkip: true,
    whyNeededCategory: "associated_symptoms",
  },
  {
    questionId: "relevant_conditions",
    question: "Do you have any relevant medical conditions?",
    answerType: "text",
    canSkip: true,
    whyNeededCategory: "history",
  },
];

class MockTriageService implements TriageService {
  readonly mode = "mock" as const;

  async triage(req: TriageRequest): Promise<TriageResponse> {
    await delay(config.mockLatencyMs);
    const text = collectText(req);

    // 1) Safety net first: run emergency screening. If it fires, force Level 3.
    const screen = await emergencyScreeningService.screen({
      sessionId: req.sessionId,
      chiefComplaint: req.chiefComplaint,
      messages: req.messages,
      answers: req.answers,
      availableVitalSigns: req.availableVitalSigns,
    });

    let base = LEVEL_1;
    let requestId = "demo-triage-level-1";

    if (screen.possibleEmergency || this.matchesLevel3(text)) {
      base = LEVEL_3;
      requestId = "demo-triage-level-3";
    } else if (this.matchesLevel2(text)) {
      base = LEVEL_2;
      requestId = "demo-triage-level-2";
    }

    const clinicalSummary: ClinicalSummary = summaryService.build({
      chiefComplaint: req.chiefComplaint,
      answers: req.answers,
      availableVitalSigns: req.availableVitalSigns,
      userContext: req.userContext,
      triage: { ...base, clinicalSummary: {} as ClinicalSummary, requestId, timestamp: nowIso() },
    });

    // Attach follow-ups only when information is limited AND not an emergency.
    const limited = base.triageLevel !== 3 && this.informationIsLimited(req);
    const followUps = limited
      ? FOLLOW_UP_POOL.filter(
          (q) => !req.answers.some((a) => a.questionId === q.questionId),
        ).slice(0, 3)
      : undefined;

    const response: TriageResponse = {
      ...base,
      clinicalSummary,
      followUpQuestions: followUps,
      confidenceStatus: limited ? "limited_information" : "sufficient_information",
      requestId: config.demoMode ? requestId : shortId("triage"),
      timestamp: nowIso(),
    };
    return triageResponseSchema.parse(response);
  }

  private matchesLevel3(text: string): boolean {
    const cardiac =
      /chest (pressure|pain|tight)/.test(text) &&
      /(breath|breathing|sweat|dizz|faint)/.test(text);
    return (
      cardiac ||
      /difficulty breathing|can'?t breathe|passed out|unconscious|stroke|slurred|thunderclap|anaphyla/.test(
        text,
      )
    );
  }

  private matchesLevel2(text: string): boolean {
    const persistent = /(persistent|since yesterday|for (a|two|three|several) days)/.test(text);
    const worse = /(worse|worsen|getting worse|slightly worse)/.test(text);
    const pain = /(abdominal pain|stomach pain|belly pain|abdomen)/.test(text);
    const moderate = /moderate/.test(text);
    return (pain && (persistent || worse || moderate)) || (persistent && worse);
  }

  private informationIsLimited(req: TriageRequest): boolean {
    // Consider information limited if fewer than 2 structured answers exist.
    const substantive = req.answers.filter(
      (a) => a.answer !== null && a.answer !== "" && a.source === "user",
    );
    return substantive.length < 2;
  }
}

class RealTriageService implements TriageService {
  readonly mode = "real" as const;
  constructor(private readonly endpoint: string) {}
  async triage(req: TriageRequest): Promise<TriageResponse> {
    // Safe to retry once: triage is a read-only assessment (idempotent).
    return httpJson<TriageResponse>(this.endpoint, {
      method: "POST",
      body: req,
      responseSchema: triageResponseSchema,
      timeoutMs: 10000,
      retries: 1,
    });
  }
}

export function createTriageService(): TriageService {
  const ep = config.endpoints.triage;
  return useRealAdapter(ep) ? new RealTriageService(ep) : new MockTriageService();
}

export const triageService = createTriageService();
