/**
 * Predictable client state store (observable, reducer-free but immutable-ish).
 *
 * Holds: user context, conversation messages, current agent state, answers,
 * vital signs, consent records, triage request/result, clinical summary,
 * pending action, escalation result, audit events (client mirror), demo config
 * and API health status.
 *
 * Sensitive medical data is NOT persisted to localStorage. Only non-sensitive
 * UI/session preferences (language, country, demo flag, sessionId) are stored.
 */
import type {
  AgentMessage,
  AgentState,
  ClinicalSummary,
  ConsentRecord,
  EscalationResponse,
  FollowUpQuestion,
  ProviderContactResponse,
  SymptomAnswer,
  TriageResponse,
  UserContext,
  VitalSign,
  AuditEvent,
  AgeRange,
} from "../shared/types.js";
import type { Lang } from "./i18n.js";
import { genId } from "../shared/util.js";

export type Screen =
  | "welcome"
  | "location"
  | "concern"
  | "questions"
  | "processing"
  | "result"
  | "summary"
  | "privacy";

export interface AppState {
  screen: Screen;
  lang: Lang;
  demoMode: boolean;
  simulatedDemoLabel: boolean;
  userContext: UserContext;
  messages: AgentMessage[];
  agentState: AgentState;
  transitions: { from: AgentState; to: AgentState; at: string }[];
  chiefComplaint: string;
  answers: SymptomAnswer[];
  vitalSigns: VitalSign[];
  consent: ConsentRecord[];
  currentQuestion: FollowUpQuestion | null;
  triage: TriageResponse | null;
  summary: ClinicalSummary | null;
  escalation: EscalationResponse | null;
  providerContact: ProviderContactResponse | null;
  emergencyNumber: { number: string; label: string } | null;
  auditEvents: AuditEvent[];
  lastTool: unknown;
  loading: boolean;
  error: string | null;
  online: boolean;
  showTechnicalPanel: boolean;
  policyVersion: string;
  disclaimer: string;
}

const STORAGE_KEY = "hra_prefs_v1";

function loadPrefs(): {
  lang: Lang;
  country: string;
  sessionId: string;
} {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw) as { lang?: Lang; country?: string; sessionId?: string };
      return {
        lang: p.lang ?? "en",
        country: p.country ?? "SA",
        sessionId: p.sessionId ?? genId("sess"),
      };
    }
  } catch {
    /* ignore */
  }
  return { lang: "en", country: "SA", sessionId: genId("sess") };
}

function savePrefs(s: AppState): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        lang: s.lang,
        country: s.userContext.country,
        sessionId: s.userContext.sessionId,
      }),
    );
  } catch {
    /* ignore */
  }
}

export function initialState(): AppState {
  const prefs = loadPrefs();
  return {
    screen: "welcome",
    lang: prefs.lang,
    demoMode: true,
    simulatedDemoLabel: true,
    userContext: {
      sessionId: prefs.sessionId,
      language: prefs.lang,
      country: prefs.country,
      healthDataSharingConsent: false,
      locationSharingConsent: false,
      providerContactConsent: false,
      consentTimestamps: {},
    },
    messages: [],
    agentState: "idle",
    transitions: [],
    chiefComplaint: "",
    answers: [],
    vitalSigns: [],
    consent: [],
    currentQuestion: null,
    triage: null,
    summary: null,
    escalation: null,
    providerContact: null,
    emergencyNumber: null,
    auditEvents: [],
    lastTool: null,
    loading: false,
    error: null,
    online: navigator.onLine,
    showTechnicalPanel: false,
    policyVersion: "unknown",
    disclaimer: "",
  };
}

type Listener = (s: AppState) => void;

export class Store {
  private state: AppState;
  private listeners: Listener[] = [];

  constructor() {
    this.state = initialState();
  }

  get(): AppState {
    return this.state;
  }

  set(patch: Partial<AppState>): void {
    this.state = { ...this.state, ...patch };
    savePrefs(this.state);
    this.emit();
  }

  /** Reset conversation/health data but keep language/country prefs + sessionId. */
  resetAssessment(newSession = false): void {
    const keep = this.state;
    const sessionId = newSession
      ? genId("sess")
      : keep.userContext.sessionId;
    this.state = {
      ...initialState(),
      lang: keep.lang,
      demoMode: keep.demoMode,
      simulatedDemoLabel: keep.simulatedDemoLabel,
      policyVersion: keep.policyVersion,
      disclaimer: keep.disclaimer,
      userContext: {
        ...initialState().userContext,
        sessionId,
        language: keep.lang,
        country: keep.userContext.country,
      },
    };
    savePrefs(this.state);
    this.emit();
  }

  subscribe(fn: Listener): void {
    this.listeners.push(fn);
  }

  private emit(): void {
    for (const l of this.listeners) l(this.state);
  }
}

export const store = new Store();
export type { AgeRange };
