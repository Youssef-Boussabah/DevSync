import { describe, expect, it } from 'vitest';
import { classifyKnownRequestFailure } from '../../src/failure-classification';
import type { ClassifiedFailure } from '../../src/failure-classification';

/**
 * The classification rules, without a database.
 *
 * These run in `pnpm test` and `pnpm test:unit`, which is the whole reason
 * `src/failure-classification.ts` imports no Prisma: deciding what a driver
 * error means is pure, and a rule that only a live PostgreSQL can exercise is a
 * rule that goes unchecked until something breaks in Docker. It is exactly what
 * did break — an administrator shutdown reached the API as `500 INTERNAL_ERROR`
 * instead of `503 DATABASE_UNAVAILABLE`, and no suite in the repository was in a
 * position to notice.
 *
 * The metadata shapes below are the real ones, recorded from Prisma 7.9.1 and
 * `@prisma/adapter-pg` 7.9.1 against PostgreSQL 18 while the server was stopped
 * under a live connection. They are written out in full rather than built by a
 * helper that guesses, because the point of the suite is that this package
 * agrees with what the driver actually produces.
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
      ).toEqual({ failure: { kind: 'notFound', entity: 'project' }, message: 'No such project.' });
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

    it('stops looking below the depth any known driver shape uses', () => {
      const deep = { cause: { cause: { cause: { cause: { kind: 'ConnectionClosed' } } } } };

      expect(classify('P2010', deep).failure).toEqual({ kind: 'unknown' });
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
