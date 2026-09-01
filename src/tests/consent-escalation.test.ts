import { test } from "node:test";
import assert from "node:assert/strict";
import { escalationService } from "../services/escalation/index.js";
import { providerContactService } from "../services/provider-contact/index.js";
import { emergencyNumberService } from "../services/emergency-numbers/index.js";
import { ServiceError } from "../services/errors.js";
import type { ClinicalSummary, ConsentRecord } from "../shared/types.js";

const summary: ClinicalSummary = {
  chiefComplaint: "chest pressure",
  associatedSymptoms: [],
  relevantConditions: [],
  allergies: [],
  medication: [],
  availableVitalSigns: [],
  confirmedNegativeFindings: [],
  missingInformation: [],
};

function consent(...types: string[]): ConsentRecord[] {
  return types.map((t) => ({
    consentType: t as ConsentRecord["consentType"],
    granted: true,
    timestamp: new Date().toISOString(),
    policyVersion: "test",
  }));
}

test("escalation without consent is rejected", async () => {
  await assert.rejects(
    () =>
      escalationService.escalate({
        sessionId: "s",
        triageRequestId: "t",
        userConsent: [],
        clinicalSummary: summary,
        submittedAt: new Date().toISOString(),
        idempotencyKey: "no-consent-" + Math.random(),
      }),
    (e: unknown) => e instanceof ServiceError && e.code === "CONSENT_REQUIRED",
  );
});

test("escalation with consent returns a SIMULATED response (never claimed real)", async () => {
  const res = await escalationService.escalate({
    sessionId: "s",
    triageRequestId: "t",
    userConsent: consent("emergency_escalation", "health_data_sharing"),
    clinicalSummary: summary,
    submittedAt: new Date().toISOString(),
    idempotencyKey: "ok-" + Math.random(),
  });
  assert.equal(res.simulated, true);
  assert.equal(res.status, "simulated");
  assert.ok(res.referenceId.length > 0);
});

test("duplicate escalation (same idempotency key) is blocked — no duplicate alerts", async () => {
  const key = "dup-" + Math.random();
  const base = {
    sessionId: "s",
    triageRequestId: "t",
    userConsent: consent("emergency_escalation", "health_data_sharing"),
    clinicalSummary: summary,
    submittedAt: new Date().toISOString(),
    idempotencyKey: key,
  };
  await escalationService.escalate(base);
  await assert.rejects(
    () => escalationService.escalate(base),
    (e: unknown) => e instanceof ServiceError && e.code === "DUPLICATE_ACTION",
  );
});

test("escalation with location but no location consent is rejected", async () => {
  await assert.rejects(
    () =>
      escalationService.escalate({
        sessionId: "s",
        triageRequestId: "t",
        userConsent: consent("emergency_escalation", "health_data_sharing"),
        clinicalSummary: summary,
        location: { latitude: 24.7, longitude: 46.6 },
        submittedAt: new Date().toISOString(),
        idempotencyKey: "loc-" + Math.random(),
      }),
    (e: unknown) => e instanceof ServiceError && e.code === "CONSENT_REQUIRED",
  );
});

test("provider contact requires consent and is labelled simulated", async () => {
  await assert.rejects(
    () =>
      providerContactService.request({
        sessionId: "s",
        triageRequestId: "t",
        userConsent: [],
        clinicalSummary: summary,
        submittedAt: new Date().toISOString(),
        idempotencyKey: "pc-noconsent-" + Math.random(),
      }),
    (e: unknown) => e instanceof ServiceError && e.code === "CONSENT_REQUIRED",
  );
  const ok = await providerContactService.request({
    sessionId: "s",
    triageRequestId: "t",
    userConsent: consent("provider_contact", "health_data_sharing"),
    clinicalSummary: summary,
    submittedAt: new Date().toISOString(),
    idempotencyKey: "pc-ok-" + Math.random(),
  });
  assert.equal(ok.simulated, true);
});

test("emergency number lookup returns correct country numbers", async () => {
  const sa = await emergencyNumberService.get("SA");
  assert.equal(sa.emergencyNumber, "997");
  const us = await emergencyNumberService.get("US");
  assert.equal(us.emergencyNumber, "911");
  const unknown = await emergencyNumberService.get("ZZ");
  assert.equal(unknown.emergencyNumber, "112"); // universal fallback
});

test("escalation status advances (monitoring)", async () => {
  const res = await escalationService.escalate({
    sessionId: "s",
    triageRequestId: "t",
    userConsent: consent("emergency_escalation", "health_data_sharing"),
    clinicalSummary: summary,
    submittedAt: new Date().toISOString(),
    idempotencyKey: "mon-" + Math.random(),
  });
  const s1 = await escalationService.status(res.referenceId);
  assert.ok(["received", "acknowledged"].includes(s1.status));
});
