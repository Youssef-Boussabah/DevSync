import type { PersistenceFailure } from './contracts';

/**
 * The decision half of failure handling, with nothing from the ORM in it.
 *
 * `errors.ts` recognises *which* driver exception arrived; this file decides
 * *what it means*. The split exists for the same reason `contracts.ts` is
 * separate from the code that uses the generated client: a decision that imports
 * no Prisma can be exercised without one, so the classification rules below run
 * in `pnpm test` — the command that generates nothing and starts nothing — rather
 * than only in the suite that needs a live PostgreSQL.
 *
 * Nothing here reads a message. A driver's wording is not a contract, and a
 * classifier that greps for words in one turns a log-line reword into a status
 * code change.
 */

/** Which record a "not found" means, for the operation that was being run. */
export type MissingEntity = 'project' | 'projectFile';

/** A failure and the public sentence that goes with it. */
export interface ClassifiedFailure {
  failure: PersistenceFailure;
  message: string;
}

// Prisma's own codes for a database that is not answering. These arrive when
// Prisma itself could not reach the server — most often because a fresh
// connection was refused after it went away.
const UNAVAILABLE_PRISMA_CODES = new Set([
  'P1000', // authentication failed
  'P1001', // cannot reach the database server
  'P1002', // the server was reached but timed out
  'P1008', // operation timed out
  'P1017', // the server closed the connection
]);

/**
 * PostgreSQL conditions that mean the server cannot serve the request, whoever
 * asked and however well-formed it was.
 *
 * **Class `08` — connection exception** is taken whole. Every code in it
 * (`08000`, `08001`, `08003`, `08004`, `08006`, `08007`, `08P01`) describes a
 * connection that could not be established or did not survive, which is the same
 * news to a caller: the request did not reach a working database.
 *
 * **Class `57` — operator intervention** is *not* taken whole, and that is the
 * point of naming three codes rather than a prefix. `57P01`, `57P02`, and
 * `57P03` are the server going away or refusing to start serving. The rest of
 * the class is not: `57014` is a cancelled query, `57P04` a dropped database,
 * `57P05` an idle session timing out. None of those means "come back shortly",
 * and answering `503` to them would be a lie a client would retry against.
 */
const UNAVAILABLE_SQL_STATES = new Set([
  '57P01', // admin_shutdown — terminated by an administrator command
  '57P02', // crash_shutdown
  '57P03', // cannot_connect_now — the server is starting up or shutting down
]);

const CONNECTION_EXCEPTION_CLASS = '08';

/**
 * The driver adapter's own names for a connection that was lost without the
 * server getting a chance to say why. `@prisma/adapter-pg` produces these from
 * socket-level failures: `ECONNRESET` becomes `ConnectionClosed` and `ETIMEDOUT`
 * becomes `SocketTimeout`.
 *
 * Its third socket kind, `DatabaseNotReachable` (`ECONNREFUSED`, `ENOTFOUND`),
 * is deliberately absent: Prisma already surfaces that one as `P1001`, which the
 * set above covers, so listing it here would add a branch nothing can reach.
 */
const UNAVAILABLE_ADAPTER_KINDS = new Set(['ConnectionClosed', 'SocketTimeout']);

/** Five characters, digits and capitals — what a SQLSTATE looks like. */
const SQL_STATE_SHAPE = /^[0-9A-Z]{5}$/;

/**
 * How far into a driver error's metadata the structured condition is looked for.
 *
 * Prisma 7 nests it two links down — `meta.driverAdapterError.cause` — and
 * earlier versions put the SQLSTATE directly on `meta`. Both are inside this
 * bound, which exists so that metadata this package did not produce cannot make
 * the walk run long.
 */
const MAX_METADATA_DEPTH = 3;

/**
 * What a known driver request failure means.
 *
 * The three request outcomes come first, because they are answers about the
 * request rather than about the database: a unique violation, a row that was not
 * there, a foreign key that did not resolve. Only after those does connectivity
 * come into it.
 */
