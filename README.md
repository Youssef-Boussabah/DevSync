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
documentation and closed the phase. At Phase B's close that was the only product functionality in
the repository, and nothing it held survived a reload.

**Phase C complete — database-backed projects.** C0
settled the data model, the HTTP resources, the error boundary, and the package ownership. **C1 built
the storage half of it**: PostgreSQL 18 in Compose with a named volume and a one-shot migration
service, Prisma 7 and the schema in `@devsync/database`, one committed migration, a data layer with
57 tests, and an API that loads its configuration and opens a connection during startup. **C2 put an
HTTP surface on it**: ten routes over projects and the files inside them, request validation against
Zod schemas published from `@devsync/shared`, one error shape from every route, and 110 integration
tests against a real Nest application and a real database. **C3 connected the browser**: the first
call `apps/web` has ever made to `apps/api`, a project list, a project workspace, an explicit save,
and 14 Playwright tests that create, edit, save, reload, and delete through a real browser. **C4
proved the data outlives the processes holding it**, automatically and through the public API rather
than at C1's data-access edge: one command that brings the production images up in a Compose project
of its own, restarts the API, stops PostgreSQL underneath it, brings it back without restarting the
API, and redeploys the committed migration over populated rows — comparing every field of a fixture
after each. **C5 audited the phase and closed it**: the implementation matched the C0 contract row
for row, so no schema change and no second migration were needed, and the four defects the audit did
find — two Dockerfiles that had not been told about C4's workspace, a CI document describing action
versions that were never published, four `.mjs` files whose `// @ts-check` was never actually run,
and a Vitest workspace that was vanishing from `pnpm test:unit` — were corrected together. **The
pull-request reruns then failed C4's outage scenario in CI**, twice, on driver-specific paths no
lower-level suite covered deterministically; C4's container-level outage scenario caught both. The
first request during the outage answered `500` instead of `503`, because a database that cannot be
reached arrives at the data layer in more than one shape — sometimes as a PostgreSQL SQLSTATE nested
in driver metadata, and sometimes, on a Linux runner, as nothing but an operating-system error code
on the exception itself. Both shapes were captured from the production image and reproduced
deterministically, the classifier was rewritten to read the whole exception rather than one property
of it, and the eighty-three tests that now hold the rules run in the fast command.

**Phase D — rooms and presence — is next.**

**A person can now use it.** Open the application, create a project, edit its `main.ts`, press Save,
reload — the work is still there, because it is in PostgreSQL. Restart the containers and it is still
there. The ladder is in [`docs/roadmap.md`](docs/roadmap.md); the design is in
[`docs/architecture.md`](docs/architecture.md).

What exists today:

- A pnpm + Turborepo workspace with root-level `dev`, `build`, `lint`, `lint:fix`, `typecheck`,
  `test`, `test:unit`, `test:db`, `test:e2e`, `test:restart`, `test:all`, `test:coverage`, `format`,
  `format:check`, and `clean` commands.
- `apps/web` — a Next.js application with two routes: a project list, and a project workspace that
  opens one file at a time in Monaco with an explicit Save.
- `apps/api` — a NestJS service serving `GET /health` plus five project routes and five nested
  project-file routes, which validates its configuration, opens a PostgreSQL connection while it
  starts, and answers cross-origin requests from exactly one configured origin.
- `packages/database` — the schema, one committed migration, and every query, behind Prisma 7 and
  a small surface of named operations over projects and files.
- `packages/shared` — the request, response, and error contracts both applications agree on, as
  Zod 4 schemas with the TypeScript types inferred from them. **Both applications consume it**, and
  neither declares Zod.
- Six package boundaries under `packages/`: three deliberately empty, plus `@devsync/config`,
  `@devsync/database`, and `@devsync/shared`.
- `tests/e2e` — a Playwright workspace that resets a disposable database, builds both applications,
  starts them on dedicated ports, and drives the whole persistence flow in Chromium.
- `tests/restart` — the C4 validation: it brings the production images up in a Compose project of its
  own, restarts containers, takes the database away from a running API, and redeploys the committed
  migration over existing rows, comparing every field of a fixture after each.
- Six hundred and fifty real tests across seven layers, plus six restart scenarios. See
  [`docs/testing.md`](docs/testing.md).
