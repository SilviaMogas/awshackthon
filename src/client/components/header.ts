/** AppHeader with brand, demo scenario selector, language selector, tech toggle. */
import { el } from "../dom.js";
import type { AppState } from "../store.js";
import { SUPPORTED_LANGUAGES } from "../../shared/constants.js";
import { apiStatusIndicator } from "./common.js";

export interface HeaderActions {
  onLang: (lang: string) => void;
  onToggleTech: () => void;
  onRunScenario: (id: 1 | 2 | 3) => void;
  onReset: () => void;
}

export function appHeader(
  state: AppState,
  t: (k: string) => string,
  actions: HeaderActions,
): HTMLElement {
  const langSel = el(
    "select",
    {
      class: "select compact",
      ariaLabel: t("language"),
      onchange: (e) => actions.onLang((e.target as HTMLSelectElement).value),
    },
    ...SUPPORTED_LANGUAGES.map((l) =>
      el("option", { value: l.code, ...(l.code === state.lang ? { } : {}) }, l.name),
    ),
  );
  (langSel as HTMLSelectElement).value = state.lang;

  const controls: HTMLElement[] = [apiStatusIndicator(state), langSel];

  if (state.demoMode) {
    const scenarioSel = el(
      "select",
      {
        class: "select compact",
        ariaLabel: t("demo_scenarios"),
        onchange: (e) => {
          const v = (e.target as HTMLSelectElement).value;
          if (v) actions.onRunScenario(Number(v) as 1 | 2 | 3);
          (e.target as HTMLSelectElement).value = "";
        },
      },
      el("option", { value: "" }, t("demo_scenarios")),
      el("option", { value: "1" }, t("scenario_1")),
      el("option", { value: "2" }, t("scenario_2")),
      el("option", { value: "3" }, t("scenario_3")),
    );
    controls.push(scenarioSel);
    controls.push(
      el(
        "button",
        { class: "btn ghost small", onclick: actions.onReset, ariaLabel: t("reset_demo") },
        "↺",
      ),
    );
  }

  controls.push(
    el(
      "button",
      {
        class: "btn ghost small",
        onclick: actions.onToggleTech,
        ariaLabel: t("technical_view"),
      },
      "{ }",
    ),
  );

  return el(
    "header",
    { class: "header" },
    el(
      "div",
      { class: "brand" },
      el("div", { class: "logo" }, "+"),
      el(
        "div",
        {},
        el("h1", {}, t("app_name")),
        el("p", { class: "sub" }, t("subheading")),
      ),
    ),
    el("div", { class: "controls" }, ...controls),
  );
}
