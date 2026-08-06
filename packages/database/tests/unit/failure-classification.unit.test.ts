import { describe, expect, it } from 'vitest';
import { classifyKnownRequestFailure } from '../../src/failure-classification';
import type { ClassifiedFailure } from '../../src/failure-classification';

/**
 * The classification rules, without a database.
 *
 * These run in `pnpm test` and `pnpm test:unit`, which is the whole reason
 * `src/failure-classification.ts` imports no Prisma: deciding what a driver
 * error means is pure, and a rule that only a live PostgreSQL can exercise is a
 * rule nothing checks quickly.
 *
 * **C4's container-level restart and outage validation is what caught the
 * defect** — a PostgreSQL outage reaching the API as `500 INTERNAL_ERROR` instead
 * of `503 DATABASE_UNAVAILABLE`, through the real HTTP routes against real
 * containers. Detection was never the gap. What was missing was **deterministic
 * coverage below it**: no suite held the classification rule where it could be
 * exercised without Docker and without a server, so the rule could only be
 * checked by taking a database away from a running stack. This file is that
 * coverage, and it needs neither.
 *
 * The shapes below are structural, and the ones in "the exceptions this stack
 * really produces" are transcriptions of exceptions captured from Prisma 7.9.1
 * and `@prisma/adapter-pg` 7.9.1 against PostgreSQL 18.3 in the production
 * container image, while the server was stopped under a live pool. They are
 * written out in full rather than built by a helper that guesses, because the
 * point of the suite is that this package agrees with what the driver actually
 * produces — including in the case it did not agree with, where the exception
 * carries no driver metadata whatsoever.
 */

// Detail that must never reach a caller. Every message assertion below is also
// checked against these, so a classifier that started passing the driver's
// wording through would fail rather than quietly widen what the API answers.
const LEAKED_SQL = 'select "public"."projects"."id" from "public"."projects"';
const LEAKED_TABLE = 'project_files';
const LEAKED_CONNECTION_STRING = 'postgresql://devsync:devsync@database:5432/devsync';
const LEAKED_MESSAGE = `db error: FATAL: terminating connection due to administrator command; ${LEAKED_SQL}; ${LEAKED_CONNECTION_STRING}`;

/** What `@prisma/adapter-pg` attaches when PostgreSQL itself reported the error. */
function postgresMetadata(code: string, severity: string): unknown {
  return {
    driverAdapterError: {
      name: 'DriverAdapterError',
      cause: {
        originalCode: code,
        originalMessage: LEAKED_MESSAGE,
        kind: 'postgres',
        code,
        severity,
      },
    },
  };
}

/** What it attaches when the socket failed and PostgreSQL never said anything. */
function socketMetadata(kind: string): unknown {
  return { driverAdapterError: { name: 'DriverAdapterError', cause: { kind } } };
}

function classify(code: string, meta: unknown): ClassifiedFailure {
  return classifyKnownRequestFailure(code, meta, 'projectFile');
}

/** Every sentence this package is allowed to produce for a known request error. */
const PUBLIC_MESSAGES = [
  'No such project.',
  'No such file.',
  'A file with that name already exists in this project.',
  'The database is unavailable.',
  'The database rejected the request.',
];

