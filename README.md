# DevSync

DevSync is a browser-based collaborative development environment: the goal is a workspace
where several developers can open the same project and edit it together in real time, with
shared files, visible presence, and sandboxed execution. This repository holds the monorepo
that product will be built in.

## Repository status

**Phase A0 — repository foundation.** This milestone establishes the monorepo, the workspace
boundaries, and the toolchain. It deliberately ships no product functionality.

What exists today:

- A pnpm + Turborepo workspace with root-level `dev`, `build`, `lint`, `typecheck`, `test`,
  `format`, `format:check`, and `clean` commands.
- `apps/web` — a minimal Next.js application whose home page identifies the project.
- `apps/api` — a minimal NestJS service exposing a single `GET /health` endpoint.
- Six empty-by-design package boundaries under `packages/`.

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
├── docs/                     Project documentation
├── turbo.json                Turborepo task graph
├── pnpm-workspace.yaml       Workspace definition
├── CLAUDE.md                 Instructions for AI coding assistants
└── README.md
```

The six `packages/*` workspaces exist to fix the module boundaries early. Apart from
`@devsync/config`, which owns the shared TypeScript base, they export nothing — placeholder
implementations would be worse than an honest empty module.

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

| Command             | What it does                                 |
| ------------------- | -------------------------------------------- |
| `pnpm dev`          | Starts the web and API development servers   |
| `pnpm build`        | Builds every workspace that has a build step |
| `pnpm lint`         | Lints `apps/web` and `apps/api`              |
| `pnpm typecheck`    | Type-checks every TypeScript workspace       |
| `pnpm test`         | Runs the test suites                         |
| `pnpm format`       | Formats the repository with Prettier         |
| `pnpm format:check` | Verifies formatting without writing          |
| `pnpm clean`        | Removes build outputs and Turborepo caches   |

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

`pnpm test` currently runs one real test — the `GET /health` check in `apps/api`. Workspaces
with no tests print that fact and exit successfully rather than pretending to run a suite.

## Configuration

`.env.example` is the documented inventory of the environment variables DevSync understands.
In Phase A0 that is exactly one: `API_PORT`, which the NestJS service reads on startup and
which defaults to `3001`.

There is no configuration module yet, so **`.env` files are not loaded automatically**. Set
the variable in your shell instead:

```bash
API_PORT=4000 pnpm --filter @devsync/api dev
```

`.env` is git-ignored and reserved for the milestone that introduces configuration loading.
This repository contains no secrets, credentials, or external service configuration.
