/** Screen renderers: welcome, location, concern, questions, processing, results. */
import { el } from "../dom.js";
import type { AppState } from "../store.js";
import type { FollowUpQuestion, SymptomAnswer, TriageResponse } from "../../shared/types.js";
import { SUPPORTED_COUNTRIES } from "../../shared/constants.js";
import { safetyNotice, demoBadge, warningSignsList, checklist } from "./common.js";

export interface ScreenActions {
  goTo: (screen: AppState["screen"]) => void;
  startAssessment: () => void;
  runScenario: (id: 1 | 2 | 3) => void;
  setContext: (patch: Partial<AppState["userContext"]>) => void;
  submitConcern: (text: string) => void;
  urgentShortcut: () => void;
  answerQuestion: (answer: SymptomAnswer, skip?: boolean) => void;
  editAnswer: (questionId: string) => void;
  symptomsChanged: () => void;
  createSummary: () => void;
  startAgain: () => void;
  findCare: () => void;
  requestAppointment: () => void;
  notifyTeam: () => void;
  voiceInput: () => void;
}

const AGE_RANGES: { value: string; label: string }[] = [
  { value: "under_12", label: "Under 12" },
  { value: "12_17", label: "12–17" },
  { value: "18_39", label: "18–39" },
  { value: "40_64", label: "40–64" },
  { value: "65_plus", label: "65+" },
];

export function welcomeScreen(
  state: AppState,
  t: (k: string) => string,
  a: ScreenActions,
): HTMLElement {
  return el(
    "div",
    { class: "stack" },
    state.demoMode ? el("div", { class: "center" }, demoBadge(t)) : false,
    el(
      "div",
      { class: "card stack" },
      el("h2", {}, t("app_name")),
      el("p", { class: "muted" }, t("welcome_intro")),
      safetyNotice(t),
      el("button", { class: "btn", onclick: a.startAssessment }, t("start_assessment")),
      state.demoMode
        ? el(
            "div",
            { class: "btn-row" },
            el("button", { class: "btn secondary", onclick: () => a.runScenario(1) }, t("scenario_1")),
            el("button", { class: "btn secondary", onclick: () => a.runScenario(2) }, t("scenario_2")),
            el("button", { class: "btn secondary", onclick: () => a.runScenario(3) }, t("scenario_3")),
          )
        : false,
      el("button", { class: "btn link", onclick: () => a.goTo("privacy") }, t("privacy_link")),
    ),
  );
}

export function locationScreen(
  state: AppState,
  t: (k: string) => string,
  a: ScreenActions,
): HTMLElement {
  const uc = state.userContext;
  const isMinor = uc.ageRange === "under_12" || uc.ageRange === "12_17";
  return el(
    "div",
    { class: "card stack" },
    el("h2", {}, t("step_location_title")),
    el("label", { class: "small muted", for: "country" }, t("country")),
    el(
      "select",
      {
        id: "country",
        class: "select",
        onchange: (e) => a.setContext({ country: (e.target as HTMLSelectElement).value }),
      },
      ...SUPPORTED_COUNTRIES.map((c) => el("option", { value: c.code }, `${c.name} (${c.code})`)),
    ),
    el("label", { class: "small muted", for: "age" }, t("age_range")),
    el(
      "select",
      {
        id: "age",
        class: "select",
        onchange: (e) => a.setContext({ ageRange: ((e.target as HTMLSelectElement).value || undefined) as never }),
      },
      el("option", { value: "" }, "—"),
      ...AGE_RANGES.map((r) => el("option", { value: r.value }, r.label)),
    ),
    el(
      "label",
      { class: "consent-row" },
      el("input", {
        type: "checkbox",
        checked: uc.locationSharingConsent,
        onchange: (e) => a.setContext({ locationSharingConsent: (e.target as HTMLInputElement).checked }),
      }),
      el("span", {}, t("allow_location")),
    ),
    isMinor ? el("div", { class: "safety" }, t("minor_notice")) : false,
    el(
      "div",
      { class: "btn-row" },
      el("button", { class: "btn secondary", onclick: () => a.goTo("welcome") }, t("back")),
      el("button", { class: "btn", onclick: () => a.goTo("concern") }, t("continue")),
    ),
  );
  // Note: selects default value set by caller via re-render values below.
}

