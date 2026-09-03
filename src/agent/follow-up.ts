/**
 * generate_follow_up_question tool logic.
 *
 * Deterministically selects the NEXT relevant question based on what is still
 * missing. It never repeats an already-answered question and returns a
 * non-sensitive `whyNeededCategory` (never chain-of-thought).
 *
 * The ordered priority reflects clinically useful triage fields. In production
 * this ordering can be produced by Bedrock structured output, but the agent
 * still only surfaces the registered question set.
 */
import type { FollowUpQuestion, SymptomAnswer } from "../shared/types.js";
import { FOLLOW_UP_POOL } from "../services/triage/index.js";

/**
 * Priority order of follow-up question ids. Kept short and non-overlapping so
 * the user is not asked the same thing twice (timing + suddenness are now a
 * single "onset" question).
 */
const PRIORITY = ["onset", "severity", "progression", "associated_symptoms"];

/**
 * Maximum number of follow-up questions to ask before proceeding to triage.
 * Keeps the conversation short and purposeful instead of dripping every
 * possible question one at a time.
 */
const MAX_FOLLOW_UPS = 3;

export function nextFollowUpQuestion(
  answers: SymptomAnswer[],
): FollowUpQuestion | null {
  const answered = new Set(answers.map((a) => a.questionId));

  // Stop asking once the user has answered enough follow-ups; move to triage.
  const answeredFollowUps = PRIORITY.filter((id) => answered.has(id)).length;
  if (answeredFollowUps >= MAX_FOLLOW_UPS) return null;

  for (const id of PRIORITY) {
    if (answered.has(id)) continue;
    const q = FOLLOW_UP_POOL.find((x) => x.questionId === id);
    if (q) return q;
  }
  return null;
}
