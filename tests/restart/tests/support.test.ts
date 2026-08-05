import { describe, expect, it, vi } from 'vitest';
import {
  DEVELOPMENT_PROJECT_NAME,
  TimeoutError,
  VALIDATION_PROJECT_NAME,
  assertCommandSucceeded,
  assertDevelopmentVolumesUntouched,
  assertDisposableVolumes,
  assertExactKeys,
  assertNoSensitiveContent,
  assertValidationProject,
  compareRecords,
  isIsoUtcTimestamp,
  parseJsonOutput,
  parseLines,
  redact,
  runLabel,
  waitFor,
} from '../lib/support.mjs';
import type { CommandResult, ProbeOutcome } from '../lib/support.mjs';

// The harness's own rules, tested where they are cheap to test and expensive to
// get wrong: what may be deleted, what may be printed, what counts as "the record
// survived", and how a bounded wait decides it has run out of time.
//
// **None of this substitutes for `pnpm test:restart`.** Nothing here mocks Docker
// or a database, because a suite that did could report that restart persistence
// works without a container ever having existed. These tests cover the reasoning
// the real run is built from; the real run is the proof.

const result = (over: Partial<CommandResult> = {}): CommandResult => ({
  commandLine: 'docker compose ps',
  exitCode: 0,
  signal: null,
  stdout: '',
  stderr: '',
  ...over,
});

/** A clock that moves on every reading, so a deadline can be reached deterministically. */
const advancingClock = (step: number): (() => number) => {
  let elapsed = 0;

  return () => {
    elapsed += step;

    return elapsed;
  };
};

describe('redaction', () => {
  it('replaces a PostgreSQL connection string wherever it appears', () => {
    const redacted = redact('connecting to postgresql://devsync:devsync@database:5432/devsync now');

    expect(redacted).toBe('connecting to postgresql://<redacted> now');
  });

  it('replaces the postgres:// spelling as well', () => {
    expect(redact('postgres://user:secret@host:5432/db')).toBe('postgres://<redacted>');
  });

  it('replaces an assignment of a variable that carries a connection string', () => {
    expect(redact('DATABASE_URL=postgresql://devsync:devsync@database:5432/devsync')).toBe(
      'DATABASE_URL=<redacted>',
    );
    expect(redact('TEST_DATABASE_URL: postgresql://a:b@c/d')).toBe('TEST_DATABASE_URL: <redacted>');
  });

  it('replaces a PostgreSQL password variable', () => {
    expect(redact('POSTGRES_PASSWORD=devsync')).toBe('POSTGRES_PASSWORD=<redacted>');
    expect(redact('PGPASSWORD=hunter2')).toBe('PGPASSWORD=<redacted>');
  });

  it('redacts every occurrence, not only the first', () => {
    const redacted = redact('a postgresql://one/x b postgresql://two/y');

    expect(redacted).toBe('a postgresql://<redacted> b postgresql://<redacted>');
  });

  it('leaves ordinary text alone', () => {
    expect(redact('the database is unavailable')).toBe('the database is unavailable');
  });

  it('answers a string for a value that is not one', () => {
    expect(redact(undefined)).toBe('');
    expect(redact(503)).toBe('503');
  });
});

describe('the Compose project guard', () => {
  it('accepts the validation project', () => {
    expect(assertValidationProject(VALIDATION_PROJECT_NAME)).toBe('devsync-c4-validation');
  });

  it('refuses the development project by name', () => {
    expect(() => assertValidationProject(DEVELOPMENT_PROJECT_NAME)).toThrow(
      /Refusing to run a Docker Compose command against the project "devsync"/,
    );
  });

  it('refuses anything else, including a name that merely starts the same way', () => {
    expect(() => assertValidationProject('devsync-c4-validation-2')).toThrow(/Refusing/);
    expect(() => assertValidationProject('')).toThrow(/Refusing/);
  });
});

