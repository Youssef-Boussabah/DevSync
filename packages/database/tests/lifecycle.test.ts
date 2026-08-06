import { describe, expect, it } from 'vitest';
import { createDatabase } from '../src';
import { persistenceFailure, testDatabaseUrl, useTestDatabase } from './support/test-database';

const database = useTestDatabase();

// A port nothing listens on, so the connection is refused immediately rather
// than waiting for a timeout. The suite needs an unreachable database, not a
// slow one.
const UNREACHABLE = 'postgresql://devsync:devsync@127.0.0.1:1/devsync';

describe('connection lifecycle', () => {
  it('keeps data across a disconnect and a reconnect', async () => {
    const { project } = await database.projects.createWithInitialFile({
      project: { name: 'Survives a reconnect' },
      initialFile: { name: 'main.ts', language: 'typescript', content: 'still here' },
    });

    // A second client over the same database, so the reconnect is genuinely a
    // new pool rather than the shared one the fixture holds open.
    const second = createDatabase({ connectionString: testDatabaseUrl() });

    await second.connect();
    await second.disconnect();
    await second.connect();

    try {
      const found = await second.projects.findById(project.id);
      const files = await second.files.list(project.id);

      expect(found?.name).toBe('Survives a reconnect');
      expect(files.map((file) => file.name)).toEqual(['main.ts']);
    } finally {
      await second.disconnect();
    }
  });

  it('tolerates connect and disconnect being called more than once', async () => {
    const extra = createDatabase({ connectionString: testDatabaseUrl() });

    await extra.connect();
    await extra.connect();
    await extra.disconnect();
    await extra.disconnect();

    // Still usable afterwards: the repeated calls did not leave it half-closed.
    await extra.connect();
    await expect(extra.projects.list()).resolves.toEqual([]);
    await extra.disconnect();
  });

  it('fails to connect to a database that is not there, and says so', async () => {
    const unreachable = createDatabase({ connectionString: UNREACHABLE });

    const failure = await persistenceFailure(unreachable.connect());

    expect(failure).toEqual({ kind: 'unavailable' });
  });

  it('classifies a query against an unreachable database as unavailable', async () => {
    const unreachable = createDatabase({ connectionString: UNREACHABLE });

    // No `connect()` first: this is the shape of a database that disappears
    // after startup, where the next request is what discovers it.
    const failure = await persistenceFailure(unreachable.projects.list());

    expect(failure).toEqual({ kind: 'unavailable' });
  });

  it('never lets a raw driver error out of the package', async () => {
    const unreachable = createDatabase({ connectionString: UNREACHABLE });

    try {
      await unreachable.projects.list();
      expect.unreachable('the query should have failed');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      const message = error instanceof Error ? error.message : String(error);

      // Nothing about SQL, the connection string, or the schema.
      expect(message).not.toContain('devsync');
      expect(message).not.toContain('SELECT');
      expect(message).not.toContain('127.0.0.1');
      // The driver's own error is still reachable for a log, but only as `cause`.
      expect(error instanceof Error && error.cause).toBeDefined();
    }
  });
});
