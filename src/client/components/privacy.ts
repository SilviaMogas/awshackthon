/** PrivacyScreen + ClearSessionButton. */
import { el } from "../dom.js";
import type { AppState } from "../store.js";

export function privacyScreen(
  state: AppState,
  t: (k: string) => string,
  actions: { onBack: () => void; onClear: () => void },
): HTMLElement {
  const item = (s: string): HTMLElement => el("li", {}, s);
  return el(
    "div",
    { class: "card stack" },
    el("h2", {}, t("privacy_title")),
    el("h3", {}, "What information is collected"),
    el(
      "ul",
      { class: "checklist" },
      item("Your described health concern and answers to follow-up questions."),
      item("Approximate age range, country and preferred language."),
      item("Approximate location — only if you explicitly allow it."),
      item("Consent records with timestamps."),
    ),
    el("h3", {}, "Why it is collected"),
    el("p", {}, "To let the clinical triage service determine the safest next step and to prepare a factual handoff summary."),
    el("h3", {}, "What may be shared, and only with consent"),
    el(
      "ul",
      { class: "checklist" },
      item("Health information — shared only after you explicitly consent."),
      item("Location — shared only after separate explicit consent."),
      item("Provider contact — only if you ask us to contact a provider."),
    ),
    el("h3", {}, "Demonstration data"),
    el("p", { class: "small muted" }, state.demoMode
      ? "Demo Mode is ON. API responses and any escalation are SIMULATED and clearly labelled. No real medical team is contacted."
      : "Live mode. Real integrations are used only when configured."),
    el("h3", {}, "Your session"),
    el("p", { class: "small muted" }, "Sensitive medical data is not stored permanently in your browser. You can clear the current session at any time."),
    el(
      "div",
      { class: "btn-row" },
      el("button", { class: "btn secondary", onclick: actions.onBack }, t("back")),
      el("button", { class: "btn danger", onclick: actions.onClear }, t("clear_session")),
    ),
  );
}
