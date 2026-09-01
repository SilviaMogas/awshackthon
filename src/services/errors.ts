/** Typed service errors shared by all adapters. */

export type ServiceErrorCode =
  | "UPSTREAM_UNAVAILABLE"
  | "TIMEOUT"
  | "INVALID_RESPONSE"
  | "INVALID_REQUEST"
  | "CONSENT_REQUIRED"
  | "DUPLICATE_ACTION"
  | "NOT_FOUND"
  | "INTERNAL";

export class ServiceError extends Error {
  readonly code: ServiceErrorCode;
  readonly requestId?: string;
  readonly retriable: boolean;
  constructor(
    code: ServiceErrorCode,
    message: string,
    opts: { requestId?: string; retriable?: boolean } = {},
  ) {
    super(message);
    this.name = "ServiceError";
    this.code = code;
    this.requestId = opts.requestId;
    this.retriable = opts.retriable ?? false;
  }
}

/** Map a service error code to a safe, user-facing message (no internals). */
export function safeUserMessage(err: unknown): string {
  if (err instanceof ServiceError) {
    switch (err.code) {
      case "UPSTREAM_UNAVAILABLE":
      case "TIMEOUT":
        return "We could not complete the automated assessment right now.";
      case "INVALID_RESPONSE":
        return "We received an unexpected response and could not proceed safely.";
      case "CONSENT_REQUIRED":
        return "This action requires your explicit consent first.";
      case "DUPLICATE_ACTION":
        return "This request was already submitted. We are not sending a duplicate.";
      case "NOT_FOUND":
        return "The requested item could not be found.";
      case "INVALID_REQUEST":
        return "The request was missing required information.";
      default:
        return "Something went wrong. Please try again.";
    }
  }
  return "Something went wrong. Please try again.";
}
