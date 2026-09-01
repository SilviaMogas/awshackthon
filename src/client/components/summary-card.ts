/** ClinicalSummaryCard + summary text builder (copy / download / share). */
import { el } from "../dom.js";
import type { AppState } from "../store.js";
import type { ClinicalSummary } from "../../shared/types.js";
import { NOT_PROVIDED } from "./summary-constants.js";

export function buildSummaryText(state: AppState): string {
  const s: ClinicalSummary | null = state.summary;
  const uc = state.userContext;
  const triage = state.triage;
  const lines: string[] = [];
  const push = (label: string, value: string | undefined): void => {
    lines.push(`${label}: ${value && value.length ? value : NOT_PROVIDED}`);
  };
  lines.push("HEALTH RESPONSE AGENT — CLINICAL HANDOFF SUMMARY");
  lines.push("(Structured, factual. Not a diagnosis.)");
  lines.push("");
  push("Session reference", uc.sessionId);
  push("Date and time", new Date().toISOString());
  push("Approximate age range", uc.ageRange);
  push("Country", uc.country);
  push("Preferred language", uc.language);
  lines.push("");
  push("Main health concern", s?.chiefComplaint ?? state.chiefComplaint);
  push("Symptom onset", s?.onset);
  push("Duration", s?.duration);
  push("Reported severity", s?.severity);
  push("Progression", s?.progression);
  push("Associated symptoms", s?.associatedSymptoms.join(", "));
  push("Relevant conditions disclosed", s?.relevantConditions.join(", "));
  push("Allergies disclosed", s?.allergies.join(", "));
  push("Medication disclosed", s?.medication.join(", "));
  push("Recent injury disclosed", s?.recentInjury);
  push("Pregnancy status", s?.pregnancyStatus);
  push(
    "Available vital signs",
    s?.availableVitalSigns.map((v) => `${v.type}=${v.value}${v.unit ?? ""}`).join(", "),
  );
  push("Confirmed negative findings", s?.confirmedNegativeFindings.join("; "));
  push("Missing information", s?.missingInformation.join(", "));
  lines.push("");
  push("Triage level returned by API", triage ? String(triage.triageLevel) : undefined);
  push("Urgency label", triage?.urgencyLabel);
  push("Recommended action", triage?.recommendedAction);
  push("Warning signs", triage?.warningSigns.join("; "));
  lines.push("");
  const actions: string[] = [];
  if (state.providerContact)
    actions.push(
      `Provider contact ${state.providerContact.referenceId} (${state.providerContact.status}${state.providerContact.simulated ? ", SIMULATED" : ""})`,
    );
  if (state.escalation)
    actions.push(
      `Escalation ${state.escalation.referenceId} (${state.escalation.status}${state.escalation.simulated ? ", SIMULATED" : ""})`,
    );
  push("Actions already taken", actions.join("; "));
  push(
    "Consent status",
    state.consent
      .filter((c) => c.granted)
      .map((c) => c.consentType)
      .join(", "),
  );
  push(
    "Location sharing status",
    uc.locationSharingConsent ? "consented" : "not shared",
  );
  push(
    "Escalation / appointment reference",
    state.escalation?.referenceId ?? state.providerContact?.referenceId,
  );
  lines.push("");
  lines.push(`Disclaimer: ${state.disclaimer}`);
  return lines.join("\n");
}

export function clinicalSummaryCard(
  state: AppState,
  t: (k: string) => string,
  actions: { onCopy: () => void; onDownload: () => void; onShare?: () => void },
): HTMLElement {
  const text = buildSummaryText(state);
  return el(
    "div",
    { class: "card" },
    el("h2", {}, t("clinical_summary")),
    el("p", { class: "small muted" }, t("safety_notice")),
    el("pre", {
      style:
        "white-space:pre-wrap;background:var(--surface-2);border-radius:10px;padding:12px;font-size:.82rem;max-height:340px;overflow:auto",
      html: escapeHtml(text),
    }),
    el(
      "div",
      { class: "btn-row" },
      el("button", { class: "btn secondary small", onclick: actions.onCopy }, t("copy")),
      el("button", { class: "btn secondary small", onclick: actions.onDownload }, t("download")),
      actions.onShare
        ? el("button", { class: "btn secondary small", onclick: actions.onShare }, t("share_summary"))
        : false,
    ),
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
