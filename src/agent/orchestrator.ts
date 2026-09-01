/**
 * Agent orchestrator.
 *
 * Implements the controlled agent loop:
 *   1. Receive user input.
 *   2. Update session context.
 *   3. Evaluate whether immediate emergency screening is required.
 *   4. Determine whether more information is needed.
 *   5. Select an approved tool.
 *   6. Execute the tool.
 *   7. Validate the tool response.
 *   8. Update the agent state (guarded by the state machine).
 *   9. Return a concise user-facing response (never chain-of-thought).
 *
 * The orchestrator keeps per-session state in memory (a DynamoDB table in
 * production). It never computes the final triage level itself — it always
 * calls the triage tool for that.
 */
import type {
  AgentState,
  FollowUpQuestion,
  SymptomAnswer,
  TriageRequest,
  TriageResponse,
  UserContext,
  VitalSign,
} from "../shared/types.js";
import { canTransition, InvalidTransitionError } from "./state-machine.js";
import { tools, ToolTrace } from "./tools.js";
import { auditService } from "../services/audit/index.js";
import { nowIso, sanitizeText } from "../shared/util.js";
import { ServiceError, safeUserMessage } from "../services/errors.js";

export interface AgentSession {
  sessionId: string;
  state: AgentState;
  userContext: UserContext;
  chiefComplaint: string;
  answers: SymptomAnswer[];
  availableVitalSigns: VitalSign[];
  transitions: { from: AgentState; to: AgentState; at: string }[];
  lastTool?: ToolTrace;
  triage?: TriageResponse;
}

export interface AgentStepResult {
  session: AgentSession;
  userMessage: string;
  question?: FollowUpQuestion | null;
  triage?: TriageResponse;
  emergencyInterrupt?: boolean;
  toolTrace?: ToolTrace;
  fallback?: boolean;
}

const sessions = new Map<string, AgentSession>();

function getOrCreate(sessionId: string, userContext: UserContext): AgentSession {
  let session = sessions.get(sessionId);
  if (!session) {
    session = {
      sessionId,
      state: "idle",
      userContext,
      chiefComplaint: "",
      answers: [],
      availableVitalSigns: [],
      transitions: [],
    };
    sessions.set(sessionId, session);
    auditService.record({ sessionId, eventType: "session_started" });
  } else {
    session.userContext = userContext;
  }
  return session;
}

export function getSession(sessionId: string): AgentSession | undefined {
  return sessions.get(sessionId);
}

export function clearSession(sessionId: string): void {
  sessions.delete(sessionId);
  auditService.clear(sessionId);
}

function transition(session: AgentSession, to: AgentState): void {
  if (session.state === to) return;
  if (!canTransition(session.state, to)) {
    throw new InvalidTransitionError(session.state, to);
  }
  session.transitions.push({ from: session.state, to, at: nowIso() });
  session.state = to;
}

function buildTriageRequest(session: AgentSession): TriageRequest {
  return {
    sessionId: session.sessionId,
    userContext: session.userContext,
    chiefComplaint: session.chiefComplaint,
    messages: [],
    answers: session.answers,
    availableVitalSigns: session.availableVitalSigns,
    submittedAt: nowIso(),
  };
}

export interface StepInput {
  sessionId: string;
  userContext: UserContext;
  /** Free-text chief complaint / message. */
  message?: string;
  /** A structured answer to a follow-up question. */
  answer?: SymptomAnswer;
  /** Available vital signs to merge in. */
  vitalSigns?: VitalSign[];
  /** Force a fresh triage even if answers unchanged (e.g. symptoms updated). */
  forceTriage?: boolean;
}

/**
 * Advance the agent one step. This is the core of the controlled loop and is
 * invoked by POST /api/agent/message.
 */
