/**
 * Application controller. Wires the store, API client, agent loop and screens.
 * This is the interaction layer only — all triage decisions come from the
 * server-side agent + clinical triage service (the source of truth).
 */
import { store, AppState, ChatEntry } from "./store.js";
import { api, ApiError } from "./api.js";
import { createTranslator, isRtl, Lang } from "./i18n.js";
import { el, mount } from "./dom.js";
import { DEMO_SCENARIOS } from "./demo.js";
import { voiceService } from "./voice.js";
import { POLICY_VERSION, DISCLAIMER } from "../shared/constants.js";
import { nowIso, genId } from "../shared/util.js";
import type {
  ConsentRecord,
  ConsentType,
  SymptomAnswer,
} from "../shared/types.js";

import { appHeader } from "./components/header.js";
import { offlineNotice, errorBar } from "./components/common.js";
import {
  welcomeScreen,
  locationScreen,
  concernScreen,
  questionsScreen,
  processingScreen,
  levelOneResult,
  levelTwoResult,
  ScreenActions,
} from "./components/screens.js";
import { levelThreeResult } from "./components/level3.js";
import { chatScreen, ChatActions } from "./components/chat.js";
import { privacyScreen } from "./components/privacy.js";
import { clinicalSummaryCard, buildSummaryText } from "./components/summary-card.js";
import { technicalPanel } from "./components/technical-panel.js";
import { consentModal, providerContactResult } from "./components/consent.js";

const root = document.getElementById("app") as HTMLElement;
let pendingConsent: null | { kind: "provider" | "escalation" } = null;

// ---------------------------------------------------------------------------
// Bootstrapping
// ---------------------------------------------------------------------------
async function boot(): Promise<void> {
  store.set({ policyVersion: POLICY_VERSION, disclaimer: DISCLAIMER });
  try {
    const cfg = await api.getConfig();
    store.set({
      demoMode: cfg.demoMode,
      simulatedDemoLabel: cfg.simulated.escalation || cfg.simulated.providerContact,
      disclaimer: cfg.disclaimer || DISCLAIMER,
      policyVersion: cfg.policyVersion || POLICY_VERSION,
    });
  } catch {
    // Config is best-effort; defaults keep the app usable offline.
  }
  window.addEventListener("online", () => store.set({ online: true }));
  window.addEventListener("offline", () => store.set({ online: false }));
  store.subscribe(render);
  render(store.get());
}

// ---------------------------------------------------------------------------
// Agent + action helpers
// ---------------------------------------------------------------------------
async function refreshAudit(): Promise<void> {
  try {
    const { events } = await api.audit(store.get().userContext.sessionId);
    store.set({ auditEvents: events });
  } catch {
    /* non-critical */
  }
}

// ---- Chat log helpers -----------------------------------------------------
function pushChat(role: ChatEntry["role"], content: string, kind: ChatEntry["kind"]): void {
  const s = store.get();
  store.set({ chatLog: [...s.chatLog, { id: genId("msg"), role, content, kind, timestamp: nowIso() }] });
}

/** Add a transient "typing" bubble so the chat feels responsive. */
function pushTyping(t: (k: string) => string): string {
  const id = genId("typing");
  const s = store.get();
  store.set({
    chatLog: [...s.chatLog, { id, role: "agent", content: t("chat_agent_typing"), kind: "typing", timestamp: nowIso() }],
  });
  return id;
}
function removeChat(id: string): void {
  const s = store.get();
  store.set({ chatLog: s.chatLog.filter((e) => e.id !== id) });
}