- A production Docker image for each application, a migration image, and a root `compose.yaml`
  running those alongside PostgreSQL. See [`docs/docker.md`](docs/docker.md).
- A GitHub Actions pipeline with four jobs — quality, database, end-to-end, and Docker. See
  [`docs/ci.md`](docs/ci.md).
- Documentation covering the architecture, the milestone roadmap, the development workflow, and
  the decisions behind them. See [`docs/`](docs/README.md).

**Real-time collaboration has not been implemented.** Neither has authentication, version history,
code execution, a file tree, editor tabs, or remote cursors. A second browser sees your work only
after it reloads, and two people editing the same file at once is undefined behaviour.

**Saving is explicit.** A change reaches the database when you press Save and at no other time:
there is no autosave, and nothing is kept in browser storage — no `localStorage`, no
`sessionStorage`, no IndexedDB. The interface says which of saved, unsaved changes, saving, and save
failed it is in, and it asks before discarding an unsaved draft.

**Every request is anonymous** — there are no accounts and no authorization — so the API is safe only
on a machine you control, and nothing in Phase C may be deployed where an untrusted client can reach
it. The CORS configuration C3 added constrains browsers; it is not access control. There is still no
cache, queue, or message broker.

**Restart survival is proved, and nothing beyond it is.** `pnpm test:restart` shows that a saved
project and its files come back unchanged after the API container restarts, after PostgreSQL
restarts, and after the committed migration is redeployed over them — and that a request made while
the database is away answers `503 DATABASE_UNAVAILABLE` rather than crashing, hanging, or leaking a
stack trace, with the same API process recovering on its own afterwards. **There is no backup, no
restore, no replication, no failover, no high availability, and no automatic retry**, and this is
still not deployable anywhere an untrusted client can reach it.

## Documentation

| Document                             | Covers                                                  |
| ------------------------------------ | ------------------------------------------------------- |
| [Architecture](docs/architecture.md) | What exists, what is reserved, what is planned, and why |
| [Development](docs/development.md)   | Prerequisites, commands, ports, and daily workflow      |
| [Roadmap](docs/roadmap.md)           | The milestone sequence, Phase A through Phase N         |
| [Decisions](docs/decisions.md)       | Choices already made, and what would justify revisiting |
| [Testing](docs/testing.md)           | The seven testing layers and what each proves           |
| [Docker](docs/docker.md)             | Images, Compose, and container limitations              |
| [Continuous integration](docs/ci.md) | The GitHub Actions workflow and its jobs                |

## Planned architecture

The intended shape of the system. The editor, the data layer, and the API over it are real;
**nothing else below is built yet**:

- A Next.js client hosting a code editor, driven by a CRDT-backed shared document. **The editor and
  the client exist**; the shared document does not.
- A NestJS service owning project data, access control, and the collaboration transport. **It owns
  the project data**; the access control and the transport are still ahead.
- **A relational database reached through a single data-access package.** Built: PostgreSQL behind
  `@devsync/database`.
- A separate, sandboxed runner service for executing user code, isolated from the API.
- Shared contracts — types, schemas, and eventually the collaboration protocol — published from
  `packages/shared` so client and server cannot drift apart. **The HTTP half exists and both
  applications consume it**; the collaboration protocol does not exist.

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
│   ├── shared/               Request, response, and error contracts
│   ├── config/               Shared development configuration
│   ├── collaboration/        Future: reusable real-time collaboration logic
│   ├── ui/                   Future: reusable interface components
│   └── test-utils/           Future: reusable test helpers
├── docker/
│   └── postgres/initdb/      Creates the disposable test database, once
├── tests/
│   ├── e2e/                  Playwright browser and full-stack smoke tests
│   └── restart/              C4 restart, outage, and migration-redeploy validation
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

The six `packages/*` workspaces exist to fix the module boundaries early. Three are filled —
`@devsync/config`, which owns the shared TypeScript, ESLint, and Vitest configuration;
`@devsync/database`, which C1 filled with the schema and the data layer; and `@devsync/shared`,
which C2 filled with the contracts the API validates against. The other three export nothing:
placeholder implementations would be worse than an honest empty module, and having the boundary
already there is what made filling each of the first three a matter of writing code rather than
agreeing where it should live.

## Prerequisites

