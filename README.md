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

**Phase B in progress — local editor.** B0 put a real Monaco editor on the home page: one file,
open in one pane, with syntax highlighting and Monaco's language services running in web workers.
B1 gave that file's contents an owner — a small client workspace holding them in React state, with
the editor controlled by it rather than keeping the text to itself. That is the only product
functionality in the repository. The rest of Phase B — a language selection, and a browser test
that types into the real editor — has not been built.

What exists today:

- A pnpm + Turborepo workspace with root-level `dev`, `build`, `lint`, `lint:fix`, `typecheck`,
  `test`, `test:unit`, `test:e2e`, `test:all`, `test:coverage`, `format`, `format:check`, and
  `clean` commands.
- `apps/web` — a Next.js application whose home page identifies the project and hosts one Monaco
  editor over a single in-memory file.
- `apps/api` — a minimal NestJS service exposing a single `GET /health` endpoint.
- Six package boundaries under `packages/`: five deliberately empty, plus `@devsync/config`,
  which owns the shared TypeScript and ESLint configuration.
- `tests/e2e` — a Playwright workspace that builds both applications, starts them on dedicated
  ports, and checks that each answers.
- Twenty-nine real tests across three layers. See [`docs/testing.md`](docs/testing.md).
- A production Docker image for each application and a root `compose.yaml` that builds and runs
  both. See [`docs/docker.md`](docs/docker.md).
- A GitHub Actions pipeline with three jobs — quality, end-to-end, and Docker. See
  [`docs/ci.md`](docs/ci.md).
- Documentation covering the architecture, the milestone roadmap, the development workflow, and
  the decisions behind them. See [`docs/`](docs/README.md).

**Real-time collaboration has not been implemented.** Neither has multi-file project editing, a
file tree, editor tabs, remote cursors, project persistence, authentication, version history, or
code execution. There is no save action and no saved-or-unsaved state, because there is nowhere to
save to. The editor talks to nothing: `apps/web` still makes no call to `apps/api`, and refreshing
the page discards whatever was typed. No database or message broker exists in this repository
yet — the Compose file contains the two applications and nothing else.

## Documentation

| Document                             | Covers                                                  |
| ------------------------------------ | ------------------------------------------------------- |
| [Architecture](docs/architecture.md) | What exists, what is reserved, what is planned, and why |
| [Development](docs/development.md)   | Prerequisites, commands, ports, and daily workflow      |
| [Roadmap](docs/roadmap.md)           | The milestone sequence, Phase A through Phase N         |
| [Decisions](docs/decisions.md)       | Choices already made, and what would justify revisiting |
| [Testing](docs/testing.md)           | The three testing layers and what each proves           |
| [Docker](docs/docker.md)             | Images, Compose, and container limitations              |
| [Continuous integration](docs/ci.md) | The GitHub Actions workflow and its jobs                |

## Planned architecture

The intended shape of the system. The editor is now real; **nothing else below is built yet**:

- A Next.js client hosting a code editor, driven by a CRDT-backed shared document. The editor
  exists; the shared document does not.