export function concernScreen(
  state: AppState,
  t: (k: string) => string,
  a: ScreenActions,
): HTMLElement {
  const examples = [
    "Mild headache since this morning, no fever.",
    "Abdominal pain since yesterday, moderate and slightly worse.",
    "Sudden chest pressure with difficulty breathing.",
  ];
  const ta = el("textarea", {
    class: "textarea",
    id: "concern",
    placeholder: t("concern_placeholder"),
    value: state.chiefComplaint,
  }) as HTMLTextAreaElement;

  return el(
    "div",
    { class: "card stack" },
    el("h2", {}, t("concern_title")),
    el("p", {}, t("concern_prompt")),
    ta,
    el(
      "div",
      { class: "btn-row" },
      el(
        "button",
        { class: "btn secondary small", onclick: a.voiceInput },
        `🎤 ${state.demoMode ? t("voice_simulated") : t("voice_input")}`,
      ),
      el(
        "button",
        { class: "btn danger small", onclick: a.urgentShortcut },
        `🚨 ${t("urgent_shortcut")}`,
      ),
    ),
    el("p", { class: "small muted", style: "margin-bottom:0" }, t("examples")),
    el(
      "div",
      { class: "chip-row" },
      ...examples.map((ex) =>
        el("button", { class: "chip", onclick: () => { ta.value = ex; } }, ex),
      ),
    ),
    el(
      "div",
      { class: "btn-row" },
      el("button", { class: "btn secondary", onclick: () => a.goTo("location") }, t("back")),
      el(
        "button",
        { class: "btn", onclick: () => a.submitConcern(ta.value.trim()) },
        t("submit"),
      ),
    ),
  );
}

export function questionsScreen(
  state: AppState,
  t: (k: string) => string,
  a: ScreenActions,
): HTMLElement {
  const q = state.currentQuestion;
  const progress = Math.min(90, 25 + state.answers.length * 15);

  const prev = state.answers.length
    ? el(
        "details",
        { class: "prev" },
        el("summary", {}, `${t("previous_answers")} (${state.answers.length})`),
        ...state.answers.map((ans) =>
          el(
            "div",
            { class: "pa" },
            el("span", {}, ans.question),
            el(
              "span",
              {},
              String(Array.isArray(ans.answer) ? ans.answer.join(", ") : ans.answer),
              el("button", { class: "btn link", onclick: () => a.editAnswer(ans.questionId) }, ` ${t("edit")}`),
            ),
          ),
        ),
      )
    : false;

  return el(
    "div",
    { class: "stack" },
    el("div", { class: "progress" }, el("span", { style: `width:${progress}%` })),
    prev || el("div", {}),
    q ? questionCard(q, t, a) : el("div", { class: "card" }, el("p", {}, "…")),
    el(
      "div",
      { class: "btn-row" },
      el("button", { class: "btn ghost small", onclick: a.symptomsChanged }, t("symptoms_changed")),
    ),
  );
}

