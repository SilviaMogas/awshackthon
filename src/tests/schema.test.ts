import { test } from "node:test";
import assert from "node:assert/strict";
import {
  triageResponseSchema,
  escalationRequestSchema,
} from "../shared/schemas.js";

test("valid Level 3 triage response passes schema validation", () => {
  const r = triageResponseSchema.safeParse({
    triageLevel: 3,
    urgencyLabel: "Urgent medical help may be needed",
    recommendedAction: "Contact local emergency services immediately.",
    timeframe: "Now",
    warningSigns: ["Chest pressure"],
    escalationRequired: true,
    clinicalSummary: {
      chiefComplaint: "chest pressure",
      associatedSymptoms: [],
      relevantConditions: [],
      allergies: [],
      medication: [],
      availableVitalSigns: [],
      confirmedNegativeFindings: [],
      missingInformation: [],
    },
    requestId: "demo-triage-level-3",
    timestamp: new Date().toISOString(),
  });
  assert.ok(r.ok, "expected valid response to pass");
});

test("invalid triage response (bad level) is rejected", () => {
  const r = triageResponseSchema.safeParse({
    triageLevel: 9,
    urgencyLabel: "x",
    recommendedAction: "x",
    timeframe: "x",
    warningSigns: [],
    escalationRequired: false,
    clinicalSummary: {
      chiefComplaint: "x",
      associatedSymptoms: [],
      relevantConditions: [],
      allergies: [],
      medication: [],
      availableVitalSigns: [],
      confirmedNegativeFindings: [],
      missingInformation: [],
    },
    requestId: "x",
    timestamp: "x",
  });
  assert.equal(r.ok, false, "expected invalid triage level to fail");
});

test("escalation request requires idempotencyKey", () => {
  const r = escalationRequestSchema.safeParse({
    sessionId: "s1",
    triageRequestId: "t1",
    userConsent: [],
    clinicalSummary: {
      chiefComplaint: "x",
      associatedSymptoms: [],
      relevantConditions: [],
      allergies: [],
      medication: [],
      availableVitalSigns: [],
      confirmedNegativeFindings: [],
      missingInformation: [],
    },
    submittedAt: new Date().toISOString(),
    // idempotencyKey missing
  });
  assert.equal(r.ok, false, "expected missing idempotencyKey to fail");
});
