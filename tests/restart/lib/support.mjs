// @ts-check

// The pure half of the C4 restart validation: the constants that decide what may
// be touched, the guards that enforce it, the bounded waiting, the redaction, and
// the comparisons that decide whether a record survived.
//
// Nothing here spawns a process, opens a socket, or reads the clock without being
// told to — which is what makes it testable in `tests/support.test.ts` without a
// container. Everything impure lives in `docker.mjs` and `api.mjs` beside it.
//
// Plain JavaScript rather than TypeScript because the runner is a command with no
// compile step in front of it, the same arrangement `packages/database/tools`
// uses. `support.d.mts` carries the types the TypeScript suite reads.

/**
 * The Compose project the validation stack runs under, and the only one any
 * command in this harness may address.
 *
 * It exists so that stopping a database, restarting an API, and dropping a volume
 * are things that happen to a stack this run created, never to the one a
 * developer is working in.
 */
export const VALIDATION_PROJECT_NAME = 'devsync-c4-validation';

/** The ordinary development project. Named here only so it can be refused. */
export const DEVELOPMENT_PROJECT_NAME = 'devsync';

/**
 * Host ports the validation stack publishes.
 *
 * Deliberately none of the development pair (3000, 3001), the Playwright pair
 * (4310, 4311), or PostgreSQL's published 5433, so a developer can have the
 * ordinary stack up, `pnpm dev` running, and this validation in flight at once.
 *
 * The web application is never built or started by this harness — the C4
 * scenarios are all API, database, and migration — but its port is parameterised
 * with the others so the Compose file has one rule rather than two.
 */
export const VALIDATION_HOST_PORTS = Object.freeze({ web: 4320, api: 4321, postgres: 5434 });

/** How the validation stack's own volume names begin, once Compose has prefixed them. */
export const VALIDATION_VOLUME_PREFIX = `${VALIDATION_PROJECT_NAME}_`;

// --- Redaction ---------------------------------------------------------------

// `DATABASE_URL=postgresql://user:password@host/db` and friends, matched before
// the bare-URL pattern below so the whole assignment goes rather than its scheme.
const CREDENTIAL_ASSIGNMENT =
  /\b(DATABASE_URL|TEST_DATABASE_URL|POSTGRES_PASSWORD|PGPASSWORD)\b(\s*[=:]\s*)(\S+)/gi;