describe('the disposable-volume guard', () => {
  it('accepts volumes this validation created', () => {
    const volumes = ['devsync-c4-validation_postgres_data'];

    expect(assertDisposableVolumes(volumes)).toBe(volumes);
  });

  it('accepts an empty list, which is what a clean machine has', () => {
    expect(assertDisposableVolumes([])).toEqual([]);
  });

  it('refuses the development volume', () => {
    expect(() => assertDisposableVolumes(['devsync_postgres_data'])).toThrow(
      /devsync_postgres_data/,
    );
  });

  it('refuses the whole batch when one volume is foreign', () => {
    expect(() =>
      assertDisposableVolumes(['devsync-c4-validation_postgres_data', 'something_else']),
    ).toThrow(/something_else/);
  });

  it('refuses a name that only contains the prefix rather than beginning with it', () => {
    expect(() => assertDisposableVolumes(['x-devsync-c4-validation_postgres_data'])).toThrow(
      /Refusing to delete/,
    );
  });
});

describe('proving the development stack was left alone', () => {
  it('accepts an unchanged list, in any order', () => {
    expect(() => {
      assertDevelopmentVolumesUntouched(['a', 'b'], ['b', 'a']);
    }).not.toThrow();
  });

  it('accepts two empty lists', () => {
    expect(() => {
      assertDevelopmentVolumesUntouched([], []);
    }).not.toThrow();
  });

  it('refuses a volume that disappeared', () => {
    expect(() => {
      assertDevelopmentVolumesUntouched(['devsync_postgres_data'], []);
    }).toThrow(/removed: devsync_postgres_data/);
  });

  it('refuses a volume that appeared', () => {
    expect(() => {
      assertDevelopmentVolumesUntouched([], ['devsync_postgres_data']);
    }).toThrow(/added: devsync_postgres_data/);
  });
});

describe('command results', () => {
  it('returns the result when the command exited 0', () => {
    const succeeded = result();

    expect(assertCommandSucceeded('Starting the API', succeeded)).toBe(succeeded);
  });

  it('throws with the description and the exit code when it did not', () => {
    expect(() =>
      assertCommandSucceeded('Starting the API', result({ exitCode: 1, stderr: 'boom' })),
    ).toThrow(/Starting the API failed[\s\S]*exit code: 1[\s\S]*boom/);
  });

  it('reports a signal when there was no exit code', () => {
    expect(() =>
      assertCommandSucceeded('Stopping', result({ exitCode: null, signal: 'SIGKILL' })),
    ).toThrow(/none \(signal SIGKILL\)/);
  });

  it('redacts a connection string in the output it reports', () => {
    expect(() =>
      assertCommandSucceeded(
        'Migrating',
        result({ exitCode: 1, stdout: 'DATABASE_URL=postgresql://devsync:devsync@db/devsync' }),
      ),
    ).toThrow(/DATABASE_URL=<redacted>/);
  });
});

