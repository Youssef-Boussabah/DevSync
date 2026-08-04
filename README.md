# DevSync

DevSync is a browser-based collaborative development environment: the goal is a workspace
where several developers can open the same project and edit it together in real time, with
shared files, visible presence, and sandboxed execution. This repository holds the monorepo
that product will be built in.

## Repository status

**Phase A complete — project foundation.** A0 established the monorepo and the toolchain; A1
tightened the TypeScript settings and centralised the shared configuration; A2 added the testing
architecture; A3 containerised both applications; A4 added a GitHub Actions pipeline that runs
the quality checks, the browser tests, and a full Docker build-and-verify; A5 documented the
architecture, the roadmap, the development workflow, and the decisions behind them.

**Phase B complete — local editor.** B0 put a real Monaco editor on the home page: one file, open in
one pane, with syntax highlighting and Monaco's language services running in web workers. B1 gave
that file's contents an owner — a small client workspace holding them in React state, with the
editor controlled by it rather than keeping the text to itself. B2 let the user choose which of five
languages that one file is read as — TypeScript, JavaScript, Python, JSON, or Markdown — from a
labelled selector beside the file name, with the content passed through untouched when the language
changes. B3 added the browser test that types into the real editor, and B4 reconciled the
documentation and closed the phase. That is the only product functionality in the repository.

**Phase C — database-backed projects: C0 and C1 are complete, and C2 is next.** C0 settled the data
model, the HTTP resources, the error boundary, and the package ownership. **C1 built the storage
half of it**: PostgreSQL 18 in Compose with a named volume and a one-shot migration service, Prisma
7 and the schema in `@devsync/database`, one committed migration, a data layer with 57 tests — 39
of them against a real database — and an API that loads its configuration and opens a connection
during startup.

**Nothing a user can reach touches any of it.** There is no project or file endpoint, `apps/web`
still makes no request to `apps/api`, and the editor is still one in-memory buffer that a refresh
discards. C2 adds the routes; C3 connects the browser. The ladder is in
[`docs/roadmap.md`](docs/roadmap.md); the design is in
[`docs/architecture.md`](docs/architecture.md).

What exists today:

- A pnpm + Turborepo workspace with root-level `dev`, `build`, `lint`, `lint:fix`, `typecheck`,
  `test`, `test:unit`, `test:db`, `test:e2e`, `test:all`, `test:coverage`, `format`,
  `format:check`, and `clean` commands.
- `apps/web` — a Next.js application whose home page identifies the project and hosts one Monaco
  editor over a single in-memory file, read as one of five selectable languages.
- `apps/api` — a NestJS service exposing a single `GET /health` endpoint, which validates its
  configuration and opens a PostgreSQL connection while it starts.
- `packages/database` — the schema, one committed migration, and every query, behind Prisma 7 and
  a small surface of named operations over projects and files.
- Six package boundaries under `packages/`: four deliberately empty, plus `@devsync/config` and
  `@devsync/database`.
- `tests/e2e` — a Playwright workspace that builds both applications, starts them on dedicated
  ports, and checks that each answers.
- One hundred and eighteen real tests across four layers. See [`docs/testing.md`](docs/testing.md).
- A production Docker image for each application, a migration image, and a root `compose.yaml`
  running those alongside PostgreSQL. See [`docs/docker.md`](docs/docker.md).
- A GitHub Actions pipeline with four jobs — quality, database, end-to-end, and Docker. See
  [`docs/ci.md`](docs/ci.md).
- Documentation covering the architecture, the milestone roadmap, the development workflow, and
  the decisions behind them. See [`docs/`](docs/README.md).

**Real-time collaboration has not been implemented.** Neither has multi-file project editing, a
file tree, editor tabs, remote cursors, authentication, version history, or code execution. There
is still no save action and no saved-or-unsaved state in the editor, because nothing in the
interface can reach the database: `apps/web` makes no call to `apps/api`, and refreshing the page
discards whatever was typed and returns the file to TypeScript. The five languages are five
readings of one file, not five files: nothing is detected from a name, and no content is generated
or translated when the language changes.

**Persistence exists one layer down.** PostgreSQL stores projects and files, and `@devsync/database`
can create, read, change, and delete them — but no HTTP route does, so no user can. There is still
no cache, queue, or message broker.

## Documentation

| Document                             | Covers                                                  |
| ------------------------------------ | ------------------------------------------------------- |
| [Architecture](docs/architecture.md) | What exists, what is reserved, what is planned, and why |
| [Development](docs/development.md)   | Prerequisites, commands, ports, and daily workflow      |
| [Roadmap](docs/roadmap.md)           | The milestone sequence, Phase A through Phase N         |
| [Decisions](docs/decisions.md)       | Choices already made, and what would justify revisiting |
| [Testing](docs/testing.md)           | The four testing layers and what each proves            |
| [Docker](docs/docker.md)             | Images, Compose, and container limitations              |
| [Continuous integration](docs/ci.md) | The GitHub Actions workflow and its jobs                |

