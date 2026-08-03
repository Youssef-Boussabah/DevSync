# DevSync

DevSync is a browser-based collaborative development environment: the goal is a workspace
where several developers can open the same project and edit it together in real time, with
shared files, visible presence, and sandboxed execution. This repository holds the monorepo
that product will be built in.

## Repository status

**Phase A2 — testing foundation.** Phase A0 established the monorepo, the workspace boundaries,
and the toolchain; Phase A1 tightened the TypeScript settings and moved the shared TypeScript
and ESLint configuration into `@devsync/config`. Phase A2 adds the testing architecture: Vitest
for the frontend, Jest kept where it already works in the API, and Playwright for browser and
full-stack smoke coverage. Like A0 and A1, it deliberately ships no product functionality.

What exists today:

- A pnpm + Turborepo workspace with root-level `dev`, `build`, `lint`, `lint:fix`, `typecheck`,
  `test`, `test:unit`, `test:e2e`, `test:all`, `test:coverage`, `format`, `format:check`, and
  `clean` commands.
- `apps/web` — a minimal Next.js application whose home page identifies the project.
- `apps/api` — a minimal NestJS service exposing a single `GET /health` endpoint.
- Six package boundaries under `packages/`: five deliberately empty, plus `@devsync/config`,
  which owns the shared TypeScript and ESLint configuration.
- `tests/e2e` — a Playwright workspace that builds both applications, starts them on dedicated
  ports, and checks that each answers.
- Eight real tests across three layers. See [`docs/testing.md`](docs/testing.md).

**Real-time collaboration has not been implemented.** Neither has multi-file project editing,
remote cursors, project persistence, authentication, version history, or code execution. No
database, message broker, container setup, or CI pipeline exists in this repository yet.

## Planned architecture

The intended shape of the system, none of which is built yet:

- A Next.js client hosting a code editor, driven by a CRDT-backed shared document.
- A NestJS service owning project data, access control, and the collaboration transport.
- A relational database reached through a single data-access package.
- A separate, sandboxed runner service for executing user code, isolated from the API.
- Shared contracts — types, schemas, and the collaboration protocol — published from
  `packages/shared` so client and server cannot drift apart.

Each of these arrives in a later milestone, and this README will be updated as it does.

## Workspace layout

```text
devsync/
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
├── turbo.json                Turborepo task graph
├── pnpm-workspace.yaml       Workspace definition
├── prettier.config.mjs       Formatting, for the whole repository
├── CLAUDE.md                 Instructions for AI coding assistants
└── README.md
```

The six `packages/*` workspaces exist to fix the module boundaries early. Apart from
`@devsync/config`, which owns the shared TypeScript and ESLint configuration, they export
nothing — placeholder implementations would be worse than an honest empty module.

## Prerequisites

- **Node.js 20.9 or newer.** Developed against Node 24.
- **pnpm 11.** Other package managers are not supported; `npm` and `yarn` must not be used.

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

Three layers, three runners, eight real tests:

- **Vitest** covers `apps/web` — four component tests that render the real home page in jsdom.
- **Jest** covers `apps/api` — one HTTP-level test that boots a Nest application and checks
  `GET /health` returns the exact expected payload.
- **Playwright** covers both applications end to end — three tests that build the applications,
  start them on ports `4310` and `4311`, and check that the page and the endpoint answer.

Workspaces with no implementation print that they have no tests and exit successfully, rather
than pretending to run a suite.

```bash
pnpm test               # fast: Vitest and Jest, no browsers
pnpm test:e2e:install   # once per machine — downloads Chromium
pnpm test:e2e           # builds both applications, then drives them in a browser
```

[`docs/testing.md`](docs/testing.md) explains what each layer proves, why the API stays on Jest,
where test artifacts go, and what is deliberately not tested yet.

## Code quality

Every workspace participates in both linting and type-checking. Nothing is silently skipped,
and no generated output is linted.

| Workspace                | lint | typecheck | test                   | build    |
| ------------------------ | ---- | --------- | ---------------------- | -------- |
| `@devsync/web`           | yes  | yes       | 4 Vitest tests         | `next`   |
| `@devsync/api`           | yes  | yes       | 1 Jest test            | `nest`   |
| `@devsync/e2e`           | yes  | yes       | 3, via `pnpm test:e2e` | no build |
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
