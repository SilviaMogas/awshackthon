/** ConsentConfirmationModal + EscalationStatus + ProviderContactPanel. */
import { el } from "../dom.js";
import type { EscalationResponse, ProviderContactResponse } from "../../shared/types.js";
import { simulatedBadge } from "./common.js";

export interface ConsentItem {
  type: string;
  label: string;
  checked: boolean;
  required: boolean;
}

export function consentModal(
  t: (k: string) => string,
  opts: {
    title: string;
    sharedInfo: string[];
    items: ConsentItem[];
    onToggle: (type: string, checked: boolean) => void;
    onCancel: () => void;
    onConfirm: () => void;
    confirmDisabled: boolean;
  },
): HTMLElement {
  return el(
    "div",
    { class: "overlay", role: "dialog", ariaLabel: opts.title },
    el(
      "div",
      { class: "modal stack" },
      el("h2", {}, opts.title),
      el("p", { class: "small muted" }, t("consent_explain_share")),
      el("ul", { class: "checklist small" }, ...opts.sharedInfo.map((i) => el("li", {}, i))),
      ...opts.items.map((item) =>
        el(
          "label",
          { class: "consent-row" },
          el("input", {
            type: "checkbox",
            checked: item.checked,
            onchange: (e) => opts.onToggle(item.type, (e.target as HTMLInputElement).checked),
          }),
          el("span", {}, item.label + (item.required ? " *" : "")),
        ),
      ),
      el(
        "div",
        { class: "btn-row" },
        el("button", { class: "btn secondary", onclick: opts.onCancel }, t("cancel")),
        el(
          "button",
          { class: "btn", disabled: opts.confirmDisabled, onclick: opts.onConfirm },
          t("confirm_share"),
        ),
      ),
    ),
  );
}

function statusClass(status: string): string {
  return `status-pill status-${status}`;
}

export function escalationStatus(
  t: (k: string) => string,
  esc: EscalationResponse,
): HTMLElement {
  const simulated = esc.simulated;
  return el(
    "div",
    { class: "card stack" },
    el(
      "div",
      { style: "display:flex;align-items:center;gap:10px;flex-wrap:wrap" },
      el("h3", { style: "margin:0" }, t("escalation_status")),
      simulated ? simulatedBadge(t) : false,
    ),
    el(
      "div",
      { class: statusClass(esc.status), ariaLive: "polite" },
      el("span", { class: "dot" }),
      esc.status.toUpperCase(),
    ),
    el("p", { class: "small" }, `${t("request_id")}: ${esc.referenceId}`),
    esc.destination ? el("p", { class: "small muted" }, esc.destination) : false,
    simulated
      ? el("p", { class: "small", style: "color:var(--amber)" }, t("not_real_action"))
      : false,
    el("p", { class: "small muted" }, t("safe_fallback")),
  );
}

export function providerContactResult(
  t: (k: string) => string,
  pc: ProviderContactResponse,
): HTMLElement {
  return el(
    "div",
    { class: "card stack" },
    el(
      "div",
      { style: "display:flex;align-items:center;gap:10px;flex-wrap:wrap" },
      el("h3", { style: "margin:0" }, t("request_appointment")),
      pc.simulated ? simulatedBadge(t) : false,
    ),
    el("div", { class: statusClass(pc.status) }, el("span", { class: "dot" }), pc.status.toUpperCase()),
    el("p", { class: "small" }, `${t("request_id")}: ${pc.referenceId}`),
    pc.destination ? el("p", { class: "small muted" }, pc.destination) : false,
    pc.simulated
      ? el("p", { class: "small", style: "color:var(--amber)" }, t("not_real_action"))
      : false,
  );
}