## Planned architecture

The intended shape of the system. The editor and the data layer are real; **nothing else below is
built yet**:

- A Next.js client hosting a code editor, driven by a CRDT-backed shared document. The editor
  exists; the shared document does not.
- A NestJS service owning project data, access control, and the collaboration transport. It owns
  the connection to the data; the routes, the access control, and the transport are all still
  ahead.
- **A relational database reached through a single data-access package.** Built: PostgreSQL behind
  `@devsync/database`, which is the only thing in this list that is finished.
- A separate, sandboxed runner service for executing user code, isolated from the API.
- Shared contracts — types, schemas, and the collaboration protocol — published from
  `packages/shared` so client and server cannot drift apart.

Each arrives in a later milestone, and this README is updated as it does.
[`docs/architecture.md`](docs/architecture.md) separates the implemented architecture from the
reserved boundaries and the planned design; [`docs/roadmap.md`](docs/roadmap.md) is the sequence.

## Workspace layout

```text
devsync/
├── .github/
│   └── workflows/ci.yml      GitHub Actions: quality, database, end-to-end, Docker
├── apps/
│   ├── web/                  Next.js client
│   └── api/                  NestJS service
├── packages/
│   ├── database/             PostgreSQL schema, migrations, and data access
│   ├── config/               Shared development configuration
│   ├── collaboration/        Future: reusable real-time collaboration logic
│   ├── shared/               Future: shared types, schemas, and protocol
│   ├── ui/                   Future: reusable interface components
│   └── test-utils/           Future: reusable test helpers
├── docker/
│   └── postgres/initdb/      Creates the disposable test database, once
├── tests/
│   └── e2e/                  Playwright browser and full-stack smoke tests
├── docs/                     Project documentation
├── compose.yaml              Docker Compose: web, api, PostgreSQL, migrations
├── turbo.json                Turborepo task graph
├── pnpm-workspace.yaml       Workspace definition
├── prettier.config.mjs       Formatting, for the whole repository
├── CLAUDE.md                 Instructions for AI coding assistants
└── README.md
```

Each application carries its own `Dockerfile` (`apps/web/Dockerfile`, `apps/api/Dockerfile`),
both built from the repository root because a pnpm workspace cannot do a frozen install without
the root lockfile and every workspace manifest.

The six `packages/*` workspaces exist to fix the module boundaries early. Two are filled —
`@devsync/config`, which owns the shared TypeScript, ESLint, and Vitest configuration, and
`@devsync/database`, which C1 filled with the schema and the data layer. The other four export
nothing: placeholder implementations would be worse than an honest empty module, and having the
boundary already there is what made filling `@devsync/database` a matter of writing code rather
than agreeing where it should live.

## Prerequisites

- **Node.js 20.9 or newer.** Developed against Node 24.
- **pnpm 11.** Other package managers are not supported; `npm` and `yarn` must not be used.
- **Docker Engine 25 or newer with the Compose plugin — optional.** Only needed to run the
  applications in containers; nothing else in this repository requires it.

pnpm is pinned by the `packageManager` field. The simplest way to get the matching version is
Corepack, which ships with Node:

```bash
corepack enable pnpm
```

On Windows, if Corepack cannot write to the Node.js installation directory, install the shims
somewhere you own and add that directory to your `PATH`:

```bash
corepack enable pnpm --install-directory "$LOCALAPPDATA/node-corepack-bin"
```

## Installation

```bash
git clone https://github.com/Youssef-Boussabah/DevSync.git
cd DevSync
pnpm install
```

## Development commands

Run these from the repository root; Turborepo fans each one out across the workspaces.

| Command                 | What it does                                                 |
| ----------------------- | ------------------------------------------------------------ |
| `pnpm dev`              | Starts the web and API development servers                   |
| `pnpm build`            | Builds every workspace that has a build step                 |
| `pnpm lint`             | Lints all nine workspaces; never writes                      |
| `pnpm lint:fix`         | The same rules, applying every auto-fixable one              |
| `pnpm typecheck`        | Type-checks all nine workspaces                              |
| `pnpm test`             | Every in-process suite — Vitest and Jest. **No database**    |
| `pnpm test:unit`        | The Vitest layer only                                        |
| `pnpm test:db`          | Database integration tests. Needs disposable PostgreSQL      |
| `pnpm test:e2e`         | Playwright, against freshly built applications. Needs it too |
| `pnpm test:all`         | All three groups, in sequence. Needs PostgreSQL              |
| `pnpm test:coverage`    | Coverage for `apps/web` and `apps/api`                       |
| `pnpm test:e2e:install` | Downloads Chromium for Playwright; run once per machine      |
| `pnpm format`           | Formats the repository with Prettier                         |
| `pnpm format:check`     | Verifies formatting without writing                          |
| `pnpm clean`            | Removes build outputs and Turborepo caches                   |