- **Node.js 20.9 or newer.** Developed against Node 24.
- **pnpm 11.** Other package managers are not supported; `npm` and `yarn` must not be used.
- **Docker Engine 25 or newer with the Compose plugin.** PostgreSQL runs in a container, so
  `pnpm test:db`, `pnpm test:e2e`, `pnpm test:restart`, and running the API all need it. `pnpm test`,
  `pnpm lint`, `pnpm typecheck`, and `pnpm build` do not.

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

| Command                 | What it does                                                       |
| ----------------------- | ------------------------------------------------------------------ |
| `pnpm dev`              | Starts the web and API development servers                         |
| `pnpm build`            | Builds every workspace that has a build step                       |
| `pnpm lint`             | Lints all ten workspaces; never writes                             |
| `pnpm lint:fix`         | The same rules, applying every auto-fixable one                    |
| `pnpm typecheck`        | Type-checks all ten workspaces                                     |
| `pnpm test`             | Every in-process source suite. **Builds nothing, starts nothing**  |
| `pnpm test:unit`        | The Vitest layer only — 392 of the 469                             |
| `pnpm test:db`          | The data layer, then the API's routes. Needs disposable PostgreSQL |
| `pnpm test:e2e`         | Playwright, against freshly built applications. Needs it too       |
| `pnpm test:restart`     | C4's restart and outage scenarios, in containers. **Needs Docker** |
| `pnpm test:all`         | All three groups, in sequence. Needs PostgreSQL                    |
| `pnpm test:coverage`    | Coverage for `apps/web` and `apps/api`                             |
| `pnpm test:e2e:install` | Downloads Chromium for Playwright; run once per machine            |
| `pnpm format`           | Formats the repository with Prettier                               |
| `pnpm format:check`     | Verifies formatting without writing                                |
| `pnpm clean`            | Removes build outputs and Turborepo caches                         |

`pnpm lint` and `pnpm format:check` are read-only. `pnpm lint:fix` and `pnpm format` are the
two commands that modify files.

[`docs/development.md`](docs/development.md) covers the same ground in more depth: workspace
filtering, generated artifacts, adding a workspace, and the repository's Git conventions.

To work on one workspace at a time:

```bash
pnpm --filter @devsync/web dev     # http://localhost:3000
pnpm --filter @devsync/api dev     # http://localhost:3001
```

Then open **http://127.0.0.1:3000** and create a project. Use that address rather than
`localhost:3000`: to a browser they are different origins, and the API allows exactly the one in
`WEB_ORIGIN`.

The same routes are reachable from an HTTP client:

```bash
curl http://localhost:3001/health
# {"status":"ok","service":"devsync-api"}

curl -X POST http://localhost:3001/projects \
  -H 'Content-Type: application/json' -d '{"name":"My project"}'
# 201, the project and the main.ts it was created with
```

## Testing

Seven layers, six hundred and fifty real tests, plus six restart scenarios:

- **Vitest** covers `packages/shared` — one hundred tests over the schemas both applications agree
  on: trimming, length boundaries, defaults, strictness, the language list, the identifier and
  timestamp formats, and the error contract.
- **Vitest** covers `apps/web` — one hundred and fifty-one tests over the home page, the project
  list, the project workspace, the typed API client and its configuration, the language metadata,
  the draft model, and the editor wrapper, in jsdom, with `fetch` and Monaco replaced at their
  narrowest boundaries.
- **Jest** covers `apps/api` twice. Seventy-seven fast tests over the configuration validator, the
  CORS policy, the database lifecycle, `GET /health`, the validation pipes, the storage-to-wire
  mappers, and the error boundary — including every persistence failure mapped to its documented
  status and code, proved by making the data layer fail on purpose. **One hundred and ten more run
  the real `AppModule` over a real PostgreSQL**, covering every route and every failure the contract
  names.
- **Vitest** covers `packages/database` twice. Eighty-three fast tests over failure classification —
  which driver errors mean the database is unavailable, which mean it answered and refused, how far
  into an exception the answer is looked for, and that no message reaching a caller carries SQL, a
  table name, or a connection string. They need no database and no generated client, which is the
  point: a PostgreSQL outage reaching the API as `500` rather than `503` was a pure rule whose
  missing cases were first exposed by the container-level outage scenario, and these tests are what
  hold it now. **Fifty-seven more need
  a real database.** Thirty-nine run against a **real PostgreSQL** with the committed migration
  applied first, because cascades, unique constraints, and transaction rollback are exactly what
  SQLite or a mocked client does not have. The other eighteen cover the safety gate that decides
  whether the suite may touch a database at all.
