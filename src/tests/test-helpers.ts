/** Shared fixtures for the test suite: a minimal UserContext and TriageRequest. */
import type { TriageRequest, UserContext } from "../shared/types.js";

export function makeUserContext(prefix = "test"): UserContext {
  return {
    sessionId: `${prefix}-${Math.random().toString(36).slice(2)}`,
    language: "en",
    country: "SA",
    healthDataSharingConsent: false,
    locationSharingConsent: false,
    providerContactConsent: false,
  };
}

export function makeTriageRequest(chiefComplaint: string, prefix = "test"): TriageRequest {
  const userContext = makeUserContext(prefix);
  return {
    sessionId: userContext.sessionId,
    userContext,
    chiefComplaint,
    messages: [],
    answers: [],
    availableVitalSigns: [],
    submittedAt: new Date().toISOString(),
  };
}
