import { test } from "node:test";
import assert from "node:assert/strict";
import { emergencyScreeningService } from "../services/emergency-screening/index.js";
import { triageService } from "../services/triage/index.js";
import type { TriageRequest, UserContext } from "../shared/types.js";

function ctx(): UserContext {
  return {
    sessionId: "emg-" + Math.random().toString(36).slice(2),
    language: "en",
    country: "SA",
    healthDataSharingConsent: false,
    locationSharingConsent: false,
    providerContactConsent: false,
  };
}

function req(chiefComplaint: string): TriageRequest {
  return {
    sessionId: ctx().sessionId,
    userContext: ctx(),
    chiefComplaint,
    messages: [],
    answers: [],
    availableVitalSigns: [],
    submittedAt: new Date().toISOString(),
  };
}

/**
 * Safety-critical: these phrases describe medical emergencies and MUST be
 * detected by screening and escalate to Level 3. A regression here means a
 * seriously unwell user would be asked routine questions instead of being told
 * to get help now — the exact failure this suite guards against.
 */
const EMERGENCY_PHRASES = [
  "I have severe chest pain",
  "I cannot breathe",
  "I can not breathe",
  "I can't breathe",
  "I am struggling to breathe",
  "my face is drooping and I cannot speak",
  "sudden weakness on one side of my body",
  "I am bleeding heavily and it will not stop",
  "I took too many pills and want to die",
  "severe allergic reaction, my throat is closing",
  "I passed out and feel confused",
  "I think I am having a heart attack",
  "I cannot swallow and my tongue is swelling",
  "I am having a seizure",
  "the worst headache of my life came on suddenly",
];

for (const phrase of EMERGENCY_PHRASES) {
  test(`emergency screening flags: "${phrase}"`, async () => {
    const s = await emergencyScreeningService.screen({
      sessionId: "x",
      chiefComplaint: phrase,
      messages: [],
      answers: [],
      availableVitalSigns: [],
    });
    assert.equal(s.possibleEmergency, true, `expected possibleEmergency for: ${phrase}`);
    assert.ok(s.emergencySignals.length > 0);
  });

  test(`triage escalates to Level 3: "${phrase}"`, async () => {
    const r = await triageService.triage(req(phrase));
    assert.equal(r.triageLevel, 3, `expected Level 3 for: ${phrase}`);
    assert.equal(r.escalationRequired, true);
  });
}

/** Non-emergencies must NOT over-trigger Level 3. */
const NON_EMERGENCY = [
  "I have a mild headache since this morning",
  "I have a mild sore throat",
  "mild ankle pain after a walk",
];

for (const phrase of NON_EMERGENCY) {
  test(`does NOT over-escalate: "${phrase}"`, async () => {
    const s = await emergencyScreeningService.screen({
      sessionId: "x",
      chiefComplaint: phrase,
      messages: [],
      answers: [],
      availableVitalSigns: [],
    });
    assert.equal(s.possibleEmergency, false, `should not flag: ${phrase}`);
  });
}
