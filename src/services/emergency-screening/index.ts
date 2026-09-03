/**
 * Emergency screening service.
 *
 * Detects whether the collected information contains potential emergency
 * warning signs that require IMMEDIATE interruption of the normal flow.
 *
 * IMPORTANT: This is a conservative safety net, not a diagnosis. It errs toward
 * caution. The clinical triage endpoint remains the source of truth for the
 * final response level; this screen only decides whether to short-circuit into
 * the Level 3 flow early.
 */
import type {
  EmergencyScreeningRequest,
  EmergencyScreeningResponse,
} from "../../shared/types.js";
import { config, useRealAdapter } from "../../server/config.js";
import { httpJson } from "../http-client.js";
import { emergencyScreeningResponseSchema } from "../../shared/schemas.js";
import { shortId, nowIso, delay } from "../../shared/util.js";

export interface EmergencyScreeningService {
  screen(req: EmergencyScreeningRequest): Promise<EmergencyScreeningResponse>;
  readonly mode: "mock" | "real";
}

/**
 * Red-flag phrases grouped by signal. Matched case-insensitively against the
 * combined user text. Patterns are intentionally permissive: this is a
 * conservative safety net whose job is to interrupt the questionnaire and send
 * the user to emergency guidance. It is better to over-trigger than to keep
 * asking follow-up questions to someone who is seriously unwell.
 *
 * `cannot`/`can't`/`can not` and similar contractions are all covered.
 */
const CANNOT = "(can'?t|can\\s?not|cannot|unable to|couldn'?t)";

