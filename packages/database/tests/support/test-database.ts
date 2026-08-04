import { Client } from 'pg';
import { afterAll, beforeAll, beforeEach } from 'vitest';
import {
  createDatabase,
  isPersistenceError,
  type Database,
  type PersistenceFailure,
} from '../../src';
import { loadDatabaseEnv, resolveTestDatabaseUrl } from '../../tools/test-database.mjs';

loadDatabaseEnv();

const connectionString = resolveTestDatabaseUrl(process.env);

/**
 * A second connection, outside the package under test, for the two things tests
 * legitimately need and the public surface deliberately does not offer:
 * emptying the tables, and counting rows nothing has a handle on.
 */
let admin: Client | undefined;

async function adminClient(): Promise<Client> {
  if (admin === undefined) {
    admin = new Client({ connectionString });
    await admin.connect();
  }

  return admin;
}

/**
 * Wires a connected `Database` into the calling test file, emptied before every
 * test. Cleaning before rather than after means a run that crashed halfway
 * cannot leave rows behind that quietly change the next one.
 */
export function useTestDatabase(): Database {
  const database = createDatabase({ connectionString });

  beforeAll(async () => {
    await database.connect();
  });

  beforeEach(async () => {
    const client = await adminClient();
    await client.query('TRUNCATE TABLE "project_files", "projects" CASCADE');
  });

  afterAll(async () => {
    await database.disconnect();
    await admin?.end();
    admin = undefined;
  });

  return database;
}

export function testDatabaseUrl(): string {
  return connectionString;
}

export async function countRows(table: 'projects' | 'project_files'): Promise<number> {
  const client = await adminClient();
  const result = await client.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM "${table}"`,
  );

  return Number(result.rows[0]?.count ?? '0');
}

/** Reads a column PostgreSQL owns, to check what was actually stored. */
export async function columnType(table: string, column: string): Promise<string> {
  const client = await adminClient();
  const result = await client.query<{ data_type: string }>(
    'SELECT data_type FROM information_schema.columns WHERE table_name = $1 AND column_name = $2',
    [table, column],
  );

  return result.rows[0]?.data_type ?? 'missing';
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/**
 * Runs an operation that is expected to fail and returns how the package
 * classified it. Anything else — a different error, or no error at all — fails
 * the test here rather than three assertions later.
 */
export async function persistenceFailure(operation: Promise<unknown>): Promise<PersistenceFailure> {
  try {
    await operation;
  } catch (error) {
    if (isPersistenceError(error)) {
      return error.failure;
    }

    throw error;
  }

  throw new Error('Expected the operation to fail, but it succeeded.');
}
