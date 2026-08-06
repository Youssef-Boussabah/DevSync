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

/**
 * Which rule decided a failure — a short internal token, never a value read out
 * of the exception.
 *
 * It exists because the one defect this file has ever had was invisible: a
 * database outage answered `500` and the log said only that the database had
 * rejected the request, which is what every unclassified failure says. Recording
 * the branch turns "the classifier did not recognise this" into a log line that
 * says so. It is carried on `PersistenceError` and written to the server's log;
 * it is never serialised into a response.
 */
export type ClassificationReason =
  | 'request-outcome'
  | 'prisma-code'
  | 'sqlstate'
  | 'adapter-kind'
  | 'network-errno'
  | 'connection-open'
  | 'unclassified';

/** A failure, the public sentence that goes with it, and which rule decided it. */
export interface ClassifiedFailure {
  failure: PersistenceFailure;
  message: string;
  reason: ClassificationReason;
}

// Prisma's own codes for a database that is not answering. These arrive when the
// driver adapter recognised the failure itself, and Prisma had a code for the
// name it gave it.
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
 * The driver adapter's own names for a connection that could not be made or did
 * not survive.
 *
 * All three of `@prisma/adapter-pg`'s socket kinds are here. `DatabaseNotReachable`
 * used to be left out on the reasoning that Prisma always reports it as `P1001`,
 * which the set above covers — true for the shapes that had been looked at, and
 * exactly the kind of "nothing can reach this branch" assumption that produced
 * the defect this file was rewritten for. The kind is a structured fact about the
 * connection either way, so it is read where it appears rather than only where it
 * has been seen to appear.
 *
 * `TlsConnectionError` is deliberately **not** here. A certificate that does not
 * verify is a configuration fault that will fail again in exactly the same way,
 * not a server that is briefly away, and `503 … try again shortly` would be the
 * wrong thing to tell a client about one.
 */
const UNAVAILABLE_ADAPTER_KINDS = new Set([
  'DatabaseNotReachable', // ENOTFOUND / ECONNREFUSED
  'ConnectionClosed', // ECONNRESET
  'SocketTimeout', // ETIMEDOUT
]);

/**
 * Transport and name-resolution failures, by their operating-system code.
 *
 * These are here because of a real failure in CI that nothing else could catch.
 * `@prisma/adapter-pg` converts exactly four socket codes into the adapter kinds
 * above — `ENOTFOUND`, `ECONNREFUSED`, `ECONNRESET`, `ETIMEDOUT` — and rethrows
 * every other system error untouched. Prisma then sees an error carrying a string
 * `code`, and turns *any* such error into a `PrismaClientKnownRequestError` whose
 * code is that operating-system code and whose metadata holds nothing but the
 * model name. So a database that could not be reached arrives with no adapter
 * kind, no SQLSTATE, and no driver metadata at all — only `code: 'EAI_AGAIN'` —
 * and every earlier version of this file called that an unknown failure and
 * answered `500`.
 *
 * Every code below names a connection to the database that could not be made or
 * did not survive, and none of them can be produced by a database that answered.
 * They cannot collide with the sets above either: a Prisma code is `P` and
 * digits, and a SQLSTATE is matched by exact membership rather than by shape.
 */
const UNAVAILABLE_NETWORK_CODES = new Set([
  // The address of the server could not be resolved.
  'EAI_AGAIN', // temporary name-resolution failure — the CI shape
  'EAI_FAIL',
  'EAI_NODATA',
  'ENOTFOUND',
  // A connection could not be made.
  'ECONNREFUSED',
  'EHOSTDOWN',
  'EHOSTUNREACH',
  'ENETDOWN',
  'ENETUNREACH',
  'ETIMEDOUT',
  // A connection was made and then lost.
  'ECONNABORTED',
  'ECONNRESET',
  'ENETRESET',
  'EPIPE',
]);

/**
 * The property names a structured condition code is published under by the
 * versions installed here.
 *
 * `code` is what `@prisma/adapter-pg` puts the SQLSTATE in for a PostgreSQL error
 * and what Node puts a system error's code in; `originalCode` is the adapter's
 * copy of the SQLSTATE as PostgreSQL sent it. Nothing else is read. In
 * particular `sqlState` is **not** on this list: the only `sqlState` in the
 * installed dependency tree is a libpq field name in `pg`'s native bindings, and
 * `pg` renames it to `code` before it reaches an error object — `pg-native` is
 * not installed at all. Adding it would be a key nothing writes.
 */
const STRUCTURED_CODE_KEYS = ['code', 'originalCode'] as const;

/** Five characters, digits and capitals — what a SQLSTATE looks like. */
const SQL_STATE_SHAPE = /^[0-9A-Z]{5}$/;

/**
 * How far from the exception the structured condition is looked for.
 *
 * The shape recorded from Prisma 7.9.1 needs three links —
 * `error` → `meta` → `meta.driverAdapterError` → `.cause` — so this leaves one
 * spare. It is a bound rather than a target: the graph below an exception is
 * built by something other than this package, and a walk over it must be unable
 * to run long whatever arrives.
 */
const MAX_EVIDENCE_DEPTH = 4;

/** How many objects the walk may look at, whatever shape they are in. */
const MAX_EVIDENCE_NODES = 32;

/**
 * What a known driver request failure means.
 *
 * `evidence` is the **complete exception**, not one property of it. That is the
 * correction at the centre of this file: the condition is sometimes in
 * `error.meta`, sometimes below `error.cause`, and — for every system error the
 * adapter does not convert — on the error's own `code` with no metadata anywhere.
 * A classifier handed one branch of that graph can only see the failures that
 * happen to use it.
 *
 * The three request outcomes come first, because they are answers about the
 * request rather than about the database: a unique violation, a row that was not
 * there, a foreign key that did not resolve. Only after those does connectivity
 * come into it.
 */
