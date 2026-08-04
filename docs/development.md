# Development

How to install, run, test, and extend DevSync locally.

This is the practical companion to [`architecture.md`](architecture.md): what to type, in what
order, and what each command actually does. The testing, Docker, and CI documents own their
subjects in full; this one links to them rather than restating them.

## Prerequisites

| Requirement           | Why                                                                                                 |
| --------------------- | --------------------------------------------------------------------------------------------------- |
| **Node.js 20.9+**     | The `engines` floor. Developed and validated against Node 24                                        |
| **pnpm 11**           | The only supported package manager                                                                  |
| **Docker Engine 25+** | PostgreSQL runs in a container, so `pnpm test:db`, `pnpm test:e2e`, and running the API all need it |

**Docker stopped being optional at C1.** The API will not start without a database, and the
repository's PostgreSQL is a Compose service. You do not need Docker for `pnpm test`,
`pnpm lint`, `pnpm typecheck`, or `pnpm build` — those neither start a service nor connect to
one.

**pnpm is pinned by the `packageManager` field**, and the pinned version is what the lockfile and
CI use. The simplest way to get exactly that version is Corepack, which ships with Node:

```bash
corepack enable pnpm
```

If Corepack cannot write to the Node.js installation directory — common on Windows, where it
needs administrator rights — install the shims somewhere you own and put that directory on your
`PATH`:

```bash
corepack enable pnpm --install-directory "$LOCALAPPDATA/node-corepack-bin"
```

**`npm` and `yarn` must never be run against this repository.** They would resolve a different
dependency graph, write a lockfile this repository does not track, and break the frozen install
that both CI and both Docker images depend on.

## Installation

```bash
git clone https://github.com/Youssef-Boussabah/DevSync.git
cd DevSync
pnpm install
```

`pnpm install` reconciles the lockfile with the manifests and may update it. Use
`pnpm install --frozen-lockfile` — what CI and the images run — to install without ever writing
`pnpm-lock.yaml`; it fails instead if the two disagree.

Copy the environment file and start PostgreSQL:

```bash
cp .env.example .env
docker compose up -d database
```

`.env` is git-ignored, and the values in the example are the ones Compose runs with, so nothing
needs editing to get started. The database keeps its data in a named volume: `docker compose down`
leaves your projects alone, and only `docker compose down --volumes` deletes them.

Playwright needs one extra step, once per machine, before end-to-end tests can run:

```bash
pnpm test:e2e:install
```

It is deliberately separate from every ordinary test command: it downloads roughly 300 MB into a
machine-level cache, which should be something you chose rather than a side effect.

## Root commands

Run these from the repository root. Turborepo fans each one out across the workspaces, in
dependency order, and caches what is safe to cache.

| Command                 | What it does                                                                    |
| ----------------------- | ------------------------------------------------------------------------------- |
| `pnpm dev`              | Starts both development servers — web on 3000, API on 3001                      |
| `pnpm build`            | Builds the four workspaces that have a build step                               |
| `pnpm lint`             | Lints all nine workspaces. Read-only                                            |
| `pnpm lint:fix`         | The same rules, applying every auto-fixable one                                 |
| `pnpm typecheck`        | Type-checks all nine workspaces                                                 |
| `pnpm test`             | Every in-process source suite — Vitest and Jest. Builds nothing, starts nothing |
| `pnpm test:unit`        | The Vitest layer only                                                           |
| `pnpm test:db`          | The data layer then the API's routes, both against a running PostgreSQL         |
| `pnpm test:e2e`         | Playwright, against freshly built applications                                  |
| `pnpm test:e2e:install` | Downloads Chromium. Once per machine                                            |
| `pnpm test:all`         | `test`, then `test:db`, then `test:e2e`, in sequence. Needs PostgreSQL          |
| `pnpm test:coverage`    | Coverage for `apps/web` and `apps/api`                                          |
| `pnpm format`           | Formats the repository with Prettier                                            |
| `pnpm format:check`     | Verifies formatting. Read-only                                                  |
| `pnpm clean`            | Removes build outputs, coverage, reports, and Turborepo caches                  |

**Exactly two of these modify files: `pnpm lint:fix` and `pnpm format`.** `lint` and
`format:check` are read-only and must stay that way — they are what CI runs, and a check that
rewrites the tree cannot report on it.

Before opening a pull request, the useful one-liner is the `quality` job:

