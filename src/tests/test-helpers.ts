/** Shared fixtures for the test suite: a minimal UserContext and TriageRequest. */
import type { TriageRequest, UserContext } from "../shared/types.js";
import { genId } from "../shared/util.js";

export function makeUserContext(prefix = "test"): UserContext {
  return {
    sessionId: genId(prefix),
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