describe('classifying a known driver request failure', () => {
  describe('a database that is not answering', () => {
    it('keeps P1001 — the server could not be reached — unavailable', () => {
      expect(classify('P1001', undefined).failure).toEqual({ kind: 'unavailable' });
    });

    it('keeps P1017 — the server closed the connection — unavailable', () => {
      expect(classify('P1017', undefined).failure).toEqual({ kind: 'unavailable' });
    });

    it.each(['P1000', 'P1002', 'P1008'])('keeps %s unavailable', (code) => {
      expect(classify(code, undefined).failure).toEqual({ kind: 'unavailable' });
    });

    // The defect this file exists for. PostgreSQL shutting down under a live
    // connection answers 57P01, the adapter wraps it, and Prisma reports the
    // whole thing as a plain query failure — which used to mean 500.
    it('classifies the recorded 57P01 administrator shutdown as unavailable', () => {
      const classified = classify('P2010', postgresMetadata('57P01', 'FATAL'));

      expect(classified.failure).toEqual({ kind: 'unavailable' });
      expect(classified.message).toBe('The database is unavailable.');
    });

    it.each([
      ['57P02', 'crash shutdown'],
      ['57P03', 'cannot connect now'],
    ])('classifies %s (%s) as unavailable', (code) => {
      expect(classify('P2010', postgresMetadata(code, 'FATAL')).failure).toEqual({
        kind: 'unavailable',
      });
    });

    it.each(['08000', '08001', '08003', '08004', '08006', '08007', '08P01'])(
      'classifies connection exception %s as unavailable',
      (code) => {
        expect(classify('P2010', postgresMetadata(code, 'FATAL')).failure).toEqual({
          kind: 'unavailable',
        });
      },
    );

    // The driver's own names for a connection lost with nothing said about it.
    it.each(['ConnectionClosed', 'SocketTimeout'])(
      'classifies the adapter kind %s as unavailable',
      (kind) => {
        expect(classify('P2010', socketMetadata(kind)).failure).toEqual({ kind: 'unavailable' });
      },
    );

    // Prisma nests the condition two links down today and put the SQLSTATE
    // directly on `meta` before that. Both are inside the bounded walk.
    it('finds the condition when the SQLSTATE sits directly on the metadata', () => {
      expect(classify('P2010', { code: '57P01', message: LEAKED_MESSAGE }).failure).toEqual({
        kind: 'unavailable',
      });
    });
  });

  describe('a database that answered, and refused', () => {
    // The whole reason P2010 is not simply added to the unavailable list.
    it.each([
      ['42601', 'syntax error'],
      ['42703', 'undefined column'],
      ['22012', 'division by zero'],
      ['23514', 'check constraint violated'],
      ['40001', 'serialisation failure'],
      ['53300', 'too many connections'],
    ])('leaves P2010 carrying %s (%s) unknown', (code) => {
      expect(classify('P2010', postgresMetadata(code, 'ERROR')).failure).toEqual({
        kind: 'unknown',
      });
    });

    // Class 57 is operator intervention, and only three of its codes mean the
    // server is unavailable. Taking the class by prefix would catch these too.
    it.each([
      ['57014', 'query cancelled'],
      ['57P04', 'database dropped'],
      ['57P05', 'idle session timeout'],
    ])('leaves %s (%s) unknown', (code) => {
      expect(classify('P2010', postgresMetadata(code, 'ERROR')).failure).toEqual({
        kind: 'unknown',
      });
    });

    it('leaves an adapter kind that is not connection loss unknown', () => {
      const meta = {
        driverAdapterError: {
          name: 'DriverAdapterError',
          cause: { kind: 'TableDoesNotExist', table: LEAKED_TABLE },
        },
      };

      expect(classify('P2010', meta).failure).toEqual({ kind: 'unknown' });
    });

    // A message is not a classification. If it were, a driver rewording its log
    // line would move a status code.
    it('does not treat a SQLSTATE mentioned in a message as a structured code', () => {
      const meta = {
        driverAdapterError: {
          name: 'DriverAdapterError',
          cause: {
            kind: 'postgres',
            code: '42601',
            severity: 'ERROR',
            originalMessage: 'db error: 57P01 terminating connection due to administrator command',
          },
        },
      };

      expect(classify('P2010', meta).failure).toEqual({ kind: 'unknown' });
    });

    it('does not treat a bare message mentioning 57P01 as unavailable', () => {
      expect(classify('P2010', { message: LEAKED_MESSAGE }).failure).toEqual({ kind: 'unknown' });
    });

    it('does not read the Prisma code itself as a SQLSTATE', () => {
      // `P2010` has a SQLSTATE's shape. It must be read as a Prisma code and
      // nothing else, or every raw query failure would classify on its own name.
      expect(classify('P2010', undefined).failure).toEqual({ kind: 'unknown' });
    });
  });

  describe('request outcomes, which connectivity must not disturb', () => {
    it('keeps P2002 a unique violation', () => {
      const classified = classify('P2002', { target: ['project_id', 'name'] });

      expect(classified.failure).toEqual({
        kind: 'uniqueViolation',
        constraint: 'projectFileName',
      });
      expect(classified.message).toBe('A file with that name already exists in this project.');
    });

    it('keeps P2025 a not-found for the record the operation was about', () => {
      expect(classifyKnownRequestFailure('P2025', undefined, 'projectFile').failure).toEqual({
        kind: 'notFound',
        entity: 'projectFile',
      });
      expect(classifyKnownRequestFailure('P2025', undefined, 'project').failure).toEqual({
        kind: 'notFound',
        entity: 'project',
      });
    });

    it('keeps P2003 a missing project, whatever the operation was about', () => {
      expect(
        classifyKnownRequestFailure('P2003', { field_name: 'project_id' }, 'projectFile'),
      ).toEqual({
        failure: { kind: 'notFound', entity: 'project' },
        message: 'No such project.',
        reason: 'request-outcome',
      });
    });

    // A unique violation raised while the connection was also in trouble is
    // still a unique violation: the request outcome is the answer.
    it('does not let connectivity metadata turn a unique violation into an outage', () => {
      expect(classify('P2002', postgresMetadata('57P01', 'FATAL')).failure).toEqual({
        kind: 'uniqueViolation',
        constraint: 'projectFileName',
      });
    });
  });

  describe('metadata this package did not build', () => {
    it.each([
      ['undefined', undefined],
      ['null', null],
      ['a string', 'something went wrong'],
      ['a number', 42],
      ['an array', [{ kind: 'ConnectionClosed' }]],
      ['an empty object', {}],
    ])('leaves an unrecognised failure carrying %s unknown', (_label, meta) => {
      expect(classify('P2010', meta).failure).toEqual({ kind: 'unknown' });
      expect(classify('P9999', meta).failure).toEqual({ kind: 'unknown' });
    });

    it('terminates on metadata that references itself', () => {
      const cycle: Record<string, unknown> = { kind: 'TableDoesNotExist' };
      cycle.cause = cycle;
      cycle.driverAdapterError = cycle;

      expect(classify('P2010', { driverAdapterError: cycle }).failure).toEqual({ kind: 'unknown' });
    });

    // One link deeper than it used to be, because the walk now starts at the
    // exception rather than at its metadata: `error` -> `meta` ->
    // `driverAdapterError` -> `cause` is three links, and the bound leaves one
    // spare. The property is unchanged — below the bound, nothing is read.
    it('stops looking below the depth any known driver shape uses', () => {
      const deep = {
        cause: { cause: { cause: { cause: { cause: { kind: 'ConnectionClosed' } } } } },
      };

      expect(classify('P2010', deep).failure).toEqual({ kind: 'unknown' });
    });
  });

  // --- The exceptions this stack really produces -----------------------------
  //
  // Everything above hands the classifier a metadata object, which is what it
  // used to receive. It now receives the whole exception, and these are the three
  // exceptions captured from the production image with PostgreSQL stopped under a
  // live pool. The third is the one that reached CI as a 500.

  /**
   * A `PrismaClientKnownRequestError` as Prisma 7.9.1 builds it, with only the
   * properties the classifier can see: `code` and `meta` are own and enumerable,
   * `message` and `stack` are not read at all.
   */
  function prismaException(code: string, meta?: unknown): unknown {
    return { name: 'PrismaClientKnownRequestError', code, clientVersion: '7.9.1', meta };
  }

  /** PostgreSQL answered, and the adapter wrapped what it said. */
  function driverMeta(kind: string, extra: Record<string, unknown> = {}): unknown {
    return {
      modelName: 'Project',
      driverAdapterError: {
        name: 'DriverAdapterError',
        cause: { kind, ...extra },
      },
    };
  }

  describe('the exceptions this stack really produces', () => {
    // Captured: PostgreSQL stopped gracefully, a connection acquired while it was
    // shutting down. Prisma has no code for the adapter kind `postgres`, so it
    // reports P2039 and the SQLSTATE is only in the metadata.
    it('classifies the recorded P2039 shutdown exception as unavailable', () => {
      const exception = prismaException(
        'P2039',
        driverMeta('postgres', {
          originalCode: '57P03',
          originalMessage: LEAKED_MESSAGE,
          code: '57P03',
          severity: 'FATAL',
        }),
      );

      const classified = classifyKnownRequestFailure('P2039', exception, 'project');

      expect(classified.failure).toEqual({ kind: 'unavailable' });
      expect(classified.reason).toBe('sqlstate');
    });

    // Captured: the server was gone, so the pool could not open a connection.
    // Prisma does have a code for this kind, and it was already classified.
    it('classifies the recorded P1001 unreachable exception as unavailable', () => {
      const exception = prismaException(
        'P1001',
        driverMeta('DatabaseNotReachable', { host: 'database', port: 5432 }),
      );

      const classified = classifyKnownRequestFailure('P1001', exception, 'project');

      expect(classified.failure).toEqual({ kind: 'unavailable' });
      expect(classified.reason).toBe('prisma-code');
    });

    /**
     * **The defect.** `@prisma/adapter-pg` converts exactly four socket codes and
     * rethrows every other system error untouched; Prisma turns any error with a
     * string `code` into a known request error carrying that code. So a database
     * whose address could not be resolved arrives with no adapter kind, no
     * SQLSTATE, and no `driverAdapterError` at all — the entire signal is the
     * exception's own `code`, and searching `meta` for it finds nothing.
     */
    it('classifies the recorded EAI_AGAIN exception, which carries no driver metadata', () => {
      const exception = prismaException('EAI_AGAIN', { modelName: 'Project' });

      const classified = classifyKnownRequestFailure('EAI_AGAIN', exception, 'project');

      expect(classified.failure).toEqual({ kind: 'unavailable' });
      expect(classified.reason).toBe('network-errno');
      expect(classified.message).toBe('The database is unavailable.');
    });

    it.each([
      'EAI_FAIL',
      'EAI_NODATA',
      'ENOTFOUND',
      'ECONNREFUSED',
      'EHOSTDOWN',
      'EHOSTUNREACH',
      'ENETDOWN',
      'ENETUNREACH',
      'ETIMEDOUT',
      'ECONNABORTED',
      'ECONNRESET',
      'ENETRESET',
      'EPIPE',
    ])('classifies the transport failure %s as unavailable', (code) => {
      const classified = classifyKnownRequestFailure(
        code,
        prismaException(code, { modelName: 'Project' }),
        'project',
      );

      expect(classified.failure).toEqual({ kind: 'unavailable' });
      expect(classified.reason).toBe('network-errno');
    });

    // The set is transport failures, not every system error. A file that is not
    // there and a permission that was refused say nothing about the database
    // being away, and neither may become a 503 a client retries against.
    it.each(['ENOENT', 'EACCES', 'EMFILE', 'ENOMEM', 'ERR_INVALID_ARG_TYPE'])(
      'leaves the unrelated system error %s unknown',
      (code) => {
        const classified = classifyKnownRequestFailure(
          code,
          prismaException(code, { modelName: 'Project' }),
          'project',
        );

        expect(classified.failure).toEqual({ kind: 'unknown' });
        expect(classified.reason).toBe('unclassified');
      },
    );

    it('finds the adapter kind DatabaseNotReachable even when Prisma reported P2010', () => {
      const classified = classifyKnownRequestFailure(
        'P2010',
        prismaException('P2010', driverMeta('DatabaseNotReachable', { host: 'database' })),
        'project',
      );

      expect(classified.failure).toEqual({ kind: 'unavailable' });
      expect(classified.reason).toBe('adapter-kind');
    });

    // `originalCode` is the adapter's own copy of the SQLSTATE, and it is a real
    // field of every PostgreSQL error it converts.
    it('reads a SQLSTATE published only as originalCode', () => {
      const classified = classifyKnownRequestFailure(
        'P2010',
        prismaException(
          'P2010',
          driverMeta('postgres', { originalCode: '57P01', originalMessage: LEAKED_MESSAGE }),
        ),
        'project',
      );

      expect(classified.failure).toEqual({ kind: 'unavailable' });
      expect(classified.reason).toBe('sqlstate');
    });

    // `sqlState` is not a field any installed package puts on an error: `pg`
    // renames libpq's to `code`, and `pg-native` is not installed. Reading it
    // would be reading a key nothing writes, so the allowlist stays closed.
    it.each(['sqlState', 'sqlstate'])('does not read a condition out of %s', (key) => {
      const classified = classifyKnownRequestFailure(
        'P2010',
        prismaException('P2010', { modelName: 'Project', [key]: '57P01' }),
        'project',
      );

      expect(classified.failure).toEqual({ kind: 'unknown' });
    });

    it('finds structured connectivity data hanging off the exception cause', () => {
      const exception = {
        name: 'PrismaClientKnownRequestError',
        code: 'P2010',
        meta: { modelName: 'Project' },
      };

      // Non-enumerable, exactly as `new Error(message, { cause })` leaves it. A
      // walk over enumerable properties alone would never see this, which is why
      // `cause` is the one property read by name.
      Object.defineProperty(exception, 'cause', {
        value: { kind: 'ConnectionClosed' },
        enumerable: false,
      });

      const classified = classifyKnownRequestFailure('P2010', exception, 'project');

      expect(classified.failure).toEqual({ kind: 'unavailable' });
      expect(classified.reason).toBe('adapter-kind');
    });

    it('still lets a request outcome win over connectivity anywhere in the exception', () => {
      const exception = prismaException(
        'P2002',
        driverMeta('postgres', { code: '57P01', originalCode: '57P01' }),
      );

      expect(classifyKnownRequestFailure('P2002', exception, 'projectFile').failure).toEqual({
        kind: 'uniqueViolation',
        constraint: 'projectFileName',
      });
    });
  });

  describe('the bounds on reading an exception', () => {
    /** `links` objects deep, with the connectivity marker at the bottom. */
    function nested(links: number): unknown {
      let node: Record<string, unknown> = { kind: 'ConnectionClosed' };

      for (let remaining = links; remaining > 0; remaining -= 1) {
        node = { meta: node };
      }

      return node;
    }

    // The real exception needs three links. Four are read, and the fifth is not:
    // a bound rather than a target, and one that cannot be moved by accident.
    it('reads a condition four links from the exception', () => {
      expect(classify('P2010', nested(4)).failure).toEqual({ kind: 'unavailable' });
    });

    it('does not read one five links from the exception', () => {
      expect(classify('P2010', nested(5)).failure).toEqual({ kind: 'unknown' });
    });

    it('stops after its node budget rather than walking a wide graph', () => {
      const wide: Record<string, unknown> = {};

      for (let index = 0; index < 40; index += 1) {
        wide[`branch${index}`] = {};
      }

      // Last, so every one of the 40 shallow siblings is queued before it.
      wide.last = { kind: 'ConnectionClosed' };

      expect(classify('P2010', wide).failure).toEqual({ kind: 'unknown' });
    });

    it('terminates on an exception that references itself', () => {
      const exception: Record<string, unknown> = { code: 'P2010', meta: {} };

      exception.self = exception;
      exception.meta = { driverAdapterError: exception };

      expect(classify('P2010', exception).failure).toEqual({ kind: 'unknown' });
    });

    it('reads no inherited property', () => {
      const prototype = { kind: 'ConnectionClosed' };
      const exception = Object.create(prototype) as Record<string, unknown>;

      exception.code = 'P2010';

      expect(classify('P2010', exception).failure).toEqual({ kind: 'unknown' });
    });
  });

  describe('what a caller is told', () => {
    it.each([
      ['P2002', { target: ['name'] }],
      ['P2025', undefined],
      ['P2003', { field_name: 'project_id' }],
      ['P1001', undefined],
      ['P2010', postgresMetadata('57P01', 'FATAL')],
      ['P2010', postgresMetadata('42601', 'ERROR')],
      ['P2010', socketMetadata('ConnectionClosed')],
      ['P9999', { driverAdapterError: { cause: { originalMessage: LEAKED_MESSAGE } } }],
    ])('answers %s with a fixed public sentence and none of the original detail', (code, meta) => {
      const { message } = classify(code, meta);

      expect(PUBLIC_MESSAGES).toContain(message);
      expect(message).not.toContain(LEAKED_SQL);
      expect(message).not.toContain(LEAKED_TABLE);
      expect(message).not.toContain(LEAKED_CONNECTION_STRING);
      expect(message).not.toMatch(/57P01|42601|P2010|postgres|FATAL/i);
    });
  });
});
