/** Reusable presentational components. */
import { el } from "../dom.js";
import type { AppState } from "../store.js";

export function safetyNotice(t: (k: string) => string): HTMLElement {
  return el("div", { class: "safety", role: "note" }, el("strong", {}, "⚠ "), t("safety_notice"));
}

export function demoBadge(t: (k: string) => string): HTMLElement {
  return el("span", { class: "badge demo" }, t("demo_badge"));
}

export function simulatedBadge(t: (k: string) => string): HTMLElement {
  return el("span", { class: "badge sim" }, t("simulated_label"));
}

export function apiStatusIndicator(state: AppState): HTMLElement {
  const mode = state.demoMode ? "DEMO / MOCK" : "LIVE";
  return el("span", { class: "badge mode", ariaLabel: "API mode" }, mode);
}

export function offlineNotice(t: (k: string) => string): HTMLElement {
  return el("div", { class: "offline", role: "alert" }, t("offline"));
}

export function errorBar(message: string): HTMLElement {
  return el("div", { class: "errbar", role: "alert" }, message);
}

export function warningSignsList(
  t: (k: string) => string,
  signs: string[],
  title = t("warning_signs"),
): HTMLElement {
  return el(
    "div",
    {},
    el("h3", {}, title),
    el(
      "ul",
      { class: "checklist warn" },
      ...signs.map((s) => el("li", {}, s)),
    ),
  );
}

export function checklist(items: string[]): HTMLElement {
  return el("ul", { class: "checklist" }, ...items.map((i) => el("li", {}, i)));
}
