import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeForPanel, isRegisteredTool } from "../agent/tools.js";
import { step } from "../agent/orchestrator.js";
import type { UserContext } from "../shared/types.js";

test("technical panel sanitisation redacts sensitive fields", () => {
  const out = sanitizeForPanel({
    chiefComplaint: "very sensitive symptom text",
    callbackNumber: "+1234567890",
    location: { latitude: 24.7, longitude: 46.6 },
    messages: [{}, {}, {}],
    answers: [{}],
    triageLevel: 3,
  }) as Record<string, unknown>;
  assert.equal(out.chiefComplaint, "[redacted]");
  assert.equal(out.callbackNumber, "[redacted]");
  assert.equal(out.messages, "[3 items]");
  assert.equal(out.answers, "[1 items]");
  assert.equal(out.triageLevel, 3, "non-sensitive fields are preserved");
});

test("only registered tools are recognised", () => {
  assert.equal(isRegisteredTool("submit_triage"), true);
  assert.equal(isRegisteredTool("delete_database"), false);
});

function ctx(): UserContext {
  return {
    sessionId: "agent-" + Math.random().toString(36).slice(2),
    language: "en",
    country: "SA",
    healthDataSharingConsent: false,
    locationSharingConsent: false,
    providerContactConsent: false,
  };
}

test("agent loop: chest pressure message triggers emergency interrupt and Level 3", async () => {
  const userContext = ctx();
  const res = await step({
    sessionId: userContext.sessionId,
    userContext,
    message: "sudden chest pressure, difficulty breathing, sweating and dizziness",
  });
  assert.equal(res.emergencyInterrupt, true);
  assert.equal(res.triage?.triageLevel, 3);
  assert.equal(res.session.state, "presenting_level_3");
});

test("agent loop: benign message asks a follow-up question first", async () => {
  const userContext = ctx();
  const res = await step({
    sessionId: userContext.sessionId,
    userContext,
    message: "I have a mild sore throat",
  });
  assert.equal(res.emergencyInterrupt ?? false, false);
  assert.ok(res.question, "expected a follow-up question for limited info");
  assert.equal(res.session.state, "awaiting_user_response");
});

test("agent loop: a message after Level 3 does not crash and keeps the guidance", async () => {
  const userContext = ctx();
  await step({
    sessionId: userContext.sessionId,
    userContext,
    message: "sudden chest pressure, difficulty breathing, sweating and dizziness",
  });
  // presenting_level_3 cannot legally re-enter screening_for_emergency; the
  // orchestrator must reaffirm guidance instead of throwing InvalidTransitionError.
  const res = await step({
    sessionId: userContext.sessionId,
    userContext,
    message: "ok, calling now",
  });
  assert.equal(res.session.state, "presenting_level_3");
  assert.equal(res.triage?.triageLevel, 3, "the Level 3 result must still be present in the response");
  assert.ok(res.userMessage.length > 0);
});
