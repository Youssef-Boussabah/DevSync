// @ts-check

// The disposable test database: how to find it, and how to put it into a known
// state. Two things use this — the Vitest global setup in `tests/`, and the
// `migrate:test` script the end-to-end suite depends on — so the safety gate
// below is written once.
//
// Plain JavaScript rather than TypeScript because it also runs as a command,
// with no compile step in front of it. `test-database.d.mts` carries its types.
//
// No message here ever contains a connection string: it carries a password, and
// a failing run tends to end up in a log someone else reads.

import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { config as loadDotenv } from 'dotenv';
import { Client } from 'pg';

const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);

/** The one database name this tooling will touch. Compose creates it empty. */
const DISPOSABLE_DATABASE_NAME = 'devsync_test';

const POSTGRES_PROTOCOLS = new Set(['postgres:', 'postgresql:']);

const SET_IT_UP =
  'Start PostgreSQL with `docker compose up -d database` and set TEST_DATABASE_URL — ' +
  '`.env.example` has the value to copy.';

/**
 * Loads `DATABASE_URL` and `TEST_DATABASE_URL` from the repository's `.env`.
 *
 * Tooling only. Nothing in `src/` reads the environment: the API validates its
 * own configuration and passes a connection string in, which is what stops this
 * package from silently falling back to some other database. Values already in
 * the environment win, so CI and Compose keep control.
 *
 * @returns {void}
 */
export function loadDatabaseEnv() {
  const packageRoot = path.resolve(fileURLToPath(import.meta.url), '..', '..');

  loadDotenv({
    path: [path.join(packageRoot, '.env'), path.resolve(packageRoot, '..', '..', '.env')],
    quiet: true,
  });
}

/**
 * The safety gate. Everything that uses the test database drops or rewrites part
 * of it, so it refuses to run against a database it cannot prove is disposable.
 * Each refusal below is a database someone might plausibly be pointing at by
 * accident.
 *
 * @param {NodeJS.ProcessEnv} env
 * @returns {string}
 */