// Any PostgreSQL connection URL, wherever it appears — a log line, an error
// message, a `docker inspect` dump.
const CONNECTION_URL = /\b(postgres(?:ql)?):\/\/[^\s"'`,;)\]}]*/gi;

/**
 * Removes anything that could carry a credential from text that is about to be
 * printed. Everything this harness writes to the console goes through it.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function redact(value) {
  const text = typeof value === 'string' ? value : String(value ?? '');

  return text
    .replace(CREDENTIAL_ASSIGNMENT, (_match, name, separator) => `${name}${separator}<redacted>`)
    .replace(CONNECTION_URL, (_match, scheme) => `${scheme}://<redacted>`);
}

// --- Safety guards -----------------------------------------------------------

/**
 * Refuses any Compose project but the validation one.
 *
 * This is the rule that makes the isolation real rather than documented: every
 * Compose invocation in this harness passes its project name through here first,
 * so a command that would reach the development stack cannot be issued at all.
 *
 * @param {string} projectName
 * @returns {string} the project name, when it is the validation one
 */
export function assertValidationProject(projectName) {
  if (projectName !== VALIDATION_PROJECT_NAME) {
    throw new Error(
      `Refusing to run a Docker Compose command against the project "${projectName}". This ` +
        `validation stops containers and deletes a volume, and it only ever does that to ` +
        `"${VALIDATION_PROJECT_NAME}".`,
    );
  }

  return projectName;
}

/**
 * Refuses to delete a volume that is not one this run created.
 *
 * The list comes from `docker volume ls` filtered on Compose's own project label,
 * so it is what Docker believes rather than what this harness assumed. A single
 * name outside the validation prefix stops the cleanup.
 *
 * @param {readonly string[]} volumeNames
 * @returns {readonly string[]}
 */
export function assertDisposableVolumes(volumeNames) {
  const foreign = volumeNames.filter((name) => !name.startsWith(VALIDATION_VOLUME_PREFIX));

  if (foreign.length > 0) {
    throw new Error(
      `Refusing to delete volumes that are not this validation's: ${foreign.join(', ')}. Every ` +
        `volume removed here must begin with "${VALIDATION_VOLUME_PREFIX}".`,
    );
  }

  return volumeNames;
}

/**
 * Proves the development stack's volumes are exactly as they were before the run.
 *
 * `devsync_postgres_data` holds a developer's real projects. This validation
 * never addresses it, and this is what says so afterwards rather than assuming it.
 *
 * @param {readonly string[]} before
 * @param {readonly string[]} after
 * @returns {void}
 */
export function assertDevelopmentVolumesUntouched(before, after) {
  const expected = [...before].sort();
  const actual = [...after].sort();
  const missing = expected.filter((name) => !actual.includes(name));
  const added = actual.filter((name) => !expected.includes(name));

  if (missing.length > 0 || added.length > 0) {
    const parts = [];

    if (missing.length > 0) {
      parts.push(`removed: ${missing.join(', ')}`);
    }

    if (added.length > 0) {
      parts.push(`added: ${added.join(', ')}`);
    }

    throw new Error(
      `The "${DEVELOPMENT_PROJECT_NAME}" project's volumes changed during this run (${parts.join('; ')}). ` +
        'Nothing in this validation may touch them.',
    );
  }
}

// --- Command results ---------------------------------------------------------

/**
 * A redacted, readable account of what a command did. Used in failure reports and
 * nowhere else, so a passing run prints no command output it did not choose to.
 *
 * @param {import('./support.d.mts').CommandResult} result
 * @returns {string}
 */
export function describeCommandResult(result) {
  const lines = [
    `command: ${redact(result.commandLine)}`,
    `exit code: ${result.exitCode === null ? `none (signal ${result.signal ?? 'unknown'})` : result.exitCode}`,
  ];

  const stdout = redact(result.stdout).trim();
  const stderr = redact(result.stderr).trim();

  if (stdout !== '') {
    lines.push(`stdout:\n${indent(stdout)}`);
  }

  if (stderr !== '') {
    lines.push(`stderr:\n${indent(stderr)}`);
  }

  return lines.join('\n');
}

/**
 * @param {string} description
 * @param {import('./support.d.mts').CommandResult} result
 * @returns {import('./support.d.mts').CommandResult}
 */
export function assertCommandSucceeded(description, result) {
  if (result.exitCode === 0) {
    return result;
  }

  throw new Error(`${description} failed.\n${describeCommandResult(result)}`);
}

/**
 * @param {string} text
 * @returns {string}
 */
function indent(text) {
  return text
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n');
}

// --- Bounded waiting ---------------------------------------------------------

/**
 * What a bounded wait ran out of time doing. Distinct from an ordinary failure so
 * a caller can say "the condition never became true" rather than "something threw".
 */
export class TimeoutError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * @param {number} ms
 * @returns {Promise<void>}
 */
function defaultSleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Polls a real condition until it holds, or until a deadline passes.
 *
 * **There is no fixed sleep anywhere in this harness.** Every wait is a condition
 * somebody can name — a container's health status, an HTTP response, a stopped
 * state, a process exit — checked on an interval with a maximum. A wait that runs
 * out says what it was waiting for, how many times it looked, and what it saw last.
 *
 * The clock and the sleep are injectable so the deadline arithmetic can be tested
 * without spending the time it measures.
 *
 * @template T
 * @param {string} description
 * @param {() => Promise<import('./support.d.mts').ProbeOutcome<T>> | import('./support.d.mts').ProbeOutcome<T>} probe
 * @param {import('./support.d.mts').WaitOptions} options
 * @returns {Promise<import('./support.d.mts').ProbeOutcome<T>>}
 */
export async function waitFor(description, probe, options) {
  const { timeoutMs, intervalMs = 1000, now = () => Date.now(), sleep = defaultSleep } = options;

  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error(`waitFor("${description}") needs a positive timeout; received ${timeoutMs}.`);
  }

  if (!Number.isFinite(intervalMs) || intervalMs <= 0) {
    throw new Error(`waitFor("${description}") needs a positive interval; received ${intervalMs}.`);
  }

  const startedAt = now();
  let attempts = 0;
  let lastDetail = 'the condition was never observed';

  for (;;) {
    attempts += 1;

    const outcome = await probe();

    if (outcome.ok) {
      return outcome;
    }

    lastDetail = outcome.detail ?? 'no detail reported';

    if (now() - startedAt >= timeoutMs) {
      throw new TimeoutError(
        `Timed out after ${timeoutMs} ms waiting for ${description}. ` +
          `Checked ${attempts} time${attempts === 1 ? '' : 's'}; last saw: ${redact(lastDetail)}`,
      );
    }

    await sleep(intervalMs);
  }
}

// --- Shapes and comparisons --------------------------------------------------

const ISO_UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

/**
 * A UTC instant with the `Z` designator, and a real date. Local times with an
 * offset, dates, and epoch milliseconds are all refused — the API's contract says
 * UTC ISO-8601, and this checks that rather than that something parsed.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isIsoUtcTimestamp(value) {
  return (
    typeof value === 'string' && ISO_UTC_TIMESTAMP.test(value) && !Number.isNaN(Date.parse(value))
  );
}

/**
 * Asserts an object carries exactly the properties named and no others.
 *
 * The "no others" half is the point: it is what fails when a response grows a
 * property, leaks a stack, or answers with something that is not the resource the
 * route documents. Asserting a status code would catch none of that.
 *
 * @param {string} label
 * @param {unknown} value
 * @param {readonly string[]} keys
 * @returns {Record<string, unknown>}
 */
