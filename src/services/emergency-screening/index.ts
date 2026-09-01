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

/** Red-flag phrases grouped by signal. Matched case-insensitively. */
const RED_FLAGS: { signal: string; patterns: RegExp[] }[] = [
  {
    signal: "Chest pain or pressure",
    patterns: [/chest (pain|pressure|tight)/i, /pressure in (my |the )?chest/i],
  },
  {
    signal: "Difficulty breathing",
    patterns: [
      /(difficulty|trouble|hard|struggl\w*) (to )?breath\w*/i,
      /can'?t breathe/i,
      /short(ness)? of breath/i,
      /gasping/i,
    ],
  },
  {
    signal: "Signs of stroke",
    patterns: [
      /face (droop|drooping)/i,
      /slurred speech/i,
      /sudden (weakness|numbness)/i,
      /can'?t (move|feel) (my )?(arm|leg|side)/i,
    ],
  },
  {
    signal: "Severe bleeding",
    patterns: [/(severe|heavy|uncontrolled) bleeding/i, /bleeding (that )?won'?t stop/i],
  },
  {
    signal: "Loss of consciousness",
    patterns: [/(passed out|fainted|unconscious|unresponsive|blacked out)/i],
  },
  {
    signal: "Sudden severe headache",
    patterns: [/(worst|sudden severe) headache/i, /thunderclap/i],
  },
  {
    signal: "Anaphylaxis / severe allergic reaction",
    patterns: [/anaphyla/i, /throat (closing|swelling)/i, /face swelling/i],
  },
  {
    signal: "Sweating with cardiac symptoms",
    patterns: [/cold sweat/i, /sweating/i],
  },
  {
    signal: "Confusion or disorientation",
    patterns: [/(sudden )?confus\w*/i, /disorient\w*/i],
  },
  {
    signal: "Suicidal or self-harm intent",
    patterns: [/(kill myself|end my life|suicid\w*|harm myself)/i],
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