- **Playwright** covers the whole stack — fourteen tests against a real web build, a real API, and a
  real disposable PostgreSQL. They create a project, type into the real Monaco editor, save, reload,
  and find the work unchanged; add, rename, retype, and delete files; rename and delete projects; and
  check that a duplicate file name is refused with a message beside the field.
- **A Node runner** covers restarts — six scenarios against the production images under Docker
  Compose, in a project of its own. It creates a project and two files through the public HTTP
  routes, then restarts the API, stops PostgreSQL underneath it, brings PostgreSQL back **without**
  restarting the API, and redeploys the committed migration over the populated volume — comparing
  every field of the fixture after each, and asserting that the outage answers `503
DATABASE_UNAVAILABLE` with nothing about the machinery behind it. This is the layer above the data
  layer's own connection-lifecycle tests: those stop the client, this stops the server. **Vitest**
  covers that harness's own guards, redaction, bounded waiting, and comparison, in fifty-eight tests
  that reach nothing.

Workspaces with no implementation print that they have no tests and exit successfully, rather
than pretending to run a suite.

```bash
pnpm test               # 469, fast: Vitest and Jest over source. Builds nothing, starts nothing
docker compose up -d database
pnpm test:db            # 167, the data layer then the API's routes, against real PostgreSQL
pnpm test:e2e:install   # once per machine — downloads Chromium
pnpm test:e2e           # 14, resets the test database, builds both apps, then drives a browser
pnpm test:restart       # 6 scenarios, in containers. Needs Docker; touches no development data
```

`pnpm test` runs only in-process source-level suites: no workspace build, no Prisma generation, no
database, browser, server, or container. `pnpm clean && pnpm test` passes with every build output
still absent.

`pnpm test:db` runs its two suites in sequence, because they reset the same schema. Both drop that
schema before they run, so both refuse to start against any database they cannot prove is
disposable.

`pnpm test:restart` is separate from `pnpm test:all` because it is the one command that needs a
Docker daemon rather than a running PostgreSQL. It works in its own Compose project,
`devsync-c4-validation`, on ports 4321 and 5434, removes that project and its volume afterwards, and
refuses in code to issue a Compose command against anything else — your containers and your
`devsync_postgres_data` volume are never touched.

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
| `api`      | http://127.0.0.1:3001/projects  | Projects and the files inside them        |
| `database` | `postgresql://…@127.0.0.1:5433` | PostgreSQL 18, on a named volume          |
| `migrate`  | —                               | Applies the migrations once, then exits   |

**Open the stack at `http://127.0.0.1:3000`**, not `localhost`: the API allows exactly one browser
origin, and those two are different ones.

Both application images are multi-stage, install from the committed lockfile with
`--frozen-lockfile`, run the compiled output rather than a dev server, and run as the image's
non-root `node` user. The API waits for PostgreSQL to be healthy **and** for the migration to have
exited successfully, so no instance ever serves against a schema that is not there, and `web` waits
for a healthy `api`. The browser API URL is a **build argument**, because `next build` embeds it —
which is why it is the host-published address rather than the Compose service name.

The application containers use the same ports as local development, so `docker compose up` and
`pnpm dev` cannot run at the same time. **PostgreSQL is published on 5433**, not 5432, so it does
not collide with a PostgreSQL you may already have installed — which also means
`docker compose up -d database` and `pnpm dev` work together, the ordinary arrangement for
development.

`docker compose down` keeps your projects; **`docker compose down --volumes` deletes them.** C4
proves the first half of that rather than asserting it: `pnpm test:restart` restarts both containers,
redeploys the migration over the rows, and finds every field of its fixture unchanged.

The three published ports are `WEB_HOST_PORT`, `API_HOST_PORT`, and `POSTGRES_HOST_PORT`, defaulting
to the values above. Nothing needs to set them; the restart validation does, so that its stack and
yours can run at once.

[`docs/docker.md`](docs/docker.md) covers the image structure, environment variables, clean
rebuilds, and the current limitations.

## Continuous integration

One GitHub Actions workflow, [`.github/workflows/ci.yml`](.github/workflows/ci.yml), runs on
every pull request, on pushes to `main`, and on demand. Four independent jobs:

