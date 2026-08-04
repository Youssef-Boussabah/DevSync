import { defineConfig } from 'prisma/config';
import { loadDatabaseEnv } from './tools/test-database.mjs';

// Prisma CLI configuration. It lives here rather than in `apps/api` because the
// schema, the migrations, and the generated client all belong to this package.
//
// The CLI does not read `.env` itself, so the connection string is loaded here.
// Nothing in `src/` does this: the API passes a validated URL in, and this file
// is tooling that never ships.
loadDatabaseEnv();

const databaseUrl = process.env.DATABASE_URL;

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  // Only declared when it is actually set. `prisma generate` needs no database,
  // and a fresh checkout has to be able to run `pnpm typecheck` and `pnpm build`
  // before anyone has configured one.
  ...(databaseUrl === undefined ? {} : { datasource: { url: databaseUrl } }),
});