describe('bounded waiting', () => {
  it('returns as soon as the condition holds, without sleeping', async () => {
    const sleep = vi.fn(() => Promise.resolve());

    const outcome = await waitFor('a condition', () => ({ ok: true, value: 42 }), {
      timeoutMs: 1000,
      intervalMs: 10,
      sleep,
    });

    expect(outcome.value).toBe(42);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('polls until the condition holds', async () => {
    let attempts = 0;
    const sleep = vi.fn(() => Promise.resolve());

    await waitFor(
      'the third attempt',
      () => {
        attempts += 1;

        return { ok: attempts === 3, detail: `attempt ${attempts}` };
      },
      { timeoutMs: 1000, intervalMs: 10, now: () => 0, sleep },
    );

    expect(attempts).toBe(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it('gives up at its deadline and says how often it looked and what it last saw', async () => {
    await expect(
      waitFor(
        'a container to report healthy',
        (): ProbeOutcome<never> => ({ ok: false, detail: 'status running, health starting' }),
        {
          timeoutMs: 50,
          intervalMs: 10,
          now: advancingClock(20),
          sleep: () => Promise.resolve(),
        },
      ),
    ).rejects.toThrow(
      /Timed out after 50 ms waiting for a container to report healthy\. Checked 3 times; last saw: status running, health starting/,
    );
  });

  it('gives up with a TimeoutError, so a caller can tell a deadline from a defect', async () => {
    await expect(
      waitFor('never', () => ({ ok: false }), {
        timeoutMs: 1,
        intervalMs: 1,
        now: advancingClock(1000),
        sleep: () => Promise.resolve(),
      }),
    ).rejects.toBeInstanceOf(TimeoutError);
  });

  it('always probes at least once, however small the timeout', async () => {
    const probe = vi.fn(() => ({ ok: false }));

    await expect(
      waitFor('never', probe, {
        timeoutMs: 1,
        intervalMs: 1,
        now: advancingClock(1000),
        sleep: () => Promise.resolve(),
      }),
    ).rejects.toThrow(TimeoutError);

    expect(probe).toHaveBeenCalledTimes(1);
  });

  it('redacts a connection string that reached a probe detail', async () => {
    await expect(
      waitFor('a database', () => ({ ok: false, detail: 'postgresql://devsync:devsync@db/x' }), {
        timeoutMs: 1,
        intervalMs: 1,
        now: advancingClock(1000),
        sleep: () => Promise.resolve(),
      }),
    ).rejects.toThrow(/postgresql:\/\/<redacted>/);
  });

  it('refuses an unbounded wait', async () => {
    await expect(
      waitFor('anything', () => ({ ok: true }), { timeoutMs: Number.POSITIVE_INFINITY }),
    ).rejects.toThrow(/needs a positive timeout/);

    await expect(waitFor('anything', () => ({ ok: true }), { timeoutMs: 0 })).rejects.toThrow(
      /needs a positive timeout/,
    );
  });

  it('refuses a non-positive interval', async () => {
    await expect(
      waitFor('anything', () => ({ ok: true }), { timeoutMs: 100, intervalMs: 0 }),
    ).rejects.toThrow(/needs a positive interval/);
  });
});

describe('UTC timestamps', () => {
  it('accepts a UTC instant, with or without fractional seconds', () => {
    expect(isIsoUtcTimestamp('2026-08-05T09:15:00Z')).toBe(true);
    expect(isIsoUtcTimestamp('2026-08-05T09:15:00.123Z')).toBe(true);
  });

  it('refuses a local time with an offset', () => {
    expect(isIsoUtcTimestamp('2026-08-05T09:15:00+02:00')).toBe(false);
  });

  it('refuses a date, a number of milliseconds, and a non-date that matches nothing', () => {
    expect(isIsoUtcTimestamp('2026-08-05')).toBe(false);
    expect(isIsoUtcTimestamp(1_775_000_000_000)).toBe(false);
    expect(isIsoUtcTimestamp('')).toBe(false);
  });

  it('refuses a well-shaped string that is not a real instant', () => {
    expect(isIsoUtcTimestamp('2026-13-45T99:99:99Z')).toBe(false);
  });
});

describe('exact resource shapes', () => {
  const keys = ['statusCode', 'code', 'message'];

  it('accepts exactly the properties named', () => {
    const body = { statusCode: 503, code: 'DATABASE_UNAVAILABLE', message: 'unavailable' };

    expect(assertExactKeys('the body', body, keys)).toBe(body);
  });

  it('refuses a body that grew a property', () => {
    expect(() =>
      assertExactKeys(
        'the body',
        { statusCode: 503, code: 'DATABASE_UNAVAILABLE', message: 'x', stack: 'at foo' },
        keys,
      ),
    ).toThrow(/unexpected stack/);
  });

  it('refuses a body that lost one', () => {
    expect(() => assertExactKeys('the body', { statusCode: 503, code: 'X' }, keys)).toThrow(
      /missing message/,
    );
  });

  it('refuses something that is not an object', () => {
    expect(() => assertExactKeys('the body', null, keys)).toThrow(/is not an object/);
    expect(() => assertExactKeys('the body', [], keys)).toThrow(/is not an object/);
  });
});

describe('comparing a record with its baseline', () => {
  const baseline = { id: 'a', name: 'main.ts', content: 'export const x = 1;\n' };

  it('reports nothing when every field is identical', () => {
    expect(compareRecords('file', baseline, { ...baseline })).toEqual([]);
  });

  it('reports every field that changed, not only the first', () => {
    const differences = compareRecords('file', baseline, {
      id: 'a',
      name: 'other.ts',
      content: '',
    });

    expect(differences).toHaveLength(2);
    expect(differences[0]).toMatch(/file\.content changed/);
    expect(differences[1]).toMatch(/file\.name changed: "main\.ts" -> "other\.ts"/);
  });

  it('reports a field that went missing', () => {
    expect(compareRecords('file', baseline, { id: 'a', name: 'main.ts' })).toEqual([
      expect.stringMatching(/file\.content changed/),
    ]);
  });

  it('treats a whitespace-only difference in content as a difference', () => {
    const differences = compareRecords('file', baseline, {
      ...baseline,
      content: 'export const x = 1;',
    });

    expect(differences).toHaveLength(1);
  });

  it('truncates a long value rather than printing a whole file', () => {
    const differences = compareRecords('file', { content: 'a'.repeat(500) }, { content: 'b' });

    expect(differences[0]?.length).toBeLessThan(300);
    expect(differences[0]).toContain('...');
  });
});

describe('the response leakage audit', () => {
  const body =
    '{"statusCode":503,"code":"DATABASE_UNAVAILABLE","message":"The database is unavailable. Try again shortly."}';

  it('accepts the response the contract describes', () => {
    expect(() => {
      assertNoSensitiveContent('the body', body);
    }).not.toThrow();
  });

  it('refuses a stack trace', () => {
    expect(() => {
      assertNoSensitiveContent('the body', '{"stack":"Error: x\\n    at query (/repo/a.js:1:2)"}');
    }).toThrow(/a stack frame/);
  });

  it('refuses the ORM name and a Prisma error code', () => {
    expect(() => {
      assertNoSensitiveContent('the body', '{"message":"PrismaClientKnownRequestError"}');
    }).toThrow(/the ORM name/);

    expect(() => {
      assertNoSensitiveContent('the body', '{"message":"failed","code":"P1001"}');
    }).toThrow(/a Prisma error code/);
  });

  it('refuses a connection string and the PostgreSQL name', () => {
    expect(() => {
      assertNoSensitiveContent('the body', '{"message":"postgresql://devsync:devsync@db/devsync"}');
    }).toThrow(/the PostgreSQL name or a connection string/);
  });

  it('refuses a driver socket error code', () => {
    expect(() => {
      assertNoSensitiveContent('the body', '{"message":"connect ECONNREFUSED 172.18.0.2:5432"}');
    }).toThrow(/a driver socket error code/);
  });

  it('refuses SQL and a table name', () => {
    expect(() => {
      assertNoSensitiveContent('the body', '{"message":"SELECT id FROM x"}');
    }).toThrow(/SQL/);

    expect(() => {
      assertNoSensitiveContent('the body', '{"message":"relation project_files is missing"}');
    }).toThrow(/a table name/);
  });

  it('refuses a credential', () => {
    expect(() => {
      assertNoSensitiveContent('the body', '{"message":"password authentication failed"}');
    }).toThrow(/a credential/);
  });

  it('names every leak it found, not only the first', () => {
    expect(() => {
      assertNoSensitiveContent('the body', 'PrismaClientInitializationError: SELECT 1 failed');
    }).toThrow(/the ORM name, SQL/);
  });
});

describe("reading Docker's output", () => {
  it('reads a JSON array', () => {
    expect(parseJsonOutput('[{"Name":"a"},{"Name":"b"}]')).toEqual([{ Name: 'a' }, { Name: 'b' }]);
  });

  it('reads one JSON object per line, which older Compose versions print', () => {
    expect(parseJsonOutput('{"Name":"a"}\n{"Name":"b"}\n')).toEqual([{ Name: 'a' }, { Name: 'b' }]);
  });

  it('reads a single object as a one-element list', () => {
    expect(parseJsonOutput('{"Name":"a"}')).toEqual([{ Name: 'a' }]);
  });

  it('reads nothing as an empty list', () => {
    expect(parseJsonOutput('   \n  ')).toEqual([]);
  });

  it('reads one value per line, dropping blank lines and carriage returns', () => {
    expect(parseLines('a\r\n\nb\n')).toEqual(['a', 'b']);
  });
});

describe('the run label', () => {
  it('is readable, sortable, and unique per run', () => {
    expect(runLabel(new Date('2026-08-05T09:15:30.123Z'), 'k3f9zq')).toBe(
      '20260805T091530Z-k3f9zq',
    );
  });
});