export function assertExactKeys(label, value, keys) {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} is not an object: ${describeValue(value)}`);
  }

  const record = /** @type {Record<string, unknown>} */ (value);
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  const missing = expected.filter((key) => !actual.includes(key));
  const unexpected = actual.filter((key) => !expected.includes(key));

  if (missing.length > 0 || unexpected.length > 0) {
    const parts = [];

    if (missing.length > 0) {
      parts.push(`missing ${missing.join(', ')}`);
    }

    if (unexpected.length > 0) {
      parts.push(`unexpected ${unexpected.join(', ')}`);
    }

    throw new Error(`${label} does not match its contract: ${parts.join('; ')}.`);
  }

  return record;
}

/**
 * Every property of `expected` compared with `actual`, byte for byte, reported as
 * a list rather than as the first failure — so a run that lost three fields says
 * so once instead of three times.
 *
 * @param {string} label
 * @param {Record<string, unknown>} expected
 * @param {Record<string, unknown>} actual
 * @returns {string[]}
 */
export function compareRecords(label, expected, actual) {
  /** @type {string[]} */
  const differences = [];

  for (const key of Object.keys(expected).sort()) {
    const before = expected[key];
    const after = actual[key];

    if (!Object.is(before, after)) {
      differences.push(
        `${label}.${key} changed: ${describeValue(before)} -> ${describeValue(after)}`,
      );
    }
  }

  return differences;
}

/**
 * A value, short enough to read and safe enough to print.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function describeValue(value) {
  // `JSON.stringify` answers `undefined` for `undefined` and for a function, so
  // the fallback is what keeps a difference report readable rather than empty.
  const rendered = JSON.stringify(value) ?? String(value);
  const redacted = redact(rendered);

  return redacted.length > 120 ? `${redacted.slice(0, 117)}...` : redacted;
}

// --- Leakage audit -----------------------------------------------------------

/**
 * What a DevSync failure response may never contain. Each entry is something a
 * client could use to learn how the service is built, and each has a real way of
 * getting there — an ORM error message, a driver's socket code, a query in a log
 * line, a connection string in an environment dump.
 */
const FORBIDDEN_IN_RESPONSES = Object.freeze([
  { what: 'a stack frame', pattern: /\bat\s+[\w$.<>]+\s*\(|\n\s+at\s+\S/ },
  { what: 'the ORM name', pattern: /prisma/i },
  { what: 'a Prisma error code', pattern: /\bP\d{4}\b/ },
  { what: 'the PostgreSQL name or a connection string', pattern: /postgres/i },
  {
    what: 'a driver socket error code',
    pattern: /\b(?:ECONNREFUSED|ECONNRESET|ENOTFOUND|ETIMEDOUT|EPIPE|EHOSTUNREACH|EAI_AGAIN)\b/,
  },
  {
    what: 'SQL',
    // No trailing `\b`: the first alternative already ends on a word character,
    // and a boundary after it would only match a one-character identifier.
    pattern:
      /\bSELECT\s+\w|\bINSERT\s+INTO\b|\bDELETE\s+FROM\b|\bCREATE\s+TABLE\b|\bALTER\s+TABLE\b|\bDROP\s+TABLE\b/i,
  },
  { what: 'a table name', pattern: /\bproject_files\b|\bpublic\.\w+/ },
  { what: 'a credential', pattern: /\bpassword\b|devsync:devsync/i },
]);

/**
 * Refuses a response body that describes the machinery behind the failure.
 *
 * Run against the **raw** text rather than a parsed body, so a leak in a property
 * this harness does not name is still caught.
 *
 * @param {string} label
 * @param {string} text
 * @returns {void}
 */
export function assertNoSensitiveContent(label, text) {
  const leaks = FORBIDDEN_IN_RESPONSES.filter(({ pattern }) => pattern.test(text)).map(
    ({ what }) => what,
  );

  if (leaks.length > 0) {
    throw new Error(
      `${label} contains ${leaks.join(', ')}. A DevSync failure response carries a status, a ` +
        `stable code, and a message, and nothing about how the service is built.`,
    );
  }
}

// --- Parsing -----------------------------------------------------------------

/**
 * Docker's `--format json` output, which is a JSON array in some versions and one
 * JSON object per line in others. Both are read here so the harness does not
 * depend on which Compose the machine has.
 *
 * @param {string} stdout
 * @returns {unknown[]}
 */
export function parseJsonOutput(stdout) {
  const trimmed = stdout.trim();

  if (trimmed === '') {
    return [];
  }

  if (trimmed.startsWith('[')) {
    const parsed = /** @type {unknown} */ (JSON.parse(trimmed));

    return Array.isArray(parsed) ? parsed : [parsed];
  }

  return trimmed
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => /** @type {unknown} */ (JSON.parse(line)));
}

/**
 * Non-empty lines from a command that prints one value per line.
 *
 * @param {string} stdout
 * @returns {string[]}
 */
export function parseLines(stdout) {
  return stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

// --- Naming ------------------------------------------------------------------

/**
 * A label that is unique per run and still readable in a project list — the
 * fixture is created through the real API, and a name nobody can recognise is a
 * name nobody can clean up by hand if a run is killed.
 *
 * @param {Date} date
 * @param {string} suffix
 * @returns {string}
 */
export function runLabel(date, suffix) {
  const stamp = date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d+Z$/, 'Z');

  return `${stamp}-${suffix}`;
}