| Job        | What it proves                                                         |
| ---------- | ---------------------------------------------------------------------- |
| `quality`  | Formatting, lint, types, in-process tests, and every build             |
| `database` | The data layer **and** the API's routes against a real PostgreSQL      |
| `e2e`      | Both applications start from a real build and answer in Chromium       |
| `docker`   | Every image builds and becomes healthy, and the data survives restarts |

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

| Workspace                | lint | typecheck | test                                                | build    |
| ------------------------ | ---- | --------- | --------------------------------------------------- | -------- |
| `@devsync/web`           | yes  | yes       | 151 Vitest tests                                    | `next`   |
| `@devsync/api`           | yes  | yes       | 77 Jest, plus 110 via `test:db`                     | `nest`   |
| `@devsync/database`      | yes  | yes       | 83 Vitest, plus 57 via `pnpm test:db`               | `tsc`    |
| `@devsync/shared`        | yes  | yes       | 100 Vitest tests                                    | `tsc`    |
| `@devsync/e2e`           | yes  | yes       | 14, via `pnpm test:e2e`                             | no build |
| `@devsync/restart`       | yes  | yes       | 58 Vitest, plus 6 scenarios via `pnpm test:restart` | no build |
| `@devsync/collaboration` | yes  | yes       | none yet                                            | no build |
| `@devsync/ui`            | yes  | yes       | none yet                                            | no build |
| `@devsync/test-utils`    | yes  | yes       | none yet                                            | no build |
| `@devsync/config`        | yes  | yes       | nothing to test                                     | no build |

The reserved `packages/*` libraries are consumed as TypeScript source through their `exports` map,
so they are type-checked in place and never emit — the application that imports them compiles them.
**`@devsync/database` and `@devsync/shared` are the exceptions**: both run inside the API's
container, where there is no compiler, so both build to `dist/` and `apps/api` depends on those
builds. `@devsync/config` ships `.mjs` and `@devsync/restart` is a `.mjs` harness, which is why both
type-check with `checkJs`.

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
  `../../packages/shared/src`. `apps/api` imports both `@devsync/database` and `@devsync/shared`
  this way, and nothing in the repository reaches across a workspace boundary with a relative path.

## Configuration

`.env.example` is the documented inventory of the environment variables DevSync understands. Copy
it to `.env` at the repository root and it works with the Compose database as it stands:

```bash
cp .env.example .env
```

| Variable              | Required | Read by                                   |
| --------------------- | -------- | ----------------------------------------- |
| `API_PORT`            | no       | `apps/api` — defaults to 3001             |
| `DATABASE_URL`        | **yes**  | `apps/api`, passed to `@devsync/database` |
| `WEB_ORIGIN`          | **yes**  | `apps/api` — the one origin CORS allows   |
| `NEXT_PUBLIC_API_URL` | **yes**  | `apps/web`, **while it builds**           |
| `TEST_DATABASE_URL`   | no       | `pnpm test:db` and `pnpm test:e2e` only   |
| `WEB_HOST_PORT`       | no       | `compose.yaml` only — defaults to 3000    |
| `API_HOST_PORT`       | no       | `compose.yaml` only — defaults to 3001    |
| `POSTGRES_HOST_PORT`  | no       | `compose.yaml` only — defaults to 5433    |

The last three move the **published** side of the Compose ports and nothing else; no container ever
sees one, each defaults to the value it has always had, and `.env.example` carries them commented
out. They exist so `pnpm test:restart` can publish a second copy of the stack beside yours.

**None of the three required values has a default, and none ever gets one.** A missing or malformed
value fails startup — or, for the web variable, the build — with a message naming it, because a
service quietly writing to the wrong database, answering a site nobody configured, or calling an API
nobody chose is worse than one that does not start. A value set in your shell always wins over the
file, which is how Compose and CI keep control of their own configuration.

**`NEXT_PUBLIC_API_URL` is embedded by `next build`**, so changing it means rebuilding — and
`NEXT_PUBLIC_` means public: no server-only value may ever be given such a name.

`.env` is git-ignored, and `.dockerignore` keeps every `.env*` file out of both build contexts.
**This repository contains no secrets**: the PostgreSQL credentials in `.env.example` and
`compose.yaml` are development values for a database that runs on your own machine.
