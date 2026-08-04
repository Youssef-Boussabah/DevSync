# @devsync/database

The single place where DevSync talks to PostgreSQL.

Prisma, the schema, the migrations, the connection pool, and every query live
behind this package's surface. `apps/api` gets named operations over projects and
files — never a client it can run arbitrary queries through, and never a Prisma
error. `apps/web` does not depend on this package at all, and must not: a database
credential that reaches a browser bundle is a published credential.

## What it exports

```ts
import { createDatabase } from '@devsync/database';

const database = createDatabase({ connectionString });

await database.connect(); // opens the pool and proves the server answers
await database.disconnect();
```

`createDatabase` builds the one client the process gets. Nothing is constructed at
import time: the pool exists only once a caller supplies a connection string, and
this package reads no environment variable and has no fallback, so it cannot end up
talking to a database nobody chose. The API validates `DATABASE_URL` and passes it
in.

| Operation                                  | Does                                                    |
| ------------------------------------------ | ------------------------------------------------------- |
| `projects.createWithInitialFile(input)`    | Creates a project and its first file in one transaction |
| `projects.list()`                          | Most recently updated first, identifier as tie-breaker  |
| `projects.findById(id)`                    | One project, or `null`                                  |
| `projects.rename(id, name)`                | Renames, and moves `updatedAt`                          |
| `projects.delete(id)`                      | Permanent, cascading to the project's files             |
| `files.create(projectId, file)`            | Adds a file                                             |
| `files.list(projectId)`                    | Summaries, oldest first, without contents               |
| `files.find(projectId, fileId)`            | One complete file, or `null`                            |
| `files.update(projectId, fileId, changes)` | Any of `name`, `language`, `content`                    |
| `files.delete(projectId, fileId)`          | Permanent                                               |

Two conventions run through the file operations. **A missing project always
throws**, because the project is context rather than the thing being asked for. **A
missing file is `null`** from a lookup and an error from anything that changes it.

The starter file a new project is created with arrives from the caller. What a new
project should contain is a product decision, and it belongs to `apps/api`; this
package owns only the guarantee that both rows are written or neither is.

Every file change also moves its project's `updatedAt`, in the same transaction, so
a project list ordered by recency reflects real work.

## Errors

Nothing Prisma throws escapes. Failures are classified into four meanings, and the
API maps those onto HTTP status codes:

```ts
type PersistenceFailure =
  | { kind: 'notFound'; entity: 'project' | 'projectFile' }
  | { kind: 'uniqueViolation'; constraint: 'projectFileName' }
  | { kind: 'unavailable' }
  | { kind: 'unknown' };
```

The original exception is kept as `cause` for a log; no message this package
produces contains SQL, a connection string, or a table name.

`apps/api` maps the four meanings onto `PROJECT_NOT_FOUND` / `FILE_NOT_FOUND`,
`FILE_NAME_TAKEN`, `DATABASE_UNAVAILABLE`, and `INTERNAL_ERROR`. **No HTTP concept
belongs in this package**: it does not know what a status code is, and it must not
learn.

## The test-database subpath

```ts
import { prepareTestDatabase } from '@devsync/database/test-database';
```

The safety gate and the reset-and-migrate helper, exported so that
`apps/api`'s integration suite can prepare the same disposable database without
carrying a second copy of the rules. Nothing in `src/` imports it, so it never
reaches a runtime image — the API's Dockerfile copies `dist` and nothing else.

## Schema

Two tables. `projects` and `project_files`, with a foreign key that cascades, a
unique index on `(project_id, name)`, UUID primary keys defaulted by
`gen_random_uuid()`, and time-zone-aware timestamps.

**`project_files.name` is pinned to the `C` collation.** Prisma cannot express a
collation, so the initial migration adds it by hand — deliberately, and with the
reason written in the SQL. Without it, whether `README.md` and `readme.md` are the
same file name would depend on the locale the server was initialised with.

## Commands

Run from the repository root unless noted.

| Command                                        | Does                                              |
| ---------------------------------------------- | ------------------------------------------------- |
| `pnpm --filter @devsync/database generate`     | Regenerates Prisma Client from the schema         |
| `pnpm --filter @devsync/database build`        | Compiles `src` — including the client — to `dist` |
| `pnpm test:db`                                 | The integration suite, against real PostgreSQL    |
| `pnpm --filter @devsync/database migrate:test` | Migrates the disposable test database             |

Generated Prisma Client is written to `src/generated/prisma` and is **not**
tracked: it is reproducible from `prisma/schema.prisma`, and the `build`, `lint`,
and `typecheck` tasks all depend on the `generate` task, so a fresh checkout needs
no remembered command. Generating it needs no database.

Migrations are committed and applied with `prisma migrate deploy` everywhere except
a developer's own machine, where `prisma migrate dev` creates them. An applied
migration is never edited.

## Testing

`pnpm test:db` runs against a real PostgreSQL through `TEST_DATABASE_URL` — not
SQLite, and not a mocked client, because cascades, unique constraints, and
transaction rollback are exactly what a substitute does not have. It drops the test
schema and applies the committed migration first, and it refuses to run against any
database it cannot prove is disposable.

From C2 that command runs this package's 57 tests **and then** the API's 110
PostgreSQL-backed HTTP tests, one after the other against the same schema. It is
deliberately not part of `pnpm test`, which starts no external service.
