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

**Recognising the exception and deciding what it means are two files.**
`src/errors.ts` does the first — it is what knows a `PrismaClientKnownRequestError`
from a `PrismaClientInitializationError`, and it needs the generated client for
those `instanceof` checks. `src/failure-classification.ts` does the second and
imports nothing from Prisma, so the rules can be tested without a database or a
generated client, which is where the 83 fast tests live.

**`errors.ts` hands over the complete exception, not one property of it.** Where a
driver publishes its structured condition is the driver's business, and it is not
in one place. A PostgreSQL error nests a SQLSTATE under
`meta.driverAdapterError.cause`. A system error the adapter does not convert
arrives with **no driver metadata at all** and its operating-system code sitting in
Prisma's own code slot — which is the shape a Linux host produces when a stopped
container's name will not resolve, an outer `EAI_AGAIN` with nothing but a model
name beside it. A classifier given only `error.meta` cannot see that failure at
all.

### What decides

**Request outcomes come first**, because they are answers about the request rather
than about the database, and connectivity trouble attached to one must not change
it: `P2002` is a unique violation, `P2025` a missing record, `P2003` a missing
project.

Only then does `unavailable`, over four closed allowlists:

| Kind of evidence     | Members                                                                                                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prisma codes         | `P1000`, `P1001`, `P1002`, `P1008`, `P1017`                                                                                                                                                 |
| PostgreSQL SQLSTATEs | connection-exception class `08` whole, plus `57P01`, `57P02`, `57P03`                                                                                                                       |
| Driver adapter kinds | `DatabaseNotReachable`, `ConnectionClosed`, `SocketTimeout`                                                                                                                                 |
| Transport codes      | `EAI_AGAIN`, `EAI_FAIL`, `EAI_NODATA`, `ENOTFOUND`, `ECONNREFUSED`, `EHOSTDOWN`, `EHOSTUNREACH`, `ENETDOWN`, `ENETUNREACH`, `ETIMEDOUT`, `ECONNABORTED`, `ECONNRESET`, `ENETRESET`, `EPIPE` |

A value counts only when it is an **exact member** of one of those, read from one
of three structured fields: `kind` for an adapter kind, and `code` or
`originalCode` for a condition code. Nothing else is read. `sqlState` is not on the
list because nothing in the installed tree writes it — `pg` renames libpq's field
to `code`, and `pg-native` is not installed. Class `57` is named code by code
rather than taken by prefix: `57014` is a cancelled query, `57P04` a dropped
database, `57P05` an idle session timing out, and none of them means "come back
shortly".

Three things it deliberately is **not**:

- **Not `P2010` or `P2039` on their own.** Those are the codes Prisma reports when
  it had none of its own for what the driver said — a raw query failure and a
  passthrough database error — so a syntax error, a constraint, and a server
  shutting down all arrive under them. Only the condition named inside decides.
- **Not anything read out of a message.** A driver's wording is not a contract, and
  a classifier that grepped one would turn a reworded log line into a status-code
  change.
- **Not every system error.** The transport list is failures of the connection to
  the database. `ENOENT` and `EACCES` say nothing about the database being away and
  stay `unknown`.

### How the exception is read

The search over the exception graph is bounded on every axis, because the graph is
built by something other than this package:

- **Breadth-first**, so the node budget is spent near the exception, where every
  shape this stack produces puts its condition.
- **Maximum depth 4.** The real shape needs three links —
  `error` → `meta` → `driverAdapterError` → `cause` — which leaves one spare.
- **Maximum 32 nodes inspected.**
- **Cycle-safe**, by object identity.
- **Own enumerable properties only**, so nothing inherited can answer for an object
  this package did not build. The single deliberate exception is `cause`, read by
  name: `new Error(message, { cause })` makes it non-enumerable, and it is the link
  the driver adapter nests its condition under.

### The diagnostic

`PersistenceError` carries a `diagnostic`: a fixed internal token naming which rule
classified the failure — `request-outcome`, `prisma-code`, `sqlstate`,
`adapter-kind`, `network-errno`, `connection-open`, or `unclassified`.

It exists because every meaning above answers with a **fixed** sentence, so a log
line alone cannot distinguish a failure that was understood from one no rule
recognised. `apps/api` writes it beside the stable code for 5xx responses only. It
is **never serialised into an HTTP response**, and it is never copied from a driver
value — no SQLSTATE, no driver code, no host, nothing out of the original
exception.

### Where the rule came from

**C4's container-level outage scenario is the layer that caught the defect**: a
persistence request made while PostgreSQL was stopped answered `500` where the
contract says `503`. What was missing was not detection but **deterministic
lower-level coverage** — deciding what a driver exception means is a pure decision
about its structure, and it had been left in a suite that needed a running
PostgreSQL. The exceptions were captured from the production image and the rules
now live in the fast command, where no container is involved.

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

**Two halves, two Vitest configurations, and no test counted twice.**

| Half                     | Config                   | Tests | Command                       | Needs             |
| ------------------------ | ------------------------ | ----- | ----------------------------- | ----------------- |
| Failure classification   | `vitest.unit.config.mts` | 83    | `pnpm test`, `pnpm test:unit` | nothing           |
| Data access and the gate | `vitest.config.mts`      | 57    | `pnpm test:db`                | a real PostgreSQL |

The unit configuration includes only `tests/unit/**/*.unit.test.ts` and has no
global setup; the database configuration excludes `tests/unit/**`. Without that
exclusion the shared file glob would match both and `pnpm test:db` would report 140
where 57 is the truth.

`pnpm test:db` runs against a real PostgreSQL through `TEST_DATABASE_URL` — not
SQLite, and not a mocked client, because cascades, unique constraints, and
transaction rollback are exactly what a substitute does not have. It drops the test
schema and applies the committed migration first, and it refuses to run against any
database it cannot prove is disposable.

From C2 that command runs this package's 57 database-backed tests **and then** the
API's 110 PostgreSQL-backed HTTP tests, one after the other against the same schema.
It is deliberately not part of `pnpm test`, which starts no external service.

**The pure half was added because a rule went unheld.** Until then both scripts
printed that this package's suite needed PostgreSQL — accurate, and also the problem:
whether a driver error means "the database is unavailable" is a decision about the
**structure of an exception**, and leaving it in the database-backed suite meant no
fast command could hold it. A PostgreSQL outage classified as `unknown` reached the
API as a `500`, and C4's container-level outage scenario — three layers above the
rule — is what noticed. The 83 fast tests are the deterministic regression that was
missing: every allowlist member, both recorded outage exceptions, the one that
carries no driver metadata at all, the codes that must stay `unknown`, and each of
the traversal bounds.

`tools/test-database.mjs` holds the safety gate and is plain JavaScript, so it is named
in `files` in `tsconfig.json` and the package turns on `allowJs` and `checkJs`. Without
that it was outside `pnpm typecheck` entirely — the `.d.mts` beside it wins on extension
priority — and `tsconfig.build.json` clears the list again, because `files` beats
`exclude` and CLI tooling must not reach `dist`.
