import { describe, expect, it } from 'vitest';
import { resolveTestDatabaseUrl } from '../tools/test-database.mjs';

// The gate that decides whether the database tooling may drop a schema. These
// tests call it with synthetic environments rather than the real one, so they
// prove the rules themselves rather than the machine they happen to run on.
//
// They live in this suite because the gate is database tooling; nothing in them
// connects to anything.

const TEST_URL = 'postgresql://devsync:devsync@127.0.0.1:5433/devsync_test';

/** The message the gate refused with, or a failure saying it did not refuse. */
function refusal(env: NodeJS.ProcessEnv): string {
  try {
    resolveTestDatabaseUrl(env);
  } catch (error) {
    if (error instanceof Error) {
      return error.message;
    }

    throw error;
  }

  throw new Error('Expected the safety gate to refuse, but it accepted the database.');
}

describe('the disposable test database must be named devsync_test', () => {
  it('refuses when TEST_DATABASE_URL is not set', () => {
    expect(refusal({})).toMatch(/TEST_DATABASE_URL is not set/);
  });

  it('refuses a URL it cannot parse', () => {
    expect(refusal({ TEST_DATABASE_URL: 'not a url' })).toMatch(/not a valid connection URL/);
  });

  it('refuses a database that is not PostgreSQL', () => {
    expect(refusal({ TEST_DATABASE_URL: 'mysql://h:3306/devsync_test' })).toMatch(
      /not a PostgreSQL URL/,
    );
  });

  it('refuses any database name but devsync_test', () => {
    expect(
      refusal({ TEST_DATABASE_URL: 'postgresql://devsync:devsync@127.0.0.1:5433/devsync' }),
    ).toMatch(/only "devsync_test" is accepted/);
  });

  it('accepts the disposable database when nothing else is configured', () => {
    expect(resolveTestDatabaseUrl({ TEST_DATABASE_URL: TEST_URL })).toBe(TEST_URL);
  });
});

describe('it refuses anything that resolves to the development database', () => {
  it('refuses the identical URL', () => {
    expect(refusal({ TEST_DATABASE_URL: TEST_URL, DATABASE_URL: TEST_URL })).toMatch(
      /address the same database/,
    );
  });

  it('refuses the same target reached with different credentials', () => {
    expect(
      refusal({
        TEST_DATABASE_URL: TEST_URL,
        DATABASE_URL: 'postgresql://someone:else@127.0.0.1:5433/devsync_test',
      }),
    ).toMatch(/address the same database/);
  });

  it('treats postgres: and postgresql: as the same scheme', () => {
    expect(
      refusal({
        TEST_DATABASE_URL: 'postgres://devsync:devsync@127.0.0.1:5433/devsync_test',
        DATABASE_URL: 'postgresql://devsync:devsync@127.0.0.1:5433/devsync_test',
      }),
    ).toMatch(/address the same database/);
  });

  it('treats an omitted port as 5432', () => {
    expect(
      refusal({
        TEST_DATABASE_URL: 'postgresql://devsync:devsync@127.0.0.1/devsync_test',
        DATABASE_URL: 'postgresql://devsync:devsync@127.0.0.1:5432/devsync_test',
      }),
    ).toMatch(/address the same database/);
  });

  it('treats localhost and 127.0.0.1 as the same machine', () => {
    expect(
      refusal({
        TEST_DATABASE_URL: 'postgresql://devsync:devsync@localhost:5433/devsync_test',
        DATABASE_URL: 'postgresql://devsync:devsync@127.0.0.1:5433/devsync_test',
      }),
    ).toMatch(/address the same database/);
  });

  it('treats localhost and ::1 as the same machine', () => {
    expect(
      refusal({
        TEST_DATABASE_URL: 'postgresql://devsync:devsync@localhost:5433/devsync_test',
        DATABASE_URL: 'postgresql://devsync:devsync@[::1]:5433/devsync_test',
      }),
    ).toMatch(/address the same database/);
  });

  it('refuses when DATABASE_URL is set but malformed, rather than assuming it differs', () => {
    expect(refusal({ TEST_DATABASE_URL: TEST_URL, DATABASE_URL: 'postgres://:@:::' })).toMatch(
      /DATABASE_URL is set but is not a valid connection URL/,
    );
  });
});

describe('it accepts a genuinely different database', () => {
  it('accepts when the development database is a different name on the same server', () => {
    const env = {
      TEST_DATABASE_URL: TEST_URL,
      DATABASE_URL: 'postgresql://devsync:devsync@127.0.0.1:5433/devsync',
    };

    expect(resolveTestDatabaseUrl(env)).toBe(TEST_URL);
  });

  it('accepts when the development database is on a different host', () => {
    const env = {
      TEST_DATABASE_URL: TEST_URL,
      DATABASE_URL: 'postgresql://devsync:devsync@db.internal.example:5433/devsync_test',
    };

    expect(resolveTestDatabaseUrl(env)).toBe(TEST_URL);
  });

  it('accepts when the development database is on a different port', () => {
    const env = {
      TEST_DATABASE_URL: TEST_URL,
      DATABASE_URL: 'postgresql://devsync:devsync@127.0.0.1:5432/devsync_test',
    };

    expect(resolveTestDatabaseUrl(env)).toBe(TEST_URL);
  });
});

describe('it never puts a password in a message', () => {
  it.each([
    ['the same database', 'postgresql://devsync:hunter2@127.0.0.1:5433/devsync_test'],
    ['a malformed URL', 'postgres://devsync:hunter2@:::'],
  ])('keeps the password out of the refusal for %s', (_case: string, databaseUrl: string) => {
    const message = refusal({ TEST_DATABASE_URL: TEST_URL, DATABASE_URL: databaseUrl });

    expect(message).not.toContain('hunter2');
    expect(message).not.toContain(databaseUrl);
  });

  it('keeps the password out of the refusal for a rejected test database', () => {
    const message = refusal({
      TEST_DATABASE_URL: 'postgresql://devsync:hunter2@127.0.0.1:5433/production',
    });

    expect(message).not.toContain('hunter2');
    expect(message).toContain('production');
  });
});