const RED_FLAGS: { signal: string; patterns: RegExp[] }[] = [
  {
    signal: "Chest pain or pressure",
    patterns: [
      /chest (pain|pressure|tight|tightness|discomfort)/i,
      /(pain|pressure|tight\w*) in (my |the )?chest/i,
      /heart attack/i,
    ],
  },
  {
    signal: "Difficulty breathing",
    patterns: [
      /(difficulty|trouble|hard|struggl\w*|problems?) (to |with )?breath\w*/i,
      new RegExp(`${CANNOT} breath`, "i"),
      /can'?t catch my breath/i,
      /short(ness)? of breath/i,
      /out of breath/i,
      /gasping/i,
      /choking/i,
      /suffocat\w*/i,
    ],
  },
  {
    signal: "Signs of stroke",
    patterns: [
      /face (is )?(droop|drooping|numb)/i,
      /(one side|half) of my (face|body)/i,
      /slurr\w* speech/i,
      new RegExp(`${CANNOT} speak`, "i"),
      /sudden(ly)? (weak|weakness|numb|numbness)/i,
      new RegExp(`${CANNOT} (move|feel) (my )?(arm|leg|side|face)`, "i"),
      /\bstroke\b/i,
    ],
  },
  {
    signal: "Severe bleeding",
    patterns: [
      /(severe|heavy|heavily|uncontrolled|a lot of|lots of|profuse) bleed\w*/i,
      /bleed\w* (heavily|badly|a lot)/i,
      /bleeding (that )?(won'?t|will not|does not|doesn'?t) stop/i,
      /losing a lot of blood/i,
    ],
  },
  {
    signal: "Loss of consciousness",
    patterns: [
      /(passed out|pass out|fainted|faint\w*|unconscious|unresponsive|blacked out|black out|collaps\w*)/i,
      /about to (faint|pass out)/i,
    ],
  },
  {
    signal: "Sudden severe headache",
    patterns: [
      /(worst|sudden severe|sudden and severe) headache/i,
      /worst headache of my life/i,
      /thunderclap/i,
    ],
  },
  {
    signal: "Anaphylaxis / severe allergic reaction",
    patterns: [
      /anaphyla\w*/i,
      /(severe )?allergic reaction/i,
      /throat (is )?(closing|swelling|tight)/i,
      /(face|lip|tongue) (is )?swell\w*/i,
      new RegExp(`${CANNOT} swallow`, "i"),
    ],
  },
  {
    signal: "Cardiac-associated symptoms",
    patterns: [/cold sweat/i, /breaking out in a sweat/i],
  },
  {
    signal: "Confusion or disorientation",
    patterns: [/(sudden(ly)? )?confus\w*/i, /disorient\w*/i, /(can'?t|cannot) think straight/i],
  },
  {
    signal: "Seizure",
    patterns: [/seizure/i, /convuls\w*/i, /fit\w* and shaking/i],
  },
  {
    signal: "Poisoning or overdose",
    patterns: [/overdose/i, /took too many (pills|tablets)/i, /poison\w*/i, /swallowed (bleach|chemical)/i],
  },
  {
    signal: "Suicidal or self-harm intent",
    patterns: [
      /(kill myself|end my life|suicid\w*|harm myself|hurt myself)/i,
      /want to die/i,
      /don'?t want to (live|be here)/i,
      /take my (own )?life/i,
    ],
  },
];

/** Vital-sign thresholds that warrant emergency consideration. */
function vitalRedFlags(req: EmergencyScreeningRequest): string[] {
  const signals: string[] = [];
  for (const v of req.availableVitalSigns) {
    const num = typeof v.value === "number" ? v.value : Number(v.value);
    if (Number.isNaN(num)) continue;
    if (v.type === "oxygen_saturation" && num < 92)
      signals.push("Low oxygen saturation");
    if (v.type === "heart_rate" && (num > 130 || num < 40))
      signals.push("Abnormal heart rate");
    if (v.type === "respiratory_rate" && num > 30)
      signals.push("Very fast breathing");
    if (v.type === "temperature" && num >= 40) signals.push("Very high fever");
  }
  return signals;
}

function collectText(req: EmergencyScreeningRequest): string {
  const parts: string[] = [req.chiefComplaint];
  for (const m of req.messages) if (m.role === "user") parts.push(m.content);
  for (const a of req.answers) {
    if (typeof a.answer === "string") parts.push(a.answer);
    else if (Array.isArray(a.answer)) parts.push(a.answer.join(" "));
  }
  return parts.join("  ");
}

class MockEmergencyScreeningService implements EmergencyScreeningService {
  readonly mode = "mock" as const;
  async screen(
    req: EmergencyScreeningRequest,
  ): Promise<EmergencyScreeningResponse> {
    await delay(Math.min(config.mockLatencyMs, 600));
    const text = collectText(req);
    const found = new Set<string>();
    for (const rf of RED_FLAGS) {
      if (rf.patterns.some((p) => p.test(text))) found.add(rf.signal);
    }
    for (const v of vitalRedFlags(req)) found.add(v);

    // Cardiac-cluster escalation: chest + breathing/sweating/dizziness together.
    const signals = [...found];
    const possibleEmergency = signals.length > 0;

    return {
      possibleEmergency,
      emergencySignals: signals,
      requiredAction: possibleEmergency
        ? "Interrupt questionnaire and move to emergency guidance immediately."
        : "Continue with adaptive questions and clinical triage.",
      requestId: shortId("scr"),
      timestamp: nowIso(),
    };
  }
}

class RealEmergencyScreeningService implements EmergencyScreeningService {
  readonly mode = "real" as const;
  constructor(private readonly endpoint: string) {}
  async screen(
    req: EmergencyScreeningRequest,
  ): Promise<EmergencyScreeningResponse> {
    return httpJson<EmergencyScreeningResponse>(this.endpoint, {
      method: "POST",
      body: req,
      responseSchema: emergencyScreeningResponseSchema,
      timeoutMs: 6000,
      retries: 1,
    });
  }
}

export function createEmergencyScreeningService(): EmergencyScreeningService {
  const ep = config.endpoints.emergencyScreening;
  return useRealAdapter(ep)
    ? new RealEmergencyScreeningService(ep)
    : new MockEmergencyScreeningService();
}

export const emergencyScreeningService = createEmergencyScreeningService();