```bash
pnpm install --frozen-lockfile && pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

## Working in one workspace

Every workspace is addressable by its package name:

```bash
pnpm --filter @devsync/web dev          # http://localhost:3000
pnpm --filter @devsync/api dev          # http://localhost:3001
pnpm --filter @devsync/web test:watch   # Vitest, watching
pnpm --filter @devsync/api test:watch   # Jest, watching
pnpm --filter @devsync/api lint
```

The nine names are `@devsync/web`, `@devsync/api`, `@devsync/config`, `@devsync/shared`,
`@devsync/collaboration`, `@devsync/database`, `@devsync/ui`, `@devsync/test-utils`, and
`@devsync/e2e`.

Two filter suffixes are worth knowing, because the Docker images depend on the difference:

```bash
pnpm --filter @devsync/api...     # the package and every workspace package it depends on
pnpm --filter @devsync/api        # the package alone
```

To add a dependency to one workspace rather than the root:

```bash
pnpm --filter @devsync/web add some-package
pnpm --filter @devsync/api add -D some-dev-tool
```

Add a dependency only when something in the repository uses it now. An unused dependency is
weight in an image, a line in a lockfile, and a thing to keep patched.

## Ports

| Port   | Used by                     | When                                    |
| ------ | --------------------------- | --------------------------------------- |
| `3000` | `apps/web`                  | `pnpm dev`, Docker                      |
| `3001` | `apps/api`                  | `pnpm dev`, Docker                      |
| `4310` | `apps/web` under Playwright | `pnpm test:e2e`                         |
| `4311` | `apps/api` under Playwright | `pnpm test:e2e`                         |
| `5433` | PostgreSQL                  | Always, whenever the database is needed |

Docker uses the same application pair as local development, so `docker compose up` and `pnpm dev`
cannot run at once — whichever starts second fails to bind. The end-to-end ports are separate
precisely so that `pnpm test:e2e` and `pnpm dev` can run at the same time without either noticing
the other.

**PostgreSQL is on 5433, not 5432**, so that it cannot collide with a PostgreSQL you already have
installed — and so `docker compose up -d database` and `pnpm dev` work together, which is the
ordinary development arrangement.

Check the API is up:

```bash
curl http://localhost:3001/health
# {"status":"ok","service":"devsync-api"}
```

From C2 it also serves projects and the files inside them. Nothing in the browser calls these yet —
`apps/web` makes no request to `apps/api` until C3 — so an HTTP client is the only way to reach
them:

```bash
curl -X POST http://localhost:3001/projects \
  -H 'Content-Type: application/json' -d '{"name":"My project"}'
# 201, the project and the main.ts it was created with

