import { apiErrorResourceSchema, parseContract } from '@devsync/shared';
import type { ContractSchema, ContractValue } from '@devsync/shared';
import { API_BASE_URL } from './api-url';
import { ApiRequestError, apiUnavailable, malformedResponse } from './api-error';

/**
 * The transport, and the only place in `apps/web` that calls `fetch`.
 *
 * Everything above it deals in resources and failures rather than in responses:
 * a component never reads a status code, never parses a body, and never sees a
 * header. What comes back has been through the schema `@devsync/shared`
 * publishes for it, so a route that grew a property or dropped a timestamp fails
 * here rather than rendering as `undefined`.
 */

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export interface RequestOptions {
  /** Aborts the request when the caller loses interest — a file switch, an unmount. */
  signal?: AbortSignal | undefined;
}

interface ApiRequest extends RequestOptions {
  method: Method;
  path: string;
  /** Serialised as JSON when present. Absent means no body and no `Content-Type`. */
  body?: unknown;
}

/** True for the rejection an `AbortController` produces, which is never a failure to report. */
export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

async function send({ method, path, body, signal }: ApiRequest): Promise<Response> {
  const init: RequestInit = {
    method,
    // Persistence, so never a cached answer: the question these requests ask is
    // what the database says now, and Next.js would otherwise be free to reuse a
    // response it already has.
    cache: 'no-store',
  };

  if (signal !== undefined) {
    init.signal = signal;
  }

  if (body !== undefined) {
    init.body = JSON.stringify(body);
    // Set only when there is something to describe. A `Content-Type` on a bodiless
    // request is a header that buys a CORS preflight and says nothing.
    init.headers = { 'Content-Type': 'application/json' };
  }

  try {
    return await fetch(`${API_BASE_URL}${path}`, init);
  } catch (error) {
    // An abort is the caller's own doing and is rethrown untouched, so it can be
    // recognised and ignored rather than reported as the API being down.
    if (isAbortError(error)) {
      throw error;
    }

    throw apiUnavailable(error);
  }
}

/**
 * A failure response, read as the one error resource every route answers with.
 *
 * A body that is not that resource is a contract failure rather than something to
 * guess at, so it becomes the client's generic error instead of being partially
 * believed.
 */
async function toFailure(response: Response): Promise<ApiRequestError> {
  let body: unknown;

  try {
    body = await response.json();
  } catch (error) {
    return malformedResponse(error);
  }

  const parsed = parseContract(apiErrorResourceSchema, body);

  if (!parsed.ok) {
    return malformedResponse();
  }

  return new ApiRequestError(parsed.value.code, parsed.value.message, {
    status: parsed.value.statusCode,
    issues: parsed.value.issues ?? [],
  });
}

export async function requestResource<Schema extends ContractSchema>(
  schema: Schema,
  request: ApiRequest,
): Promise<ContractValue<Schema>> {
  const response = await send(request);

  if (!response.ok) {
    throw await toFailure(response);
  }

  let body: unknown;

  try {
    body = await response.json();
  } catch (error) {
    throw malformedResponse(error);
  }

  const parsed = parseContract(schema, body);

  if (!parsed.ok) {
    throw malformedResponse();
  }

  return parsed.value;
}

/** The one success status the delete routes answer with. */
const NO_CONTENT = 204;

/**
 * A route that answers `204`, and only `204`.
 *
 * The status is checked rather than assumed, for the same reason a success body
 * is parsed against its schema: a route answering something else is a contract
 * failure, and treating it as a success would report a deletion that may not have
 * happened. No body is read either way — a `204` carries none, and reading one
 * would be a second way for this to fail.
 */
export async function requestNoContent(request: ApiRequest): Promise<void> {
  const response = await send(request);

  if (!response.ok) {
    throw await toFailure(response);
  }

  if (response.status !== NO_CONTENT) {
    throw malformedResponse();
  }
}

/** A path segment, escaped. Identifiers are UUIDs, and are still not pasted raw into a URL. */
export function segment(value: string): string {
  return encodeURIComponent(value);
}