export function classifyKnownRequestFailure(
  code: string,
  meta: unknown,
  missingEntity: MissingEntity,
): ClassifiedFailure {
  switch (code) {
    case 'P2002':
      return uniqueViolationFailure();

    case 'P2025':
      return notFoundFailure(missingEntity);

    // A foreign key that does not resolve can only be `project_id` here, so the
    // project is what is missing — not the file the caller asked for.
    case 'P2003':
      return notFoundFailure('project');

    default:
      break;
  }

  if (UNAVAILABLE_PRISMA_CODES.has(code)) {
    return unavailableFailure();
  }

  // Reached for `P2010` and anything else Prisma passes through with the
  // driver's own error attached. The code itself decides nothing here — a
  // `P2010` is a raw query failure, and a syntax error, a constraint, and a
  // server shutting down all arrive under it. What decides is whether the
  // metadata *names* a condition on the two lists above.
  if (namesUnavailableDatabase(meta, 0, new Set())) {
    return unavailableFailure();
  }

  return rejectedFailure();
}

export function notFoundFailure(entity: MissingEntity): ClassifiedFailure {
  return {
    failure: { kind: 'notFound', entity },
    message: entity === 'project' ? 'No such project.' : 'No such file.',
  };
}

export function unavailableFailure(): ClassifiedFailure {
  return { failure: { kind: 'unavailable' }, message: 'The database is unavailable.' };
}

/** A request the database understood and refused, for a reason of its own. */
export function rejectedFailure(): ClassifiedFailure {
  return { failure: { kind: 'unknown' }, message: 'The database rejected the request.' };
}

/** Anything else that came out of the data layer. */
export function requestFailedFailure(): ClassifiedFailure {
  return { failure: { kind: 'unknown' }, message: 'The database request failed.' };
}

function uniqueViolationFailure(): ClassifiedFailure {
  return {
    failure: { kind: 'uniqueViolation', constraint: 'projectFileName' },
    message: 'A file with that name already exists in this project.',
  };
}

/**
 * Whether driver metadata names a database that is unavailable.
 *
 * Bounded on both axes. `depth` stops the walk at metadata deeper than any
 * driver shape this package knows about, and `seen` stops metadata that
 * references itself — neither is hypothetical for an object graph built by
 * something other than this package. Two links are followed, because those are
 * the two Prisma uses: `driverAdapterError` from a query failure and `cause`
 * beneath it.
 */
function namesUnavailableDatabase(value: unknown, depth: number, seen: Set<object>): boolean {
  if (depth > MAX_METADATA_DEPTH || !isRecord(value) || seen.has(value)) {
    return false;
  }

  seen.add(value);

  if (namesConnectionLoss(value)) {
    return true;
  }

  return (
    namesUnavailableDatabase(value.driverAdapterError, depth + 1, seen) ||
    namesUnavailableDatabase(value.cause, depth + 1, seen)
  );
}

/**
 * One level of metadata, read for the two structured fields that classify it.
 *
 * `code` is trusted only when it looks like a SQLSTATE *and* names an
 * allowlisted condition, so a Prisma code that happens to sit in the same field
 * cannot be mistaken for one — and a SQLSTATE that means a syntax error, a
 * constraint, or a bad value is simply not on the list.
 */
function namesConnectionLoss(metadata: Record<string, unknown>): boolean {
  const kind = metadata.kind;

  if (typeof kind === 'string' && UNAVAILABLE_ADAPTER_KINDS.has(kind)) {
    return true;
  }

  const code = metadata.code;

  return typeof code === 'string' && isUnavailableSqlState(code);
}

function isUnavailableSqlState(code: string): boolean {
  if (!SQL_STATE_SHAPE.test(code)) {
    return false;
  }

  return code.startsWith(CONNECTION_EXCEPTION_CLASS) || UNAVAILABLE_SQL_STATES.has(code);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
