import type { ApiErrorCode, ApiIssue } from '@devsync/shared';

/**
 * Every way a DevSync request can fail, in one type the interface can branch on.
 *
 * The seven codes the API publishes are used unchanged — they are the contract,
 * and `@devsync/shared` is where they are defined. Two more are added here for
 * the failures that never reach the API or never come back from it in a shape it
 * promised; they are the client's own, which is why they are listed separately
 * rather than smuggled into the shared enum.
 *
 * Components read `code` and `issues`. **Nothing branches on `message`**: the API
 * publishes it as human-readable wording that may be changed without that being a
 * contract change.
 */

export const CLIENT_ERROR_CODES = ['API_UNAVAILABLE', 'MALFORMED_RESPONSE'] as const;

export type ClientErrorCode = (typeof CLIENT_ERROR_CODES)[number];

export type ApiFailureCode = ApiErrorCode | ClientErrorCode;

export interface ApiRequestErrorOptions {
  status?: number;
  issues?: readonly ApiIssue[];
  cause?: unknown;
}

export class ApiRequestError extends Error {
  readonly code: ApiFailureCode;
  /** The HTTP status, when there was a response. Absent when the request never arrived. */
  readonly status: number | undefined;
  readonly issues: readonly ApiIssue[];

  constructor(code: ApiFailureCode, message: string, options: ApiRequestErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });

    this.name = 'ApiRequestError';
    this.code = code;
    this.status = options.status;
    this.issues = options.issues ?? [];
  }
}

export function isApiRequestError(error: unknown): error is ApiRequestError {
  return error instanceof ApiRequestError;
}

/** The request never reached the API, or the API answered nothing at all. */
export function apiUnavailable(cause: unknown): ApiRequestError {
  return new ApiRequestError(
    'API_UNAVAILABLE',
    'DevSync could not reach its API. Check that it is running, then try again.',
    { cause },
  );
}

/**
 * A response DevSync could not read. The cause is kept for a developer console
 * and never shown: whatever was wrong with the body is not something a user can
 * act on, and a raw payload is exactly what must not reach the interface.
 */
export function malformedResponse(cause?: unknown): ApiRequestError {
  return new ApiRequestError(
    'MALFORMED_RESPONSE',
    'DevSync received a response it could not read. Try again.',
    { cause },
  );
}

/** True when a failure carries this exact code, for any value that might be one. */
export function hasErrorCode(error: unknown, code: ApiFailureCode): boolean {
  return isApiRequestError(error) && error.code === code;
}

/**
 * The field-level message for one request property, when the failure named it.
 *
 * Matched on the first path segment, which is where a top-level property sits.
 * Nothing in Phase C sends a nested body, so a deeper path has nowhere to be
 * shown and is left to the general message.
 */
export function issueMessageFor(error: unknown, field: string): string | undefined {
  if (!isApiRequestError(error)) {
    return undefined;
  }

  return error.issues.find((issue) => issue.path[0] === field)?.message;
}

/**
 * What to show a user for any thrown value.
 *
 * An unexpected value gets DevSync's own wording rather than whatever it happens
 * to stringify to, so a stack, a raw body, or an internal detail cannot reach the
 * interface through an error path nobody anticipated.
 */
export function errorMessage(error: unknown): string {
  return isApiRequestError(error) ? error.message : 'Something went wrong. Try again.';
}
