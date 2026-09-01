import { test } from "node:test";
import assert from "node:assert/strict";
import { canTransition } from "../agent/state-machine.js";

test("cannot execute an action before awaiting consent", () => {
  // presenting_level_2 must go through awaiting_consent before executing_action.
  assert.equal(canTransition("presenting_level_2", "executing_action"), false);
  assert.equal(canTransition("presenting_level_2", "awaiting_consent"), true);
  assert.equal(canTransition("awaiting_consent", "executing_action"), true);
});

test("emergency interruption is allowed from routine states", () => {
  assert.equal(canTransition("asking_follow_up", "presenting_level_3"), true);
  assert.equal(canTransition("collecting_context", "screening_for_emergency"), true);
  assert.equal(canTransition("awaiting_user_response", "presenting_level_3"), true);
});

test("safety fallback is always reachable", () => {
  assert.equal(canTransition("submitting_triage", "fallback_required"), true);
  assert.equal(canTransition("executing_action", "failed"), true);
  assert.equal(canTransition("monitoring_action", "fallback_required"), true);
});

test("cannot return to routine questions after Level 3 without reset", () => {
  // presenting_level_3 does NOT allow going back to asking_follow_up directly.
  assert.equal(canTransition("presenting_level_3", "asking_follow_up"), false);
  assert.equal(canTransition("presenting_level_3", "collecting_context"), false);
});