curl http://localhost:3001/projects
# 200, most recently updated first
```

Every route is listed in [`architecture.md`](architecture.md#appsapi--implemented). **Every request
is anonymous**, so the API is safe only on a machine you control; Phase H is what changes that.

## Testing

Six layers, three runners, three hundred and fifty-seven real tests — Vitest over the schemas in
`packages/shared`, Vitest in `apps/web`, Jest in `apps/api` twice over (fast, and against a real
database), Vitest against a real PostgreSQL in `packages/database`, and Playwright in `tests/e2e`.

```bash
pnpm test        # fast: in-process source only, no builds, no browser, no database  (182)
pnpm test:db     # the data layer, then the API's HTTP routes, both against PostgreSQL  (167)
pnpm test:e2e    # builds both applications, starts them, drives Chromium  (8)
```

**`pnpm test` builds nothing at all** — no workspace build, no Prisma generation — so
`pnpm clean && pnpm test` passes with every `dist/`, `.next/`, and generated client still absent
afterwards. The fast API suite reads `@devsync/shared` and `@devsync/database` from their TypeScript
sources through `apps/api/jest.config.mjs`, while `pnpm build`, `node dist/main.js`, and Docker all
keep resolving the compiled `dist` output. [`testing.md`](testing.md#how-the-fast-api-suite-runs-with-nothing-built)
is the full account.

`pnpm test:db` runs its two suites **in sequence**, not in parallel: they reset and rewrite the same
schema in the same disposable database. It and `pnpm test:e2e` do build their real runtime
dependencies, which is the point of them.

`pnpm test` is the inner loop and must stay fast, which is why nothing in it builds, launches a
browser, or connects to anything. The other two need `docker compose up -d database` first. A workspace with no implementation prints that it has no tests and exits cleanly; that
is correct, and it stays that way until there is real behaviour to cover.

[`testing.md`](testing.md) is the full account: what each layer proves, why the API stays on
Jest, how the end-to-end suite starts its servers, where artifacts go, and what is deliberately
untested.

## Docker

```bash
docker compose up -d --build   # build both images and start them
docker compose ps              # state and health of each service
docker compose logs -f api     # follow one service
docker compose down            # stop and remove the services; keeps the database volume
```

Docker is an additional way to run DevSync, not a replacement for `pnpm dev`: every command above
still works unchanged, and no test tooling or browser is ever installed into an application
image.

[`docker.md`](docker.md) covers the image structure, why both images build from the repository
root, the health checks, and the current limitations.

## Continuous integration

One workflow with four independent jobs — `quality`, `database`, `e2e`, and `docker` — running on
every pull request, on pushes to `main`, and on demand.

**CI runs the same commands you run.** There is no CI-only script, so a red run is reproducible by
typing the failing step's command locally. CI only ever reports: it runs `format:check` and
`lint`, never `format` or `lint:fix`, and it never commits, pushes, or tags.

| CI job     | Reproduce locally with                                                   |
| ---------- | ------------------------------------------------------------------------ |
| `quality`  | The one-liner in [Root commands](#root-commands)                         |
| `database` | `docker compose up -d database` then `pnpm test:db`                      |
| `e2e`      | `pnpm test:e2e:install` then `pnpm test:e2e`                             |
| `docker`   | `docker compose build`, `docker compose up --detach --wait`, then `curl` |

[`ci.md`](ci.md) has the per-step mapping, the caching behaviour, and the failure artifacts.

## Generated artifacts

Nothing generated is tracked, and no test or build run modifies a tracked file.

| Path                           | Produced by            |
| ------------------------------ | ---------------------- |
| `node_modules/`                | pnpm                   |
| `apps/web/.next/`              | `next build`           |
| `apps/api/dist/`               | `nest build`           |
| `apps/*/coverage/`             | Vitest and Jest        |
| `tests/e2e/test-results/`      | Playwright, on failure |
| `tests/e2e/playwright-report/` | Playwright             |
| `.turbo/`, `*/.turbo/`         | Turborepo              |
| `*.tsbuildinfo`                | TypeScript             |

All are git-ignored, ignored by Prettier, and ignored by ESLint. `pnpm clean` removes them.

If `git status` ever shows a tracked file changed after a test run, that is a bug in the test, not
a normal outcome.

## Environment variables

**DevSync loads `.env` from the repository root**, since C1. `apps/api` reads it through
`@nestjs/config`; the database and end-to-end tooling read it through `dotenv`. A value already set
in your shell always wins over the file, which is how Compose and CI keep control of their own
configuration.

```bash
cp .env.example .env               # the values Compose runs with
API_PORT=4000 pnpm --filter @devsync/api dev   # the shell still overrides
```

`.env.example` is the documented inventory: `API_PORT` (optional, defaults to 3001),
`DATABASE_URL` (**required** — the API refuses to start without it and never falls back to a
default), and `TEST_DATABASE_URL` (read only by the database and end-to-end tooling; an unset one
affects nothing else). The web application reads `PORT` and `HOSTNAME` only in its container, where
`compose.yaml` sets them.

`.env` is git-ignored, and `.dockerignore` keeps every `.env*` file out of both build contexts.
**This repository contains no secrets**: the PostgreSQL credentials in `.env.example` and
`compose.yaml` are development values for a database that runs on your own machine.

### Working with the database

The schema, the migrations, and every query live in `@devsync/database`. The commands you are
likely to need:

```bash
docker compose up -d database                              # PostgreSQL on 5433
pnpm --filter @devsync/database exec prisma migrate dev    # create a migration, locally only
pnpm --filter @devsync/database migrate:deploy             # apply committed migrations
pnpm --filter @devsync/database generate                   # regenerate Prisma Client
pnpm test:db                                               # the integration suite
```

`prisma migrate dev` is for **creating** migrations on your own machine. `prisma migrate deploy` is
what applies them everywhere else — CI, Compose, and anything production-shaped — and
`prisma db push` is not part of the workflow for the tracked schema at all. **An applied migration
is never edited**: a mistake is corrected by a new migration, because rewriting one that has
already run somewhere leaves two databases disagreeing about their own history.

You will rarely need `generate` by hand. It runs as a Turborepo task that `build`, `lint`, and
`typecheck` all depend on, so a fresh checkout type-checks and builds without anyone remembering
it. It reads the schema and never touches a database.

`pnpm test:db` drops the test schema before it runs, so it refuses to start against any database
that is not `devsync_test` — and against one that turns out to be the same database as
`DATABASE_URL`. Those refusals are the point rather than an inconvenience. The API's own
database-backed suite uses that same gate, through
`@devsync/database/test-database`, rather than carrying a second copy of the rules.

The reasoning behind all of it is in [`architecture.md`](architecture.md#phase-c--the-persistence-architecture),
the testing ladder in [`testing.md`](testing.md), and the Compose side in [`docker.md`](docker.md).

## Adding a new workspace

A `packages/*` workspace stays empty until something real needs it, and the five reserved ones
already cover the boundaries this project expects. If a genuinely new one is warranted, it has to
participate in every repository-wide command from the moment it exists:

1. Create the directory under `apps/`, `packages/`, or `tests/` — the globs in
   `pnpm-workspace.yaml` pick it up with no edit.
2. Write `package.json` with the `@devsync/*` name, `"private": true`, and `lint`, `lint:fix`,
   `typecheck`, `test`, and `clean` scripts. A workspace with nothing to test uses the same
   honest one-line `test` script the reserved packages use.
3. Extend the right configuration from `@devsync/config`: `tsconfig.package.json` for a package
   consumed as source, `tsconfig.library.json` for one that builds and runs in production,
   `tsconfig.nest.json`, `tsconfig.next.json`, or `tsconfig.playwright.json` for the others.
   Keep only `include`, `outDir`, and `paths` local.
4. Add `eslint.config.mjs` calling `createBaseConfig({ tsconfigRootDir: import.meta.dirname })`,
   or `createNestConfig` for a Nest workspace.
5. Add `@devsync/config` as a dev dependency with `workspace:*`.
6. If it introduces a new root script, add the matching task to `turbo.json` — a root script that
   calls a task Turborepo does not know about silently does nothing. Anything that starts a
   process or a browser sets `cache: false`, and anything that belongs in `pnpm test` declares no
   `dependsOn`, so the fast command keeps building nothing.
7. Run `pnpm install`, then `pnpm lint` and `pnpm typecheck`, and confirm the task count went up.
8. Update the workspace tables in `README.md` and [`architecture.md`](architecture.md).

Do not add a workspace that opts out of `lint` or `typecheck`.

## Documentation expectations

- **Documentation is updated in the same change that makes it inaccurate.** A commit that changes
  a command, a port, a workspace, or a claim about what exists carries the documentation edit
  with it.
- **`README.md` describes what exists, not what is planned.** Anything aspirational is labelled
  as planned, or lives in [`roadmap.md`](roadmap.md).
- **Each document owns its subject.** Testing detail belongs in `testing.md`, container detail in
  `docker.md`, workflow detail in `ci.md`. Other documents link rather than paraphrase, so there
  is one place to correct.
- **Record decisions in [`decisions.md`](decisions.md)** when a choice closes off an alternative
  someone would otherwise reasonably reach for — including what would justify revisiting it.

## Git workflow

Repository-level conventions only. How you structure your own commits is your business.

- **`main` is the integration branch.** Work happens on a branch and reaches `main` through a
  pull request, which is what triggers CI on it.
- **Branches are named for the milestone they serve**, e.g. `phase-a/project-foundation`.
- **`pnpm-lock.yaml` is tracked and must stay in sync with the manifests.** A change to any
  manifest commits the resulting lockfile change with it. Never commit `package-lock.json` or
  `yarn.lock`.
- **Never commit generated output.** Everything in [Generated artifacts](#generated-artifacts) is
  ignored; if one appears in `git status`, something is misconfigured.
- **The tree should be formatted and green before it is pushed.** CI runs `format:check` and
  `lint` and will not fix anything for you.
- **No secrets, ever** — not in a commit, not in `.env.example`, not in an image layer.

AI assistants working in this repository do not create commits, push branches, open pull
requests, merge, or delete branches; those operations are the maintainer's. See
[`../CLAUDE.md`](../CLAUDE.md).

## Related documents

| Document                             | Covers                                             |
| ------------------------------------ | -------------------------------------------------- |
| [`architecture.md`](architecture.md) | What exists, what is reserved, and what is planned |
| [`testing.md`](testing.md)           | The three testing layers in full                   |
| [`docker.md`](docker.md)             | Images, Compose, and container limitations         |
| [`ci.md`](ci.md)                     | The GitHub Actions workflow                        |
| [`decisions.md`](decisions.md)       | Why the tooling is what it is                      |
| [`roadmap.md`](roadmap.md)           | The milestone sequence                             |
