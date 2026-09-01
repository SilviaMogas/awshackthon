/**
 * Clinical summary service.
 *
 * Builds a FACTUAL, structured handoff from information the user explicitly
 * provided plus validated triage results. It never infers or fabricates
 * findings. Missing fields are recorded as "Not provided" (never "Normal").
 */
import type {
  ClinicalSummary,
  SymptomAnswer,
  TriageResponse,
  UserContext,
  VitalSign,
} from "../../shared/types.js";

const NOT_PROVIDED = "Not provided";

export interface SummaryInput {
  chiefComplaint: string;
  answers: SymptomAnswer[];
  availableVitalSigns: VitalSign[];
  userContext: UserContext;
  triage?: TriageResponse;
}

/** Question ids the collector uses; keep in sync with the agent tool. */
export const QUESTION_IDS = {
  onset: "onset",
  duration: "duration",
  severity: "severity",
  sudden: "sudden_onset",
  progression: "progression",
  associated: "associated_symptoms",
  conditions: "relevant_conditions",
  allergies: "allergies",
  medication: "medication",
  injury: "recent_injury",
  pregnancy: "pregnancy_status",
  alone: "is_alone",
  canContact: "can_contact_someone",
  consciousness: "consciousness",
} as const;

function ans(answers: SymptomAnswer[], id: string): SymptomAnswer | undefined {
  return answers.find((a) => a.questionId === id);
}

function asString(a?: SymptomAnswer): string | undefined {
  if (!a || a.answer === null || a.answer === undefined) return undefined;
  if (Array.isArray(a.answer)) return a.answer.length ? a.answer.join(", ") : undefined;
  const v = String(a.answer).trim();
  return v.length ? v : undefined;
}

function asList(a?: SymptomAnswer): string[] {
  if (!a || a.answer === null || a.answer === undefined) return [];
  if (Array.isArray(a.answer)) return a.answer.filter(Boolean);
  const v = String(a.answer).trim();
  return v.length && v.toLowerCase() !== "none" ? [v] : [];
}

export interface SummaryService {
  build(input: SummaryInput): ClinicalSummary;
}

class DeterministicSummaryService implements SummaryService {
  build(input: SummaryInput): ClinicalSummary {
    const { answers } = input;

    const onset = asString(ans(answers, QUESTION_IDS.onset));
    const duration = asString(ans(answers, QUESTION_IDS.duration));
    const severity = asString(ans(answers, QUESTION_IDS.severity));
    const progression = asString(ans(answers, QUESTION_IDS.progression));
    const associatedSymptoms = asList(ans(answers, QUESTION_IDS.associated));
    const relevantConditions = asList(ans(answers, QUESTION_IDS.conditions));
    const allergies = asList(ans(answers, QUESTION_IDS.allergies));
    const medication = asList(ans(answers, QUESTION_IDS.medication));
    const recentInjury = asString(ans(answers, QUESTION_IDS.injury));
    const pregnancyStatus = asString(ans(answers, QUESTION_IDS.pregnancy));

    // Explicitly confirmed negatives: only "no"/"none" answers become negatives.
    const confirmedNegativeFindings: string[] = [];
    for (const a of answers) {
      const val = typeof a.answer === "boolean" ? a.answer : undefined;
      if (val === false) {
        confirmedNegativeFindings.push(`No: ${a.question}`);
      } else if (typeof a.answer === "string" && /^(no|none)$/i.test(a.answer.trim())) {
        confirmedNegativeFindings.push(`Confirmed none: ${a.question}`);
      }
    }

    // Missing information: only well-known clinical fields the user did NOT provide.
    const missing: string[] = [];
    const track: [string | undefined, string][] = [
      [onset, "Symptom onset"],
      [duration, "Duration"],
      [severity, "Severity"],
      [progression, "Progression"],
    ];
    for (const [val, label] of track) if (!val) missing.push(label);
    if (associatedSymptoms.length === 0) missing.push("Associated symptoms");

    return {
      chiefComplaint: input.chiefComplaint || NOT_PROVIDED,
      onset,
      duration,
      severity,
      progression,
      associatedSymptoms,
      relevantConditions,
      allergies,
      medication,
      recentInjury,
      pregnancyStatus,
      availableVitalSigns: input.availableVitalSigns,
      confirmedNegativeFindings,
      missingInformation: missing,
      triageLevel: input.triage?.triageLevel,
      recommendedAction: input.triage?.recommendedAction,
    };
  }
}

export const summaryService: SummaryService = new DeterministicSummaryService();
export { NOT_PROVIDED };