`pnpm lint` and `pnpm format:check` are read-only. `pnpm lint:fix` and `pnpm format` are the
two commands that modify files.

[`docs/development.md`](docs/development.md) covers the same ground in more depth: workspace
filtering, generated artifacts, adding a workspace, and the repository's Git conventions.

To work on one workspace at a time:

```bash
pnpm --filter @devsync/web dev     # http://localhost:3000
pnpm --filter @devsync/api dev     # http://localhost:3001
```

Check the API is up:

```bash
curl http://localhost:3001/health
# {"status":"ok","service":"devsync-api"}
```

## Testing

Four layers, three runners, one hundred and eighteen real tests:

- **Vitest** covers `apps/web` — thirty-six component tests that render the real home page, the
  workspace, and the editor wrapper in jsdom, with Monaco itself mocked at its narrowest boundary.
- **Jest** covers `apps/api` — seventeen tests over the configuration validator, the database
  lifecycle, and `GET /health` returning the exact expected payload.
- **Vitest** covers `packages/database` — fifty-seven tests. Thirty-nine run against a **real
  PostgreSQL** with the committed migration applied first, because cascades, unique constraints,
  and transaction rollback are exactly what SQLite or a mocked client does not have. The other
  eighteen cover the safety gate that decides whether the suite may touch a database at all.
- **Playwright** covers both applications end to end — eight tests that build the applications,
  start them on ports `4310` and `4311`, and check that the page, the editor region, the language
  selector, and the endpoint answer. One of them types into the real Monaco editor in Chromium.

Workspaces with no implementation print that they have no tests and exit successfully, rather
than pretending to run a suite.

```bash
pnpm test               # fast: Vitest and Jest, no browsers, no database
docker compose up -d database
pnpm test:db            # the data layer, against real PostgreSQL
pnpm test:e2e:install   # once per machine — downloads Chromium
pnpm test:e2e           # builds both applications, then drives them in a browser
```

`pnpm test:db` drops the test schema before it runs, so it refuses to start against any database
it cannot prove is disposable.

[`docs/testing.md`](docs/testing.md) explains what each layer proves, why the API stays on Jest,
where test artifacts go, and what is deliberately not tested yet.

## Running in Docker

Both applications have a production image and can be started together from the repository root.
Docker is an additional way to run DevSync, not a replacement for `pnpm dev` — every command
above still works unchanged.

```bash
docker compose up -d --build   # build both images and start them
docker compose ps              # state and health of each service
docker compose logs -f api     # follow one service's output
docker compose down            # stop and remove the services; keeps the database volume
```

| Service    | URL                             | What it serves                            |
| ---------- | ------------------------------- | ----------------------------------------- |
| `web`      | http://127.0.0.1:3000/          | The Next.js production build              |
| `api`      | http://127.0.0.1:3001/health    | `{"status":"ok","service":"devsync-api"}` |
| `database` | `postgresql://…@127.0.0.1:5433` | PostgreSQL 18, on a named volume          |
| `migrate`  | —                               | Applies the migrations once, then exits   |

Both application images are multi-stage, install from the committed lockfile with
`--frozen-lockfile`, run the compiled output rather than a dev server, and run as the image's
non-root `node` user. The API waits for PostgreSQL to be healthy **and** for the migration to have
exited successfully, so no instance ever serves against a schema that is not there.

The application containers use the same ports as local development, so `docker compose up` and
`pnpm dev` cannot run at the same time. **PostgreSQL is published on 5433**, not 5432, so it does
not collide with a PostgreSQL you may already have installed — which also means
`docker compose up -d database` and `pnpm dev` work together, the ordinary arrangement for
development.

`docker compose down` keeps your projects; **`docker compose down --volumes` deletes them.**

[`docs/docker.md`](docs/docker.md) covers the image structure, environment variables, clean
rebuilds, and the current limitations.

## Continuous integration

One GitHub Actions workflow, [`.github/workflows/ci.yml`](.github/workflows/ci.yml), runs on
every pull request, on pushes to `main`, and on demand. Four independent jobs:

| Job        | What it proves                                                              |
| ---------- | --------------------------------------------------------------------------- |
| `quality`  | Formatting, lint, types, in-process tests, and every build                  |
| `database` | The data layer against a real PostgreSQL, with the committed migration      |
| `e2e`      | Both applications start from a real build and answer in Chromium            |
| `docker`   | Every image builds, the migration exits 0, and each service becomes healthy |

