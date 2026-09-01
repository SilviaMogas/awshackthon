/** Level 3 urgent/emergency result screen + EmergencyCallCard. */
import { el } from "../dom.js";
import type { AppState } from "../store.js";
import type { TriageResponse } from "../../shared/types.js";
import { warningSignsList } from "./common.js";
import { escalationStatus } from "./consent.js";
import type { ScreenActions } from "./screens.js";

export function emergencyCallCard(
  state: AppState,
  t: (k: string) => string,
): HTMLElement {
  const num = state.emergencyNumber?.number ?? "112";
  const label = state.emergencyNumber?.label ?? "";
  return el(
    "div",
    { class: "emg-call" },
    el("p", { style: "margin:0;font-weight:700" }, t("contact_emergency_now")),
    el("div", { class: "num" }, num),
    label ? el("p", { class: "small", style: "margin:0;opacity:.9" }, label) : false,
    el("a", { class: "call", href: `tel:${num}` }, `📞 ${num}`),
  );
}

export function levelThreeResult(
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
      { class: "level level-3" },
      el("h2", {}, t("level3_title")),
      el("p", { class: "tf" }, tr.recommendedAction),
    ),
    emergencyCallCard(state, t),
    el(
      "div",
      { class: "card stack" },
      el("p", { style: "font-weight:600" }, t("do_not_drive")),
      el("p", {}, t("ask_someone")),
    ),
    el(
      "div",
      { class: "card" },
      warningSignsList(t, tr.warningSigns, t("emergency_summary")),
    ),
    state.escalation
      ? escalationStatus(t, state.escalation)
      : el(
          "div",
          { class: "card stack" },
          el("p", { class: "muted small" }, t("safe_fallback")),
          el("button", { class: "btn danger", onclick: a.notifyTeam }, t("notify_team")),
        ),
    el(
      "div",
      { class: "btn-row" },
      el("button", { class: "btn secondary", onclick: a.createSummary }, t("create_summary")),
      el("button", { class: "btn ghost", onclick: a.startAgain }, t("new_assessment")),
    ),
  );
}
