/** Registers every /api route against the services and agent orchestrator. */
import { Router, ok, fail, readJsonBody } from "./http.js";
import { API_ROUTES, DISCLAIMER, POLICY_VERSION } from "../shared/constants.js";
import { config } from "./config.js";
import {
  triageRequestSchema,
  escalationRequestSchema,
  providerContactRequestSchema,
  userContextSchema,
} from "../shared/schemas.js";
import { s } from "../shared/schema.js";
import { triageService } from "../services/triage/index.js";
import { emergencyScreeningService } from "../services/emergency-screening/index.js";
import { emergencyNumberService } from "../services/emergency-numbers/index.js";
import { providerContactService } from "../services/provider-contact/index.js";
import { escalationService } from "../services/escalation/index.js";
import { summaryService } from "../services/summary/index.js";
import { auditService } from "../services/audit/index.js";
import { tools, sanitizeForPanel } from "../agent/tools.js";
import {
  step,
  getSession,
  clearSession,
  beginAction,
  markExecuting,
  markMonitoring,
  markCompleted,
  markFailed,
} from "../agent/orchestrator.js";
import { ServiceError } from "../services/errors.js";
import { nowIso, sanitizeText } from "../shared/util.js";
import type {
  SymptomAnswer,
  VitalSign,
  UserContext,
} from "../shared/types.js";