function questionCard(
  q: FollowUpQuestion,
  t: (k: string) => string,
  a: ScreenActions,
): HTMLElement {
  const mk = (answer: SymptomAnswer["answer"]): SymptomAnswer => ({
    questionId: q.questionId,
    question: q.question,
    answer,
    answeredAt: new Date().toISOString(),
    source: "user",
  });

  let control: HTMLElement;
  if (q.answerType === "boolean") {
    control = el(
      "div",
      { class: "btn-row" },
      el("button", { class: "btn secondary", onclick: () => a.answerQuestion(mk(true)) }, "Yes"),
      el("button", { class: "btn secondary", onclick: () => a.answerQuestion(mk(false)) }, "No"),
    );
  } else if (q.answerType === "single_select" && q.answerOptions) {
    control = el(
      "div",
      { class: "answer-opt" },
      ...q.answerOptions.map((opt) =>
        el("button", { class: "opt-btn", onclick: () => a.answerQuestion(mk(opt)) }, opt),
      ),
    );
  } else if (q.answerType === "number") {
    const inp = el("input", { class: "input", type: "number" }) as HTMLInputElement;
    control = el(
      "div",
      { class: "stack" },
      inp,
      el("button", { class: "btn", onclick: () => a.answerQuestion(mk(Number(inp.value))) }, t("submit")),
    );
  } else {
    const inp = el("input", { class: "input", type: "text" }) as HTMLInputElement;
    control = el(
      "div",
      { class: "stack" },
      inp,
      el("button", { class: "btn", onclick: () => a.answerQuestion(mk(inp.value.trim())) }, t("submit")),
    );
  }

  return el(
    "div",
    { class: "card stack" },
    el("h2", {}, q.question),
    control,
    el(
      "div",
      { class: "btn-row" },
      el("button", { class: "btn ghost small", onclick: () => a.answerQuestion(mk("I do not know")) }, t("i_dont_know")),
      el("button", { class: "btn ghost small", onclick: () => a.answerQuestion(mk("Prefer not to answer")) }, t("prefer_not")),
      q.canSkip
        ? el("button", { class: "btn ghost small", onclick: () => a.answerQuestion(mk(null), true) }, t("skip"))
        : false,
    ),
  );
}

export function processingScreen(t: (k: string) => string): HTMLElement {
  return el(
    "div",
    { class: "card processing", ariaLive: "polite" },
    el("div", { class: "spinner" }),
    el("h2", {}, t("processing_title")),
    el("p", { class: "muted" }, t("processing_body")),
  );
}

/** Level 1 result screen. */
export function levelOneResult(
  state: AppState,
  t: (k: string) => string,
  a: ScreenActions,
): HTMLElement {
  const tr = state.triage as TriageResponse;
  return el(
    "div",
    { class: "stack" },
    el(
      "div",
      { class: "level level-1" },
      el("h2", {}, t("level1_title")),
      el("p", { class: "tf" }, tr.recommendedAction),
    ),
    el(
      "div",
      { class: "card stack" },
      el("h3", {}, t("what_to_do_now")),
      checklist(tr.selfCareGuidance ?? []),
      el("h3", {}, t("monitor")),
      checklist(tr.warningSigns.slice(0, 3)),
      warningSignsList(t, tr.warningSigns),
      el("p", { class: "small muted" }, `${t("reassess")}: ${tr.timeframe}`),
    ),
    el(
      "div",
      { class: "btn-row" },
      el("button", { class: "btn", onclick: a.createSummary }, t("create_summary")),
      el("button", { class: "btn secondary", onclick: a.symptomsChanged }, t("my_symptoms_changed")),
      el("button", { class: "btn secondary", onclick: a.startAgain }, t("start_again")),
    ),
  );
}

/** Level 2 result screen. */
export function levelTwoResult(
  state: AppState,
  t: (k: string) => string,
  a: ScreenActions,
): HTMLElement {
  const tr = state.triage as TriageResponse;
  return el(
    "div",
    { class: "stack" },
    el(
      "div",
      { class: "level level-2" },
      el("h2", {}, t("level2_title")),
      el("p", { class: "tf" }, `${t("recommended_timeframe")}: ${tr.timeframe}`),
      el("p", {}, tr.recommendedAction),
      tr.suggestedProviderType
        ? el("p", { class: "small muted" }, `${t("recommended_provider")}: ${tr.suggestedProviderType}`)
        : false,
    ),
    el("div", { class: "card" }, warningSignsList(t, tr.warningSigns)),
    el(
      "div",
      { class: "btn-row" },
      el("button", { class: "btn", onclick: a.requestAppointment }, t("request_appointment")),
      el("button", { class: "btn secondary", onclick: a.createSummary }, t("share_summary")),
    ),
    el(
      "div",
      { class: "btn-row" },
      el("button", { class: "btn secondary", onclick: a.symptomsChanged }, t("symptoms_worse")),
      el("button", { class: "btn ghost", onclick: a.startAgain }, t("arrange_myself")),
    ),
  );
}