async function callAgent(opts: {
  message?: string;
  answer?: SymptomAnswer;
  forceTriage?: boolean;
  /** In the chat view we keep screen=chat and render bubbles instead of pages. */
  chat?: boolean;
}): Promise<void> {
  const s = store.get();
  const t = createTranslator(s.lang);
  // The product is fully conversational: every agent interaction happens in the
  // chat view. We no longer route to the legacy page-flow screens, which could
  // strand the user on the old "What is happening?" screen after an error.
  const inChat = true;

  // Make sure we are on the chat screen before the round-trip so a slow or
  // failed request never leaves the user on a stale legacy screen.
  store.set({ screen: "chat", loading: true, error: null });

  const typingId = inChat ? pushTyping(t) : null;
  try {
    const res = await api.agentMessage({
      userContext: s.userContext,
      message: opts.message,
      answer: opts.answer,
      vitalSigns: s.vitalSigns,
      forceTriage: opts.forceTriage,
    });

    if (typingId) removeChat(typingId);

    const patch: Partial<AppState> = {
      agentState: res.state,
      transitions: res.transitions,
      lastTool: res.lastTool,
      loading: false,
      currentQuestion: res.question,
    };

    if (res.triage) {
      patch.triage = res.triage;
      patch.summary = res.triage.clinicalSummary;
      patch.screen = inChat ? "chat" : "result";
      if (res.triage.triageLevel === 3) {
        await ensureEmergencyNumber();
      }
    } else if (res.question) {
      patch.screen = inChat ? "chat" : "questions";
    } else if (res.fallback) {
      patch.screen = inChat ? "chat" : "result";
      patch.error = res.userMessage;
    }
    store.set(patch);

    // In chat mode, turn the agent turn into a bubble (question / result / text).
    if (inChat) {
      const kind: ChatEntry["kind"] = res.triage
        ? "result"
        : res.question
          ? "question"
          : "text";
      pushChat("agent", res.userMessage, kind);
      scrollChatToBottom();
    }
    await refreshAudit();
  } catch (e) {
    if (typingId) removeChat(typingId);
    handleError(e);
    if (inChat) {
      pushChat("agent", store.get().error ?? createTranslator(store.get().lang)("error_generic"), "text");
    }
  }
}

function scrollChatToBottom(): void {
  window.setTimeout(() => {
    const log = document.getElementById("chat-log");
    if (log) log.scrollTop = log.scrollHeight;
  }, 30);
}

async function ensureEmergencyNumber(): Promise<void> {
  const s = store.get();
  try {
    const r = await api.emergencyNumber(s.userContext.country ?? "SA");
    store.set({ emergencyNumber: { number: r.emergencyNumber, label: r.label } });
  } catch {
    // Never invent a number. Fall back to the safe universal placeholder.
    store.set({ emergencyNumber: { number: "112", label: "International emergency number — verify locally" } });
  }
}

function recordConsent(type: ConsentType, granted: boolean): ConsentRecord {
  const rec: ConsentRecord = {
    consentType: type,
    granted,
    timestamp: nowIso(),
    policyVersion: store.get().policyVersion,
  };
  const s = store.get();
  const consent = s.consent.filter((c) => c.consentType !== type);
  consent.push(rec);
  const ucPatch: Partial<AppState["userContext"]> = {};
  if (type === "health_data_sharing") ucPatch.healthDataSharingConsent = granted;
  if (type === "location_sharing") ucPatch.locationSharingConsent = granted;
  if (type === "provider_contact") ucPatch.providerContactConsent = granted;
  store.set({
    consent,
    userContext: {
      ...s.userContext,
      ...ucPatch,
      consentTimestamps: { ...(s.userContext.consentTimestamps ?? {}), [type]: rec.timestamp },
    },
  });
  return rec;
}

async function performProviderContact(): Promise<void> {
  const s = store.get();
  try {
    store.set({ loading: true, error: null });
    const res = await api.providerContact({
      sessionId: s.userContext.sessionId,
      triageRequestId: s.triage?.requestId ?? "unknown",
      userConsent: s.consent,
      clinicalSummary: s.summary ?? (s.triage?.clinicalSummary as never),
      suggestedProviderType: s.triage?.suggestedProviderType,
      submittedAt: nowIso(),
      idempotencyKey: genId("pc"),
    });
    store.set({ providerContact: res, loading: false });
    await refreshAudit();
  } catch (e) {
    handleError(e);
  }
}

async function performEscalation(): Promise<void> {
  const s = store.get();
  try {
    store.set({ loading: true, error: null });
    const res = await api.escalate({
      sessionId: s.userContext.sessionId,
      triageRequestId: s.triage?.requestId ?? "unknown",
      userConsent: s.consent,
      clinicalSummary: s.summary ?? (s.triage?.clinicalSummary as never),
      location: s.userContext.locationSharingConsent ? s.userContext.currentLocation : undefined,
      submittedAt: nowIso(),
      idempotencyKey: s.escalation?.referenceId ? `dup-${s.escalation.referenceId}` : genId("esc"),
    });
    store.set({ escalation: res, loading: false });
    await refreshAudit();
    if (res.simulated || res.status !== "failed") monitorEscalation(res.referenceId);
  } catch (e) {
    handleError(e);
  }
}

