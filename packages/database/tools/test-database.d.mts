// Declarations for `test-database.mjs`.
//
// Hand-written because that file is plain JavaScript — it runs as a command with
// no compile step in front of it — while the two files that import it,
// `prisma.config.ts` and `tests/global-setup.ts`, are type-checked.

/** Loads `DATABASE_URL` and `TEST_DATABASE_URL` from the repository's `.env`. */
export declare function loadDatabaseEnv(): void;

/**
 * Returns `TEST_DATABASE_URL`, or throws explaining why it will not be used.
 * Refuses anything that is not the disposable PostgreSQL test database.
 */
export declare function resolveTestDatabaseUrl(env: NodeJS.ProcessEnv): string;

/**
 * Applies the committed migrations to the test database, optionally emptying it
 * first. Returns the connection string it prepared.
 */
export declare function prepareTestDatabase(options?: { reset?: boolean }): Promise<string>;