export function registerRoutes(router: Router): void {
  // ---- Health & config ------------------------------------------------------
  router.get(API_ROUTES.health, ({ res }) => {
    ok(res, {
      status: "ok",
      serviceMode: config.serviceMode,
      demoMode: config.demoMode,
      services: {
        triage: triageService.mode,
        emergencyScreening: emergencyScreeningService.mode,
        emergencyNumber: emergencyNumberService.mode,
        providerContact: providerContactService.mode,
        escalation: escalationService.mode,
      },
      time: nowIso(),
    });
  });

  router.get(API_ROUTES.config, ({ res }) => {
    // Only non-sensitive, client-safe configuration is exposed here.
    ok(res, {
      appName: config.appName,
      demoMode: config.demoMode,
      defaultCountry: config.defaultCountry,
      defaultLanguage: config.defaultLanguage,
      policyVersion: POLICY_VERSION,
      disclaimer: DISCLAIMER,
      serviceMode: config.serviceMode,
      simulated: {
        escalation: escalationService.simulated,
        providerContact: providerContactService.simulated,
      },
    });
  });

  // ---- Agent message (controlled loop) --------------------------------------
  router.post(API_ROUTES.agentMessage, async ({ req, res }) => {
    try {
      const body = (await readJsonBody(req)) as Record<string, unknown>;
      const userContext = userContextSchema.parse(
        body.userContext,
      ) as UserContext;
      const message =
        body.message !== undefined ? sanitizeText(body.message, 1000) : undefined;
      const answer = body.answer
        ? (body.answer as SymptomAnswer)
        : undefined;
      const vitalSigns = body.vitalSigns as VitalSign[] | undefined;
      const forceTriage = body.forceTriage === true;

      const result = await step({
        sessionId: userContext.sessionId,
        userContext,
        message,
        answer,
        vitalSigns,
        forceTriage,
      });

      ok(res, {
        state: result.session.state,
        transitions: result.session.transitions,
        userMessage: result.userMessage,
        question: result.question ?? null,
        triage: result.triage ?? null,
        emergencyInterrupt: result.emergencyInterrupt ?? false,
        fallback: result.fallback ?? false,
        lastTool: result.toolTrace ?? result.session.lastTool ?? null,
      });
    } catch (err) {
      fail(res, err);
    }
  });

  // ---- Emergency screening --------------------------------------------------
  router.post(API_ROUTES.emergencyScreening, async ({ req, res }) => {
    try {
      const body = (await readJsonBody(req)) as Record<string, unknown>;
      const trace = await tools.emergency_screening({
        sessionId: String(body.sessionId ?? "anonymous"),
        chiefComplaint: sanitizeText(body.chiefComplaint, 1000),
        messages: [],
        answers: (body.answers as SymptomAnswer[]) ?? [],
        availableVitalSigns: (body.availableVitalSigns as VitalSign[]) ?? [],
      });
      ok(res, trace.output);
    } catch (err) {
      fail(res, err);
    }
  });

  // ---- Triage (source of truth) ---------------------------------------------
  router.post(API_ROUTES.triage, async ({ req, res }) => {
    try {
      const request = triageRequestSchema.parse(await readJsonBody(req));
      const triage = await triageService.triage(request);
      auditService.record({
        sessionId: request.sessionId,
        eventType: "triage_completed",
        requestId: triage.requestId,
        metadata: { triageLevel: triage.triageLevel },
      });
      ok(res, triage);
    } catch (err) {
      fail(res, err);
    }
  });

  // ---- Follow-up question ---------------------------------------------------
  router.post(API_ROUTES.triageFollowUp, async ({ req, res }) => {
    try {
      const request = triageRequestSchema.parse(await readJsonBody(req));
      const trace = tools.generate_follow_up_question(request);
      ok(res, { question: trace.output });
    } catch (err) {
      fail(res, err);
    }
  });

  // ---- Clinical summary -----------------------------------------------------
  router.post(API_ROUTES.summary, async ({ req, res }) => {
    try {
      const request = triageRequestSchema.parse(await readJsonBody(req));
      const summary = summaryService.build({
        chiefComplaint: request.chiefComplaint,
        answers: request.answers,
        availableVitalSigns: request.availableVitalSigns,
        userContext: request.userContext,
      });
      ok(res, { summary, disclaimer: DISCLAIMER });
    } catch (err) {
      fail(res, err);
    }
  });

  // ---- Emergency number -----------------------------------------------------
  router.get(API_ROUTES.emergencyNumber, async ({ res, query }) => {
    try {
      const country = query.country ?? config.defaultCountry;
      const result = await emergencyNumberService.get(country);
      ok(res, result);
    } catch (err) {
      fail(res, err);
    }
  });

  // ---- Provider contact (Level 2, consent-gated) ----------------------------
  router.post(API_ROUTES.providerContact, async ({ req, res }) => {
    try {
      const request = providerContactRequestSchema.parse(await readJsonBody(req));
      auditService.record({
        sessionId: request.sessionId,
        eventType: "action_requested",
        toolName: "request_medical_contact",
      });
      const session = getSession(request.sessionId);
      safely(() => {
        if (session) {
          beginAction(session);
          markExecuting(session);
        }
      });
      const result = await providerContactService.request(request);
      safely(() => {
        if (session) markCompleted(session);
      });
      auditService.record({
        sessionId: request.sessionId,
        eventType: "action_completed",
        toolName: "request_medical_contact",
        requestId: result.referenceId,
        metadata: { simulated: result.simulated, status: result.status },
      });
      ok(res, result);
    } catch (err) {
      recordActionFailure(req, "request_medical_contact");
      fail(res, err);
    }
  });

  // ---- Emergency escalation (Level 3, consent-gated, idempotent) -------------
  router.post(API_ROUTES.escalate, async ({ req, res }) => {
    try {
      const request = escalationRequestSchema.parse(await readJsonBody(req));
      auditService.record({
        sessionId: request.sessionId,
        eventType: "action_requested",
        toolName: "escalate_emergency",
      });
      const session = getSession(request.sessionId);
      safely(() => {
        if (session) {
          beginAction(session);
          markExecuting(session);
        }
      });
      const result = await escalationService.escalate(request);
      safely(() => {
        if (session) markMonitoring(session);
      });
      auditService.record({
        sessionId: request.sessionId,
        eventType: "action_completed",
        toolName: "escalate_emergency",
        requestId: result.referenceId,
        metadata: { simulated: result.simulated, status: result.status },
      });
      ok(res, result);
    } catch (err) {
      recordActionFailure(req, "escalate_emergency");
      fail(res, err);
    }
  });

  // ---- Escalation status (monitoring) ---------------------------------------
  router.get("/api/escalate/:referenceId/status", async ({ res, params }) => {
    try {
      const result = await escalationService.status(params.referenceId);
      ok(res, result);
    } catch (err) {
      fail(res, err);
    }
  });

  // ---- Audit event (client can push a client-side event) --------------------
  const auditBodySchema = s.object({
    sessionId: s.string().min(1),
    eventType: s.string().min(1),
    toolName: s.string().optional(),
    requestId: s.string().optional(),
    metadata: s.record(s.any()).optional(),
  });
  router.post(API_ROUTES.auditEvent, async ({ req, res }) => {
    try {
      const body = auditBodySchema.parse(await readJsonBody(req));
      const event = auditService.record({
        sessionId: body.sessionId,
        eventType: body.eventType as never,
        toolName: body.toolName,
        requestId: body.requestId,
        metadata: body.metadata,
      });
      ok(res, event);
    } catch (err) {
      fail(res, err);
    }
  });

  // ---- Audit list + session controls (used by the tech panel & reset) -------
  router.get("/api/audit/:sessionId", ({ res, params }) => {
    ok(res, { events: auditService.list(params.sessionId) });
  });

  router.get("/api/session/:sessionId", ({ res, params }) => {
    const session = getSession(params.sessionId);
    if (!session) return ok(res, { session: null });
    ok(res, {
      session: {
        state: session.state,
        transitions: session.transitions,
        lastTool: session.lastTool ? sanitizeForPanel(session.lastTool) : null,
        triageLevel: session.triage?.triageLevel ?? null,
      },
    });
  });

  router.post("/api/session/:sessionId/clear", ({ res, params }) => {
    clearSession(params.sessionId);
    ok(res, { cleared: true });
  });
}

/** Run a state-transition side effect without letting a guard error surface. */
function safely(fn: () => void): void {
  try {
    fn();
  } catch {
    // Invalid transitions are non-fatal to the action result; the action
    // itself (with its own consent/idempotency guards) is the source of truth.
  }
}

function recordActionFailure(
  req: { headers: Record<string, unknown> },
  toolName: string,
): void {
  const sid = req.headers["x-session-id"];
  if (typeof sid === "string") {
    const session = getSession(sid);
    if (session) markFailed(session);
    auditService.record({
      sessionId: sid,
      eventType: "action_failed",
      toolName,
    });
  }
}

// Keep types imported for downstream consumers.
export type { ServiceError };