export function resolveTestDatabaseUrl(env) {
  const candidate = env.TEST_DATABASE_URL?.trim();

  if (candidate === undefined || candidate === '') {
    throw new Error(`TEST_DATABASE_URL is not set, and this will not guess one. ${SET_IT_UP}`);
  }

  const target = parseConnectionUrl(candidate, 'TEST_DATABASE_URL');

  if (!POSTGRES_PROTOCOLS.has(target.protocol)) {
    throw new Error(
      `TEST_DATABASE_URL is not a PostgreSQL URL: it starts with "${target.protocol}". ` +
        'These tests exercise PostgreSQL behaviour and have nothing to prove anywhere else.',
    );
  }

  const databaseName = decodeURIComponent(target.pathname.replace(/^\//, ''));

  if (databaseName !== DISPOSABLE_DATABASE_NAME) {
    throw new Error(
      `TEST_DATABASE_URL names the database "${databaseName || '(none)'}", and only ` +
        `"${DISPOSABLE_DATABASE_NAME}" is accepted. Its schema gets dropped, so the name is the ` +
        'only evidence there is that the data is disposable.',
    );
  }

  const ordinary = env.DATABASE_URL?.trim();

  if (ordinary !== undefined && ordinary !== '') {
    let ordinaryTarget;

    try {
      ordinaryTarget = canonicalTarget(ordinary);
    } catch {
      // Refusing rather than assuming. A DATABASE_URL that cannot be parsed
      // cannot be compared, and "I could not tell" is not the same as "they are
      // different" when the next step drops a schema.
      throw new Error(
        'DATABASE_URL is set but is not a valid connection URL, so this cannot prove the test ' +
          'database is a different one. Fix DATABASE_URL, or unset it, before running the ' +
          'database tests.',
      );
    }

    if (ordinaryTarget === canonicalTarget(candidate)) {
      throw new Error(
        'TEST_DATABASE_URL and DATABASE_URL address the same database. That is the development ' +
          'database, and this would erase it.',
      );
    }
  }

  return candidate;
}

/**
 * Brings the test database to a known state: the committed migrations applied,
 * and — when asked — nothing else in it.
 *
 * @param {{ reset?: boolean }} [options]
 * @returns {Promise<string>} the connection string that was prepared
 */
export async function prepareTestDatabase(options = {}) {
  loadDatabaseEnv();

  const connectionString = resolveTestDatabaseUrl(process.env);

  if (options.reset === true) {
    await dropSchema(connectionString);
  }

  await deployMigrations(connectionString);

  return connectionString;
}

/** @param {string} connectionString */
async function dropSchema(connectionString) {
  const client = new Client({ connectionString });

  await client.connect();

  try {
    // Everything the migrations create, plus Prisma's own migration history, so
    // the deploy below starts from nothing and applies every migration in order.
    await client.query('DROP SCHEMA IF EXISTS public CASCADE');
    await client.query('CREATE SCHEMA public');
  } finally {
    await client.end();
  }
}

/** @param {string} connectionString */
async function deployMigrations(connectionString) {
  await execFileAsync(process.execPath, [resolvePrismaCli(), 'migrate', 'deploy'], {
    cwd: path.resolve(fileURLToPath(import.meta.url), '..', '..'),
    // The test database, and only for this child process. `prisma.config.ts`
    // reads `DATABASE_URL`, and dotenv does not overwrite what is already set,
    // so a developer's own value cannot leak into a migration run here.
    env: { ...process.env, DATABASE_URL: connectionString },
  });
}

/**
 * The Prisma CLI's entry point, to run with this process's own Node binary.
 * Resolving the module rather than spawning `node_modules/.bin/prisma` avoids
 * the shim: on Windows that path is a `.CMD` file, which `spawn` cannot execute
 * without a shell.
 *
 * @returns {string}
 */
function resolvePrismaCli() {
  const manifestPath = require.resolve('prisma/package.json');
  /** @type {{ bin: { prisma: string } }} */
  const manifest = require(manifestPath);

  return path.resolve(path.dirname(manifestPath), manifest.bin.prisma);
}

/**
 * @param {string} value
 * @param {string} variableName
 * @returns {URL}
 */
function parseConnectionUrl(value, variableName) {
  try {
    return new URL(value);
  } catch {
    throw new Error(`${variableName} is not a valid connection URL. ${SET_IT_UP}`);
  }
}

/** Spellings of the local machine that all reach the same PostgreSQL. */
const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0:0:0:0:0:0:0:1']);

/**
 * Which database a URL actually points at, in one comparable string.
 *
 * Two URLs can name the same database and look nothing alike:
 * `postgres:` and `postgresql:` are the same scheme, an omitted port means 5432,
 * `localhost` and `127.0.0.1` and `[::1]` are the same machine, and credentials
 * say nothing about which database is on the other end. This tooling drops a
 * schema, so it has to treat all of those as equal rather than merely most of
 * them.
 *
 * Deliberately no DNS: resolution would make the answer depend on the network,
 * and a comparison that behaves differently on a train is not a safety check.
 * Two genuinely distinct hostnames that resolve to one server are the residual
 * gap, and the `devsync_test` name requirement is what covers it.
 *
 * @param {string} value
 * @returns {string}
 */
function canonicalTarget(value) {
  const url = new URL(value);
  const protocol = url.protocol === 'postgres:' ? 'postgresql:' : url.protocol;
  const port = url.port === '' ? '5432' : url.port;
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));

  // `URL` keeps IPv6 hosts in brackets, and lowercases nothing else reliably.
  const bracketed = url.hostname.toLowerCase();
  const hostname =
    bracketed.startsWith('[') && bracketed.endsWith(']') ? bracketed.slice(1, -1) : bracketed;
  const host = LOOPBACK_HOSTS.has(hostname) ? 'localhost' : hostname;

  return `${protocol}//${host}:${port}/${database}`;
}

// Run as a command: `node tools/test-database.mjs [--reset]`. Imported instead,
// nothing below happens.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const reset = process.argv.includes('--reset');

  prepareTestDatabase({ reset }).then(
    () => {
      console.log(
        reset
          ? 'Test database reset and migrated.'
          : 'Test database migrated. Existing data left alone.',
      );
    },
    (/** @type {unknown} */ error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    },
  );
}
