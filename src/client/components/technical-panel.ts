/**
 * TechnicalDemoPanel for judges. Shows agent state, last tool, sanitised tool
 * I/O, request id, response time, mode, AWS services, state transitions,
 * escalation status and an audit timeline.
 *
 * NEVER shows chain-of-thought, secrets, credentials, or exact sensitive PII —
 * the server already redacts sensitive fields (sanitizeForPanel) before the
 * client ever receives a tool trace.
 */
import { el } from "../dom.js";
import type { AppState } from "../store.js";
import { ICON_CODE } from "../icons.js";

interface Trace {
  tool?: string;
  input?: unknown;
  output?: unknown;
  requestId?: string;
  durationMs?: number;
  mode?: string;
  simulated?: boolean;
  awsService?: string;
}

export function technicalPanel(state: AppState, t: (k: string) => string): HTMLElement {
  const trace = (state.lastTool ?? {}) as Trace;
  const kv = (label: string, value: string): HTMLElement =>
    el("div", {}, el("dt", {}, label), el("dd", {}, value));

  return el(
    "section",
    { class: "tech", ariaLabel: t("technical_view") },
    el("h3", { class: "tech-title" }, el("span", { html: ICON_CODE }), t("technical_view")),
    el(
      "dl",
      { class: "kv" },
      ...[
        kv(t("agent_state"), state.agentState),
        kv(t("last_tool"), trace.tool ?? "—"),
        kv(t("request_id"), trace.requestId ?? "—"),
        kv(t("response_time"), trace.durationMs !== undefined ? `${trace.durationMs} ms` : "—"),
        kv(t("mode"), (trace.mode ?? state.demoMode ? "mock/demo" : "live") + (trace.simulated ? " (SIMULATED)" : "")),
      ],
    ),
    el("div", {}, el("dt", { class: "muted small" }, t("tool_input"))),
    el("pre", { html: pretty(trace.input) }),
    el("div", {}, el("dt", { class: "muted small" }, t("tool_output"))),
    el("pre", { html: pretty(trace.output) }),
    el("div", {}, el("dt", { class: "muted small" }, t("aws_services"))),
    el(
      "div",
      {},
      trace.awsService ? el("span", { class: "tag" }, trace.awsService) : el("span", { class: "tag" }, "—"),
      ...AWS_SERVICES.map((s) => el("span", { class: "tag" }, s)),
    ),
    el("div", {}, el("dt", { class: "muted small" }, t("state_transitions"))),
    el(
      "div",
      { class: "trans" },
      state.transitions.length
        ? state.transitions.map((x) => `${x.from} → ${x.to}`).join("  |  ")
        : "—",
    ),
    auditTimeline(state, t),
  );
}

const AWS_SERVICES = [
  "API Gateway",
  "Lambda",
  "Bedrock",
  "DynamoDB",
  "Location Service",
  "CloudWatch",
  "KMS",
  "Secrets Manager",
];

export function auditTimeline(state: AppState, t: (k: string) => string): HTMLElement {
  return el(
    "div",
    {},
    el("dt", { class: "muted small", style: "margin-top:10px" }, t("audit_timeline")),
    el(
      "ul",
      { class: "timeline" },
      ...(state.auditEvents.length
        ? state.auditEvents
            .slice(-12)
            .map((e) =>
              el(
                "li",
                {},
                el("div", {}, `${e.eventType}${e.toolName ? ` · ${e.toolName}` : ""}`),
                el("div", { class: "t" }, `${e.requestId ?? ""} ${e.timestamp}`),
              ),
            )
        : [el("li", {}, el("div", { class: "t" }, "—"))]),
    ),
  );
}

function pretty(v: unknown): string {
  try {
    const json = JSON.stringify(v ?? null, null, 2);
    return json
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  } catch {
    return "—";
  }
}
