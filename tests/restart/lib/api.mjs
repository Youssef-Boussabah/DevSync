// @ts-check

// The only way this validation reaches DevSync's data.
//
// **Every record is created and read through the public HTTP routes.** Nothing
// here opens a connection to PostgreSQL, imports `@devsync/database`, or runs
// SQL, and that is deliberate: the claim C4 makes is that a person's saved work
// survives a restart, and the API is where a person's work goes. Seeding through
// the database would prove that PostgreSQL keeps rows, which nobody doubted.
//
// Every request is bounded. A route that hangs during a database outage is one of
// the failures this milestone exists to catch, so no call may wait indefinitely.

import { assertExactKeys, isIsoUtcTimestamp, redact } from './support.mjs';

const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;

/**
 * What a request produced. `failure` is set when the request could not complete
 * at all — the harness treats that as data rather than as an exception, because a
 * poll needs to see it and try again.
 *
 * @typedef {object} ApiResponse
 * @property {number} status `0` when the request never got an answer.
 * @property {boolean} ok
 * @property {string} text The raw body, exactly as it arrived.
 * @property {unknown} json The parsed body, or `undefined` when it is not JSON.
 * @property {string | undefined} failure A redacted reason the request failed.
 * @property {number} elapsedMs
 */

/**
 * @param {string} baseUrl
 * @returns {{
 *   baseUrl: string,
 *   request: (
 *     method: string,
 *     routePath: string,
 *     options?: { body?: unknown, timeoutMs?: number },
 *   ) => Promise<ApiResponse>,
 * }}
 */
export function createApiClient(baseUrl) {
  return {
    baseUrl,

    async request(method, routePath, options = {}) {
      const { body, timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS } = options;
      const startedAt = Date.now();

      /** @type {RequestInit} */
      const init = {
        method,
        signal: AbortSignal.timeout(timeoutMs),
        headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      };

      if (body !== undefined) {
        init.body = JSON.stringify(body);
      }

      try {
        const response = await fetch(`${baseUrl}${routePath}`, init);
        const text = await response.text();

        return {
          status: response.status,
          ok: response.ok,
          text,
          json: parseJsonBody(text),
          failure: undefined,
          elapsedMs: Date.now() - startedAt,
        };
      } catch (error) {
        return {
          status: 0,
          ok: false,
          text: '',
          json: undefined,
          failure: redact(error instanceof Error ? error.message : String(error)),
          elapsedMs: Date.now() - startedAt,
        };
      }
    },
  };
}

/**
 * @param {string} text
 * @returns {unknown}
 */
function parseJsonBody(text) {
  try {
    return /** @type {unknown} */ (JSON.parse(text));
  } catch {
    return undefined;
  }
}

// --- Resource shapes ---------------------------------------------------------
//
// Checked here rather than through `@devsync/shared`'s Zod schemas, for one
// reason: this runner must work with nothing built. Importing the contracts would
// mean `packages/shared/dist` had to exist before a container could be started,
// which would turn a Docker validation into a build. What is lost is a shared
// definition; what is gained is an independent one — an assertion written from
// the client's side rather than from the same file the server validates with.

const PROJECT_KEYS = ['id', 'name', 'createdAt', 'updatedAt'];
const PROJECT_DETAIL_KEYS = [...PROJECT_KEYS, 'files'];
const FILE_SUMMARY_KEYS = ['id', 'projectId', 'name', 'language', 'createdAt', 'updatedAt'];
const FILE_KEYS = [...FILE_SUMMARY_KEYS, 'content'];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * @param {string} label
 * @param {unknown} value
 * @returns {Record<string, unknown>}
 */
export function assertProjectResource(label, value) {
  const record = assertExactKeys(label, value, PROJECT_KEYS);

  assertIdentifier(`${label}.id`, record.id);
  assertNonEmptyString(`${label}.name`, record.name);
  assertTimestamps(label, record);

  return record;
}

/**
 * @param {string} label
 * @param {unknown} value
 * @returns {Record<string, unknown>}
 */
export function assertProjectDetailResource(label, value) {
  const record = assertExactKeys(label, value, PROJECT_DETAIL_KEYS);

  assertIdentifier(`${label}.id`, record.id);
  assertNonEmptyString(`${label}.name`, record.name);
  assertTimestamps(label, record);

  if (!Array.isArray(record.files)) {
    throw new Error(`${label}.files is not an array.`);
  }

  record.files.forEach((file, index) => {
    assertFileSummaryResource(`${label}.files[${index}]`, file);
  });

  return record;
}

/**
 * @param {string} label
 * @param {unknown} value
 * @returns {Record<string, unknown>}
 */
export function assertFileSummaryResource(label, value) {
  const record = assertExactKeys(label, value, FILE_SUMMARY_KEYS);

  assertIdentifier(`${label}.id`, record.id);
  assertIdentifier(`${label}.projectId`, record.projectId);
  assertNonEmptyString(`${label}.name`, record.name);
  assertNonEmptyString(`${label}.language`, record.language);
  assertTimestamps(label, record);

  return record;
}

/**
 * @param {string} label
 * @param {unknown} value
 * @returns {Record<string, unknown>}
 */
export function assertFileResource(label, value) {
  const record = assertExactKeys(label, value, FILE_KEYS);

  assertIdentifier(`${label}.id`, record.id);
  assertIdentifier(`${label}.projectId`, record.projectId);
  assertNonEmptyString(`${label}.name`, record.name);
  assertNonEmptyString(`${label}.language`, record.language);

  if (typeof record.content !== 'string') {
    throw new Error(`${label}.content is not a string.`);
  }

  assertTimestamps(label, record);

  return record;
}

/**
 * @param {string} label
 * @param {unknown} value
 * @returns {void}
 */
function assertIdentifier(label, value) {
  if (typeof value !== 'string' || !UUID.test(value)) {
    throw new Error(`${label} is not a UUID.`);
  }
}

/**
 * @param {string} label
 * @param {unknown} value
 * @returns {void}
 */
function assertNonEmptyString(label, value) {
  if (typeof value !== 'string' || value === '') {
    throw new Error(`${label} is not a non-empty string.`);
  }
}

/**
 * @param {string} label
 * @param {Record<string, unknown>} record
 * @returns {void}
 */
function assertTimestamps(label, record) {
  for (const key of ['createdAt', 'updatedAt']) {
    if (!isIsoUtcTimestamp(record[key])) {
      throw new Error(`${label}.${key} is not a UTC ISO-8601 instant.`);
    }
  }
}