let monitorTimer: number | null = null;
function monitorEscalation(referenceId: string): void {
  if (monitorTimer) window.clearInterval(monitorTimer);
  let polls = 0;
  monitorTimer = window.setInterval(async () => {
    polls += 1;
    try {
      const res = await api.escalationStatus(referenceId);
      store.set({ escalation: res });
      if (res.status === "acknowledged" || res.status === "completed" || polls >= 4) {
        if (monitorTimer) window.clearInterval(monitorTimer);
      }
    } catch {
      if (monitorTimer) window.clearInterval(monitorTimer);
    }
  }, 1600);
}

function handleError(e: unknown): void {
  const t = createTranslator(store.get().lang);
  let msg = t("error_generic");
  if (e instanceof ApiError) {
    if (e.code === "CONSENT_REQUIRED") msg = t("consent_required_title");
    else if (e.code === "TIMEOUT" || e.code === "NETWORK")
      msg =
        "We could not complete the automated assessment. If your symptoms are severe, sudden or getting worse, contact local emergency services or seek urgent medical care now.";
    else msg = e.message;
  }
  store.set({ loading: false, error: msg });
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------
function openChat(): void {
  const s = store.get();
  const t = createTranslator(s.lang);
  // Fresh conversation each time the chat is opened from welcome.
  store.resetAssessment(true);
  store.set({ screen: "chat" });
  pushChat("agent", t("chat_greeting"), "text");
}

/** Ensure we are in the chat with a greeting, without wiping an in-progress one. */
function ensureChatStarted(): void {
  const s = store.get();
  if (s.screen !== "chat") store.set({ screen: "chat" });
  if (store.get().chatLog.length === 0) {
    const t = createTranslator(store.get().lang);
    pushChat("agent", t("chat_greeting"), "text");
  }
}

const actions: ScreenActions = {
  goTo: (screen) => store.set({ screen, error: null }),
  startAssessment: () => openChat(),
  runScenario: async (id) => {
    store.resetAssessment(true);
    const sc = DEMO_SCENARIOS[id];
    // Demo scenarios run inside the chat so judges see the conversation.
    store.set({ chiefComplaint: sc.statement, screen: "chat" });
    pushChat("user", sc.statement, "text");
    await callAgent({ message: sc.statement, forceTriage: true, chat: true });
  },
  setContext: (patch) => {
    const s = store.get();
    store.set({ userContext: { ...s.userContext, ...patch } });
  },
  submitConcern: async (text) => {
    if (!text) return;
    // Route through the chat: ensure the greeting exists, echo the message.
    ensureChatStarted();
    pushChat("user", text, "text");
    store.set({ chiefComplaint: text });
    await callAgent({ message: text, chat: true });
  },
  urgentShortcut: async () => {
    // Emergency shortcut: begin urgent safety screening immediately.
    const s = store.get();
    const msg = s.chiefComplaint || "I need urgent help. I feel very unwell.";
    ensureChatStarted();
    pushChat("user", msg, "text");
    store.set({ chiefComplaint: msg });
    await callAgent({ message: msg, forceTriage: true, chat: true });
  },
  answerQuestion: async (answer, skip) => {
    const s = store.get();
    const answers = s.answers.filter((a) => a.questionId !== answer.questionId);
    const finalAnswer = skip ? { ...answer, answer: "Skipped" } : answer;
    answers.push(finalAnswer);
    // Echo the chosen answer as a user bubble in the conversation, formatted
    // for humans (booleans -> Yes/No, arrays -> comma list).
    const t = createTranslator(s.lang);
    let shown: string;
    if (typeof finalAnswer.answer === "boolean") {
      shown = finalAnswer.answer ? t("yes") : t("no");
    } else if (Array.isArray(finalAnswer.answer)) {
      shown = finalAnswer.answer.join(", ");
    } else {
      shown = String(finalAnswer.answer);
    }
    pushChat("user", shown, "text");
    store.set({ answers });
    await callAgent({ answer: finalAnswer, chat: true });
  },
  editAnswer: (questionId) => {
    const s = store.get();
    store.set({ answers: s.answers.filter((a) => a.questionId !== questionId) });
    // Re-triage is triggered on the next answer submission in the chat.
  },
  symptomsChanged: async () => {
    // update_symptoms tool: force reassessment through the agent.
    ensureChatStarted();
    pushChat("user", createTranslator(store.get().lang)("symptoms_changed"), "text");
    await callAgent({ forceTriage: false, chat: true });
  },
  createSummary: () => store.set({ screen: "summary" }),
  startAgain: () => openChat(),
  findCare: () => store.set({ screen: "summary" }),
  requestAppointment: () => {
    pendingConsent = { kind: "provider" };
    store.set({});
  },
  notifyTeam: () => {
    pendingConsent = { kind: "escalation" };
    store.set({});
  },
  voiceInput: async () => {
    const s = store.get();
    const demoText = DEMO_SCENARIOS[1].statement;
    const r = await voiceService.transcribe(s.chiefComplaint || demoText);
    if (s.screen === "chat") {
      // Put the transcribed text straight into the conversation.
      pushChat("user", r.text, "text");
      store.set({ chiefComplaint: s.chiefComplaint || r.text });
      await callAgent({ message: r.text, chat: true });
    } else {
      store.set({ chiefComplaint: r.text });
    }
  },
};

/** Chat-specific actions (superset of ScreenActions). */
const chatActions: ChatActions = {
  ...actions,
  sendMessage: async (text) => {
    const s = store.get();
    pushChat("user", text, "text");
    // The first user message becomes the chief complaint.
    if (!s.chiefComplaint) store.set({ chiefComplaint: text });
    scrollChatToBottom();
    // If a follow-up question is pending and it's free-text/number, treat this
    // message as the answer to that question; otherwise it's a new message.
    const q = s.currentQuestion;
    if (q && (q.answerType === "text" || q.answerType === "number")) {
      const answer: SymptomAnswer = {
        questionId: q.questionId,
        question: q.question,
        answer: q.answerType === "number" ? Number(text) : text,
        answeredAt: nowIso(),
        source: "user",
      };
      const answers = s.answers.filter((a) => a.questionId !== q.questionId);
      answers.push(answer);
      store.set({ answers });
      await callAgent({ answer, chat: true });
    } else {
      await callAgent({ message: text, chat: true });
    }
  },
};

// ---------------------------------------------------------------------------
// Consent modal handling
// ---------------------------------------------------------------------------
function renderConsentModal(s: AppState, t: (k: string) => string): HTMLElement | null {
  if (!pendingConsent) return null;
  const kind = pendingConsent.kind;
  const isEsc = kind === "escalation";
  const sharedInfo = [
    "Your structured clinical summary (as shown).",
    "Triage level and recommended action.",
    isEsc && s.userContext.locationSharingConsent ? "Your approximate location." : "No location will be shared unless you consent.",
  ];
  const items = [
    { type: "health_data_sharing", label: t("consent_health"), checked: s.userContext.healthDataSharingConsent, required: true },
    ...(isEsc
      ? [{ type: "location_sharing", label: t("consent_location"), checked: s.userContext.locationSharingConsent, required: false }]
      : [{ type: "provider_contact", label: t("consent_provider"), checked: s.userContext.providerContactConsent, required: true }]),
  ];
  const required: ConsentType[] = isEsc
    ? ["health_data_sharing", "emergency_escalation"]
    : ["health_data_sharing", "provider_contact"];

  const hasRequired = (): boolean =>
    required.every((r) =>
      r === "emergency_escalation"
        ? true // granted implicitly on confirm
        : store.get().consent.some((c) => c.consentType === r && c.granted),
    );

  return consentModal(t, {
    title: t("consent_required_title"),
    sharedInfo: sharedInfo.filter(Boolean) as string[],
    items,
    onToggle: (type, checked) => {
      recordConsent(type as ConsentType, checked);
    },
    onCancel: () => {
      pendingConsent = null;
      store.set({});
    },
    onConfirm: async () => {
      if (isEsc) recordConsent("emergency_escalation", true);
      pendingConsent = null;
      store.set({});
      if (isEsc) await performEscalation();
      else await performProviderContact();
    },
    confirmDisabled: !hasRequired(),
  });
}

// ---------------------------------------------------------------------------
// Summary export
// ---------------------------------------------------------------------------
function exportSummary(kind: "copy" | "download"): void {
  const text = buildSummaryText(store.get());
  if (kind === "copy") {
    void navigator.clipboard?.writeText(text).catch(() => undefined);
    const t = createTranslator(store.get().lang);
    store.set({ error: null });
    flash(t("copied"));
  } else {
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `health-summary-${store.get().userContext.sessionId}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }
}

function flash(message: string): void {
  const note = el("div", { class: "offline", style: "position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:60" }, message);
  document.body.appendChild(note);
  window.setTimeout(() => note.remove(), 1400);
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------
function render(s: AppState): void {
  const t = createTranslator(s.lang);
  document.documentElement.lang = s.lang;
  document.documentElement.dir = isRtl(s.lang) ? "rtl" : "ltr";

  const header = appHeader(s, t, {
    onLang: (lang) => {
      store.set({ lang: lang as Lang, userContext: { ...s.userContext, language: lang } });
    },
    onToggleTech: () => store.set({ showTechnicalPanel: !s.showTechnicalPanel }),
    onRunScenario: (id) => void actions.runScenario(id),
    onReset: () => {
      store.resetAssessment(true);
      store.set({ screen: "welcome" });
    },
  });

  const body = renderScreen(s, t);
  const modal = renderConsentModal(s, t);
  const tech = s.showTechnicalPanel ? technicalPanel(s, t) : null;

  mount(
    root,
    header,
    !s.online ? offlineNotice(t) : el("div", { class: "hidden" }),
    s.error ? errorBar(s.error) : el("div", { class: "hidden" }),
    body,
    tech ?? el("div", { class: "hidden" }),
    el("footer", { class: "footer" }, `${t("app_name")} · ${s.demoMode ? t("demo_badge") : "live"} · policy ${s.policyVersion}`),
  );

  // Remove any previously-mounted consent modal before (re)adding the current
  // one. Without this, every re-render (e.g. ticking a consent box) would stack
  // a new overlay on top of a stale one, so the visible modal looked frozen.
  document.querySelectorAll(".overlay").forEach((n) => n.remove());
  if (modal) document.body.appendChild(modal);
}

function renderScreen(s: AppState, t: (k: string) => string): HTMLElement {
  if (s.loading && s.screen === "processing") return processingScreen(t);
  switch (s.screen) {
    case "welcome":
      return welcomeScreen(s, t, actions);
    case "location": {
      const node = locationScreen(s, t, actions);
      // set current values on selects
      const country = node.querySelector("#country") as HTMLSelectElement | null;
      if (country && s.userContext.country) country.value = s.userContext.country;
      const age = node.querySelector("#age") as HTMLSelectElement | null;
      if (age && s.userContext.ageRange) age.value = s.userContext.ageRange;
      return node;
    }
    case "concern":
      return concernScreen(s, t, actions);
    case "chat":
      return chatScreen(s, t, chatActions);
    case "questions":
      return questionsScreen(s, t, actions);
    case "processing":
      return processingScreen(t);
    case "result":
      return renderResult(s, t);
    case "summary":
      return renderSummary(s, t);
    case "privacy":
      return privacyScreen(s, t, {
        onBack: () => store.set({ screen: "welcome" }),
        onClear: async () => {
          if (window.confirm(t("clear_session_confirm"))) {
            try {
              await api.clearSession(s.userContext.sessionId);
            } catch {
              /* ignore */
            }
            store.resetAssessment(true);
            store.set({ screen: "welcome" });
          }
        },
      });
    default:
      return welcomeScreen(s, t, actions);
  }
}

function renderResult(s: AppState, t: (k: string) => string): HTMLElement {
  if (!s.triage) {
    // Safety-critical fallback (triage failed).
    return el(
      "div",
      { class: "card stack" },
      el("h2", { style: "color:var(--red)" }, "Assessment could not be completed"),
      el("p", {}, s.error ?? t("error_generic")),
      el("button", { class: "btn", onclick: actions.startAgain }, t("start_again")),
    );
  }
  const level = s.triage.triageLevel;
  const result =
    level === 3
      ? levelThreeResult(s, t, actions)
      : level === 2
        ? levelTwoResult(s, t, actions)
        : levelOneResult(s, t, actions);
  const extra: HTMLElement[] = [];
  if (s.providerContact) extra.push(providerContactResult(t, s.providerContact));
  return el("div", { class: "stack" }, result, ...extra);
}

function renderSummary(s: AppState, t: (k: string) => string): HTMLElement {
  return el(
    "div",
    { class: "stack" },
    clinicalSummaryCard(s, t, {
      onCopy: () => exportSummary("copy"),
      onDownload: () => exportSummary("download"),
      onShare: () => exportSummary("copy"),
    }),
    el("button", { class: "btn secondary", onclick: () => store.set({ screen: "result" }) }, t("back")),
  );
}

void boot();