- A NestJS service owning project data, access control, and the collaboration transport.
- A relational database reached through a single data-access package.
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
│   └── workflows/ci.yml      GitHub Actions: quality, end-to-end, and Docker jobs
├── apps/
│   ├── web/                  Next.js client
│   └── api/                  NestJS service
├── packages/
│   ├── collaboration/        Future: reusable real-time collaboration logic
│   ├── database/             Future: schema and data access
│   ├── shared/               Future: shared types, schemas, and protocol
│   ├── ui/                   Future: reusable interface components
│   ├── config/               Shared development configuration
│   └── test-utils/           Future: reusable test helpers
├── tests/
│   └── e2e/                  Playwright browser and full-stack smoke tests
├── docs/                     Project documentation
├── compose.yaml              Docker Compose: the web and API services
├── turbo.json                Turborepo task graph
├── pnpm-workspace.yaml       Workspace definition
├── prettier.config.mjs       Formatting, for the whole repository
├── CLAUDE.md                 Instructions for AI coding assistants
└── README.md
```

Each application carries its own `Dockerfile` (`apps/web/Dockerfile`, `apps/api/Dockerfile`),
both built from the repository root because a pnpm workspace cannot do a frozen install without
the root lockfile and every workspace manifest.

The six `packages/*` workspaces exist to fix the module boundaries early. Apart from
`@devsync/config`, which owns the shared TypeScript and ESLint configuration, they export
nothing — placeholder implementations would be worse than an honest empty module.

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

| Command                 | What it does                                              |
| ----------------------- | --------------------------------------------------------- |
| `pnpm dev`              | Starts the web and API development servers                |
| `pnpm build`            | Builds every workspace that has a build step              |
| `pnpm lint`             | Lints all nine workspaces; never writes                   |
| `pnpm lint:fix`         | The same rules, applying every auto-fixable one           |
| `pnpm typecheck`        | Type-checks all nine workspaces                           |
| `pnpm test`             | Every in-process suite — Vitest and Jest, no browsers     |
| `pnpm test:unit`        | The Vitest layer only                                     |
| `pnpm test:e2e`         | Playwright, against freshly built applications            |
| `pnpm test:all`         | `test` and `test:e2e` together                            |
| `pnpm test:coverage`    | Coverage for the two workspaces that have code to measure |
| `pnpm test:e2e:install` | Downloads Chromium for Playwright; run once per machine   |
| `pnpm format`           | Formats the repository with Prettier                      |
| `pnpm format:check`     | Verifies formatting without writing                       |
| `pnpm clean`            | Removes build outputs and Turborepo caches                |

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

Three layers, three runners, twenty-nine real tests:

- **Vitest** covers `apps/web` — twenty-four component tests that render the real home page, the
  workspace, and the editor wrapper in jsdom, with Monaco itself mocked at its narrowest boundary.
- **Jest** covers `apps/api` — one HTTP-level test that boots a Nest application and checks
  `GET /health` returns the exact expected payload.
- **Playwright** covers both applications end to end — four tests that build the applications,
  start them on ports `4310` and `4311`, and check that the page, the editor region, and the
  endpoint answer.

Workspaces with no implementation print that they have no tests and exit successfully, rather
than pretending to run a suite.

```bash
pnpm test               # fast: Vitest and Jest, no browsers
pnpm test:e2e:install   # once per machine — downloads Chromium
pnpm test:e2e           # builds both applications, then drives them in a browser
```

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
docker compose down            # stop and remove both
```

| Service | URL                          | What it serves                            |
| ------- | ---------------------------- | ----------------------------------------- |
| `web`   | http://127.0.0.1:3000/       | The Next.js production build              |
| `api`   | http://127.0.0.1:3001/health | `{"status":"ok","service":"devsync-api"}` |

Both images are multi-stage, install from the committed lockfile with `--frozen-lockfile`, run
the compiled output rather than a dev server, and run as the image's non-root `node` user. Each
service declares a health check that proves the HTTP application answers.

The containers use the same ports as local development, so `docker compose up` and `pnpm dev`
cannot run at the same time. **The Compose file contains the two applications and nothing
else** — no database, cache, queue, or volume, because DevSync uses none of them yet.

[`docs/docker.md`](docs/docker.md) covers the image structure, environment variables, clean
rebuilds, and the current limitations.

## Continuous integration

One GitHub Actions workflow, [`.github/workflows/ci.yml`](.github/workflows/ci.yml), runs on
every pull request, on pushes to `main`, and on demand. Three independent jobs:

| Job       | What it proves                                                             |
| --------- | -------------------------------------------------------------------------- |
| `quality` | Formatting, lint, types, in-process tests, and both builds                 |
| `e2e`     | Both applications start from a real build and answer in Chromium           |
| `docker`  | Both images build, start, become healthy, and serve the expected responses |

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
| `@devsync/web`           | yes  | yes       | 24 Vitest tests        | `next`   |
| `@devsync/api`           | yes  | yes       | 1 Jest test            | `nest`   |
| `@devsync/e2e`           | yes  | yes       | 4, via `pnpm test:e2e` | no build |
| `@devsync/collaboration` | yes  | yes       | none yet               | no build |
| `@devsync/database`      | yes  | yes       | none yet               | no build |
| `@devsync/shared`        | yes  | yes       | none yet               | no build |
| `@devsync/ui`            | yes  | yes       | none yet               | no build |
| `@devsync/test-utils`    | yes  | yes       | none yet               | no build |
| `@devsync/config`        | yes  | yes       | nothing to test        | no build |

The `packages/*` libraries are consumed as TypeScript source through their `exports` map, so
they are type-checked in place and never emit — the application that imports them compiles
them. `@devsync/config` ships `.mjs`, which is why its type-check runs with `checkJs`.

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

`.env.example` is the documented inventory of the environment variables DevSync understands.
That is currently exactly one: `API_PORT`, which the NestJS service reads on startup and
which defaults to `3001`.

There is no configuration module yet, so **`.env` files are not loaded automatically**. Set
the variable in your shell instead:

```bash
API_PORT=4000 pnpm --filter @devsync/api dev
```

The Playwright suite follows the same rule: it sets `API_PORT` through its `webServer`
configuration rather than expecting a file on disk to be read.

`.env` is git-ignored and reserved for the milestone that introduces configuration loading.
This repository contains no secrets, credentials, or external service configuration.