CI runs the same commands you run locally — there is no CI-only script — and it only ever
reports: `format:check` and `lint`, never `format` or `lint:fix`. The workflow holds
`contents: read` and no secrets, uses only official `actions/*`, and pushes no image anywhere.

To reproduce the `quality` job in one line:

```bash
pnpm install --frozen-lockfile && pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

[`docs/ci.md`](docs/ci.md) covers the triggers, caching, Playwright browser installation, the
failure artifacts, and the current limitations.

## Code quality

Every workspace participates in both linting and type-checking. Nothing is silently skipped,
and no generated output is linted.

| Workspace                | lint | typecheck | test                   | build    |
| ------------------------ | ---- | --------- | ---------------------- | -------- |
| `@devsync/web`           | yes  | yes       | 36 Vitest tests        | `next`   |
| `@devsync/api`           | yes  | yes       | 17 Jest tests          | `nest`   |
| `@devsync/database`      | yes  | yes       | 57, via `pnpm test:db` | `tsc`    |
| `@devsync/e2e`           | yes  | yes       | 8, via `pnpm test:e2e` | no build |
| `@devsync/collaboration` | yes  | yes       | none yet               | no build |
| `@devsync/shared`        | yes  | yes       | none yet               | no build |
| `@devsync/ui`            | yes  | yes       | none yet               | no build |
| `@devsync/test-utils`    | yes  | yes       | none yet               | no build |
| `@devsync/config`        | yes  | yes       | nothing to test        | no build |

The reserved `packages/*` libraries are consumed as TypeScript source through their `exports` map,
so they are type-checked in place and never emit — the application that imports them compiles them.
**`@devsync/database` is the exception**: it holds generated Prisma Client code and runs inside the
API's container, where there is no compiler, so it builds to `dist/` and `apps/api` depends on that
build. `@devsync/config` ships `.mjs`, which is why its type-check runs with `checkJs`.

**TypeScript.** `@devsync/config` owns a strict base and three configurations layered on top
of it, one per kind of workspace. See
[`packages/config/README.md`](packages/config/README.md) for what each one sets and for the
two places where NestJS's requirements deliberately diverge from the base.

**ESLint.** Flat config throughout. `@devsync/config` exports the shared TypeScript rules;
`apps/api` extends them with the NestJS variant, and `apps/web` composes them with
`eslint-config-next`. Rules are type-aware on `.ts`/`.tsx` and plain on tooling files such as
`postcss.config.mjs`, which live outside every tsconfig.

**Prettier.** One source of truth: `prettier.config.mjs` at the repository root, with
`.prettierignore` excluding build output. ESLint does not run Prettier as a lint rule, so
exactly one tool reformats code.

### Import aliases

- **`apps/web` uses `@/*` → `./src/*`.** Next.js resolves it identically in `next dev`,
  `next build`, and `tsc`, so it works everywhere it appears. Vitest does not read
  `tsconfig.json`, so `apps/web/vitest.config.mts` restates the same alias — one place to keep
  in step if it ever changes.
- **`apps/api` has no internal alias, on purpose.** NestJS compiles with `tsc`, and `tsc` does
  not rewrite path aliases when it emits. An alias configured in `tsconfig.json` would satisfy
  the editor and the type-check, then fail at runtime with an unresolved module. Adding one
  would mean adding a runtime resolver, which this milestone does not call for.
- **Across workspaces, import the package, not the path.** `@devsync/shared` rather than
  `../../packages/shared/src`. No such import exists yet, because no package exports anything
  yet; the rule is the policy for when one does.

## Configuration

`.env.example` is the documented inventory of the environment variables DevSync understands. Copy
it to `.env` at the repository root and it works with the Compose database as it stands:

```bash
cp .env.example .env
```

| Variable            | Required | Read by                                   |
| ------------------- | -------- | ----------------------------------------- |
| `API_PORT`          | no       | `apps/api` — defaults to 3001             |
| `DATABASE_URL`      | **yes**  | `apps/api`, passed to `@devsync/database` |
| `TEST_DATABASE_URL` | no       | `pnpm test:db` and `pnpm test:e2e` only   |

**`DATABASE_URL` has no default and never gets one.** A missing or malformed value fails startup
with a message naming the variable, because a service quietly writing to the wrong database is
worse than one that does not start. A value set in your shell always wins over the file, which is
how Compose and CI keep control of their own configuration.

`.env` is git-ignored, and `.dockerignore` keeps every `.env*` file out of both build contexts.
**This repository contains no secrets**: the PostgreSQL credentials in `.env.example` and
`compose.yaml` are development values for a database that runs on your own machine.