export function classifyKnownRequestFailure(
  code: string,
  evidence: unknown,
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
    return unavailableFailure('prisma-code');
  }

  // Reached for `P2010`, `P2039`, and every code Prisma passes through from
  // something it had no code of its own for. The code itself decides nothing
  // here — a syntax error, a constraint, and a server shutting down all arrive
  // under `P2010` — so what decides is whether the exception *names* a condition
  // on one of the lists above, in a field whose meaning is structured.
  const reason = findUnavailableCondition(evidence);

  return reason === undefined ? rejectedFailure() : unavailableFailure(reason);
}

export function notFoundFailure(entity: MissingEntity): ClassifiedFailure {
  return {
    failure: { kind: 'notFound', entity },
    message: entity === 'project' ? 'No such project.' : 'No such file.',
    reason: 'request-outcome',
  };
}

export function unavailableFailure(reason: ClassificationReason): ClassifiedFailure {
  return {
    failure: { kind: 'unavailable' },
    message: 'The database is unavailable.',
    reason,
  };
}

/** A request the database understood and refused, for a reason of its own. */
export function rejectedFailure(): ClassifiedFailure {
  return {
    failure: { kind: 'unknown' },
    message: 'The database rejected the request.',
    reason: 'unclassified',
  };
}

/** Anything else that came out of the data layer. */
export function requestFailedFailure(): ClassifiedFailure {
  return {
    failure: { kind: 'unknown' },
    message: 'The database request failed.',
    reason: 'unclassified',
  };
}

function uniqueViolationFailure(): ClassifiedFailure {
  return {
    failure: { kind: 'uniqueViolation', constraint: 'projectFileName' },
    message: 'A file with that name already exists in this project.',
    reason: 'request-outcome',
  };
}

/**
 * Looks through an exception for a structured condition that means the database
 * is unavailable, and reports which kind of condition it was.
 *
 * Breadth-first, so the node budget is spent near the exception — where every
 * shape this stack produces puts its condition — rather than down one long
 * branch of something else. Bounded on three axes: depth, the number of objects
 * looked at, and identity, so metadata that references itself terminates.
 *
 * Only **own enumerable** properties are followed, with one deliberate
 * exception: `cause` is read by name because `new Error(message, { cause })`
 * makes it non-enumerable, and it is the link the driver adapter nests its
 * condition under. No prototype is walked, nothing is called, and the only
 * values read are those under `kind`, `code`, and `originalCode` — each decided
 * by exact membership of one of the four allowlists above.
 */
function findUnavailableCondition(evidence: unknown): ClassificationReason | undefined {
  const seen = new Set<object>();
  const queue: { value: Record<string, unknown>; depth: number }[] = [];
  let inspected = 0;

  if (isRecord(evidence)) {
    queue.push({ value: evidence, depth: 0 });
  }

  while (queue.length > 0) {
    const next = queue.shift();

    if (next === undefined) {
      break;
    }

    const { value, depth } = next;

    if (seen.has(value)) {
      continue;
    }

    seen.add(value);
    inspected += 1;

    if (inspected > MAX_EVIDENCE_NODES) {
      return undefined;
    }

    const reason = namesUnavailableDatabase(value);

    if (reason !== undefined) {
      return reason;
    }

    if (depth >= MAX_EVIDENCE_DEPTH) {
      continue;
    }

    for (const child of structuredChildren(value)) {
      queue.push({ value: child, depth: depth + 1 });
    }
  }

  return undefined;
}

/**
 * One object, read for the structured fields that classify it.
 *
 * A code is trusted only when it is an exact member of one of the allowlists —
 * never because of its shape, and never because of where it was found. That is
 * what stops the Prisma code `P2010`, which has a SQLSTATE's shape, from being
 * read as one, and what leaves a SQLSTATE meaning a syntax error, a constraint,
 * or a cancelled query exactly as unknown as it should be.
 */
function namesUnavailableDatabase(node: Record<string, unknown>): ClassificationReason | undefined {
  const kind = ownValue(node, 'kind');

  if (typeof kind === 'string' && UNAVAILABLE_ADAPTER_KINDS.has(kind)) {
    return 'adapter-kind';
  }

  for (const key of STRUCTURED_CODE_KEYS) {
    const code = ownValue(node, key);

    if (typeof code !== 'string') {
      continue;
    }

    if (isUnavailableSqlState(code)) {
      return 'sqlstate';
    }

    if (UNAVAILABLE_NETWORK_CODES.has(code)) {
      return 'network-errno';
    }
  }

  return undefined;
}

function structuredChildren(node: Record<string, unknown>): Record<string, unknown>[] {
  const children: Record<string, unknown>[] = [];
  const cause = ownValue(node, 'cause');

  if (isRecord(cause)) {
    children.push(cause);
  }

  for (const key of Object.keys(node)) {
    if (key === 'cause') {
      continue;
    }

    const child = node[key];

    if (isRecord(child)) {
      children.push(child);
    }
  }

  return children;
}

/**
 * A property of the object itself, never one it inherited.
 *
 * Everything the installed driver publishes — `code` and `meta` on the
 * exception, `cause` on the adapter error, `kind` and the SQLSTATE below it — is
 * an own property. Reading through a prototype chain would let an object this
 * package did not build answer for one it did.
 */
function ownValue(node: Record<string, unknown>, key: string): unknown {
  return Object.hasOwn(node, key) ? node[key] : undefined;
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
