/**
 * Agent state machine. Defines the finite set of states, the legal transition
 * map, and a guard that rejects invalid transitions. This is what makes the
 * product an AGENT with controlled autonomy rather than an ad-hoc chatbot.
 */
import type { AgentState } from "../shared/types.js";

/**
 * Legal transitions. Each key maps to the states it may move to next. Notably:
 *  - You cannot execute_action before awaiting_consent for sensitive actions.
 *  - After presenting_level_3 -> completed only through consent/action/monitor.
 *  - Any state may move to screening_for_emergency (emergency interruption) and
 *    to failed / fallback_required (safety fallback).
 */
export const TRANSITIONS: Record<AgentState, AgentState[]> = {
  idle: ["collecting_context", "screening_for_emergency"],
  collecting_context: [
    "screening_for_emergency",
    "asking_follow_up",
    "submitting_triage",
  ],
  screening_for_emergency: [
    "presenting_level_3",
    "asking_follow_up",
    "submitting_triage",
    "collecting_context",
  ],
  asking_follow_up: ["awaiting_user_response", "screening_for_emergency"],
  awaiting_user_response: [
    "screening_for_emergency",
    "asking_follow_up",
    "submitting_triage",
    "collecting_context",
  ],
  submitting_triage: ["triage_complete", "failed", "fallback_required"],
  triage_complete: [
    "presenting_level_1",
    "presenting_level_2",
    "presenting_level_3",
  ],
  presenting_level_1: [
    "collecting_context",
    "submitting_triage",
    "completed",
    "screening_for_emergency",
  ],
  presenting_level_2: [
    "awaiting_consent",
    "submitting_triage",
    "completed",
    "screening_for_emergency",
  ],
  presenting_level_3: ["awaiting_consent", "monitoring_action", "fallback_required"],
  awaiting_consent: [
    "executing_action",
    "presenting_level_2",
    "presenting_level_3",
  ],
  executing_action: ["monitoring_action", "completed", "failed", "fallback_required"],
  monitoring_action: ["monitoring_action", "completed", "failed", "fallback_required"],
  completed: ["collecting_context", "submitting_triage", "screening_for_emergency"],
  failed: ["fallback_required", "collecting_context", "submitting_triage"],
  fallback_required: ["collecting_context", "submitting_triage"],
};

/** Emergency interruption is always allowed from any non-terminal-emergency state. */
const EMERGENCY_INTERRUPT_ALLOWED_FROM: AgentState[] = [
  "idle",
  "collecting_context",
  "asking_follow_up",
  "awaiting_user_response",
  "submitting_triage",
  "triage_complete",
  "presenting_level_1",
  "presenting_level_2",
];

export function canTransition(from: AgentState, to: AgentState): boolean {
  if (to === "screening_for_emergency" || to === "presenting_level_3") {
    if (EMERGENCY_INTERRUPT_ALLOWED_FROM.includes(from)) return true;
  }
  if (to === "failed" || to === "fallback_required") return true;
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export class InvalidTransitionError extends Error {
  constructor(
    readonly from: AgentState,
    readonly to: AgentState,
  ) {
    super(`Invalid agent transition: ${from} -> ${to}`);
    this.name = "InvalidTransitionError";
  }
}
