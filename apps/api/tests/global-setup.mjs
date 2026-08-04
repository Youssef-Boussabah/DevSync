// @ts-check
import { prepareTestDatabase } from '@devsync/database/test-database';

/**
 * Puts the disposable test database into a known state — an empty schema with the
 * committed migration applied — and points the API at it, once, before any test
 * file runs.
 *
 * The safety gate lives with the database tooling and is used unchanged: it
 * refuses anything that is not `devsync_test`, and anything that turns out to
 * address the same database as `DATABASE_URL`. `apps/api` deliberately carries no
 * second copy of those rules; a rule written twice is a rule that will disagree
 * with itself.
 */
export default async function setup() {
  const connectionString = await prepareTestDatabase({ reset: true });

  // Set afterwards, never before. The gate compares TEST_DATABASE_URL with
  // DATABASE_URL and refuses when they address the same database — overwriting
  // DATABASE_URL first would have it compare the test database with itself and
  // refuse to run at all.
  //
  // `@nestjs/config` gives an environment variable priority over a `.env` file,
  // so this is also what stops the suite reaching a developer's own database.
  process.env.DATABASE_URL = connectionString;
}