export async function step(input: StepInput): Promise<AgentStepResult> {
  const session = getOrCreate(input.sessionId, input.userContext);

  // 1-2. Receive input, update context.
  if (input.message !== undefined) {
    const clean = sanitizeText(input.message, 1000);
    if (!session.chiefComplaint) session.chiefComplaint = clean;
    auditService.record({
      sessionId: session.sessionId,
      eventType: "user_message",
      metadata: { length: clean.length },
    });
    if (session.state === "idle") transition(session, "collecting_context");
  }

  if (input.answer) {
    // Avoid duplicate answers; editing replaces the previous value.
    session.answers = session.answers.filter(
      (a) => a.questionId !== input.answer!.questionId,
    );
    session.answers.push(input.answer);
  }

  if (input.vitalSigns && input.vitalSigns.length) {
    session.availableVitalSigns = input.vitalSigns;
  }

  // 3. Emergency screening safety net (always runs before routine questions).
  transition(session, "screening_for_emergency");
  const screenTrace = await tools.emergency_screening({
    sessionId: session.sessionId,
    chiefComplaint: session.chiefComplaint,
    messages: [],
    answers: session.answers,
    availableVitalSigns: session.availableVitalSigns,
  });
  session.lastTool = screenTrace;
  recordTool(session, screenTrace);
  const screen = screenTrace.output as {
    possibleEmergency: boolean;
    emergencySignals: string[];
  };

  if (screen.possibleEmergency) {
    // Emergency interruption: stop questionnaire, run triage to confirm L3.
    return finalizeTriage(session, true);
  }

  // 4. Determine whether more information is needed (unless triage forced).
  if (!input.forceTriage) {
    const followUpTrace = tools.generate_follow_up_question(
      buildTriageRequest(session),
    );
    session.lastTool = followUpTrace;
    const question = followUpTrace.output as FollowUpQuestion | null;
    if (question) {
      transition(session, "asking_follow_up");
      transition(session, "awaiting_user_response");
      recordTool(session, followUpTrace);
      return {
        session,
        userMessage: question.question,
        question,
        toolTrace: followUpTrace,
      };
    }
  }

  // 5-9. No more questions (or forced): submit triage (source of truth).
  return finalizeTriage(session, false);
}

function recordTool(session: AgentSession, trace: ToolTrace): void {
  auditService.record({
    sessionId: session.sessionId,
    eventType: "tool_called",
    toolName: trace.tool,
    requestId: trace.requestId,
    metadata: { durationMs: trace.durationMs, mode: trace.mode },
  });
}

async function finalizeTriage(
  session: AgentSession,
  emergencyInterrupt: boolean,
): Promise<AgentStepResult> {
  transition(session, "submitting_triage");
  try {
    const trace = await tools.submit_triage(buildTriageRequest(session));
    session.lastTool = trace;
    recordTool(session, trace);
    // Re-run the real service to obtain the full validated response object.
    // (submit_triage tool returns a sanitised subset for the panel.)
    const { triageService } = await import("../services/triage/index.js");
    const triage = await triageService.triage(buildTriageRequest(session));
    session.triage = triage;

    transition(session, "triage_complete");
    auditService.record({
      sessionId: session.sessionId,
      eventType: "triage_completed",
      requestId: triage.requestId,
      metadata: {
        triageLevel: triage.triageLevel,
        escalationRequired: triage.escalationRequired,
      },
    });

    const target: AgentState =
      triage.triageLevel === 3
        ? "presenting_level_3"
        : triage.triageLevel === 2
          ? "presenting_level_2"
          : "presenting_level_1";
    transition(session, target);

    return {
      session,
      userMessage: userFacingForLevel(triage),
      triage,
      emergencyInterrupt,
      toolTrace: trace,
    };
  } catch (err) {
    // Safety-critical failure -> fallback_required (never minimise).
    auditService.record({
      sessionId: session.sessionId,
      eventType: "tool_failed",
      toolName: "submit_triage",
      metadata: { code: err instanceof ServiceError ? err.code : "INTERNAL" },
    });
    transition(session, "failed");
    transition(session, "fallback_required");
    return {
      session,
      userMessage:
        safeUserMessage(err) +
        " If your symptoms are severe, sudden or getting worse, contact local emergency services or seek urgent medical care now.",
      fallback: true,
    };
  }
}

function userFacingForLevel(triage: TriageResponse): string {
  switch (triage.triageLevel) {
    case 3:
      return "This may be a medical emergency. Contact your local emergency services or go to the nearest emergency department now. The emergency guidance below has the number to call and what to do while you wait.";
    case 2:
      return "Based on what you described, we recommend that you see a healthcare professional within the next 24 hours. See the guidance below, and if things get worse, seek urgent care sooner.";
    default:
      return "Based on what you described, here is general guidance and what to monitor. If your symptoms change or get worse, check again or seek medical care.";
  }
}

/** Register the user's transition to a consent-gated action state. */
export function beginAction(session: AgentSession): void {
  transition(session, "awaiting_consent");
}

export function markExecuting(session: AgentSession): void {
  transition(session, "executing_action");
}

export function markMonitoring(session: AgentSession): void {
  transition(session, "monitoring_action");
}

export function markCompleted(session: AgentSession): void {
  transition(session, "completed");
}

export function markFailed(session: AgentSession): void {
  transition(session, "failed");
}
