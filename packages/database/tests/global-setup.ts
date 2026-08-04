import { prepareTestDatabase } from '../tools/test-database.mjs';

/**
 * Puts the disposable test database into a known state, once, before any test
 * file runs: an empty schema with the committed migrations applied to it.
 *
 * Resetting here rather than between tests means the suite proves the real
 * migration produces a schema the code can work against — the same migration
 * Compose and CI apply, not a schema pushed straight from `schema.prisma`.
 *
 * The safety gate that decides whether the database may be touched at all lives
 * with the tooling, because the end-to-end suite prepares the same database.
 */
export default async function setup(): Promise<void> {
  await prepareTestDatabase({ reset: true });
}
