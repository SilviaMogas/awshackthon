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

/** Priority order of question ids. */
const PRIORITY = [
  "onset",
  "severity",
  "progression",
  "sudden_onset",
  "associated_symptoms",
  "relevant_conditions",
];

export function nextFollowUpQuestion(
  answers: SymptomAnswer[],
): FollowUpQuestion | null {
  const answered = new Set(answers.map((a) => a.questionId));
  for (const id of PRIORITY) {
    if (answered.has(id)) continue;
    const q = FOLLOW_UP_POOL.find((x) => x.questionId === id);
    if (q) return q;
  }
  return null;
}
