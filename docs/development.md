# Development

How to install, run, test, and extend DevSync locally.

This is the practical companion to [`architecture.md`](architecture.md): what to type, in what
order, and what each command actually does. The testing, Docker, and CI documents own their
subjects in full; this one links to them rather than restating them.

## Prerequisites

| Requirement           | Why                                                          |
| --------------------- | ------------------------------------------------------------ |
| **Node.js 20.9+**     | The `engines` floor. Developed and validated against Node 24 |
| **pnpm 11**           | The only supported package manager                           |
| **Docker Engine 25+** | Optional — only to run the applications in containers        |

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

Playwright needs one extra step, once per machine, before end-to-end tests can run:

```bash
pnpm test:e2e:install
```

It is deliberately separate from every ordinary test command: it downloads roughly 300 MB into a
machine-level cache, which should be something you chose rather than a side effect.

## Root commands

Run these from the repository root. Turborepo fans each one out across the workspaces, in
dependency order, and caches what is safe to cache.

| Command                 | What it does                                                     |
| ----------------------- | ---------------------------------------------------------------- |
| `pnpm dev`              | Starts both development servers — web on 3000, API on 3001       |
| `pnpm build`            | Builds the two workspaces that have a build step                 |
| `pnpm lint`             | Lints all nine workspaces. Read-only                             |
| `pnpm lint:fix`         | The same rules, applying every auto-fixable one                  |
| `pnpm typecheck`        | Type-checks all nine workspaces                                  |
| `pnpm test`             | Every in-process suite — Vitest and Jest. No builds, no browsers |
| `pnpm test:unit`        | The Vitest layer only                                            |
| `pnpm test:e2e`         | Playwright, against freshly built applications                   |
| `pnpm test:e2e:install` | Downloads Chromium. Once per machine                             |
| `pnpm test:all`         | `test` and `test:e2e` together                                   |
| `pnpm test:coverage`    | Coverage for `apps/web` and `apps/api`                           |
| `pnpm format`           | Formats the repository with Prettier                             |
| `pnpm format:check`     | Verifies formatting. Read-only                                   |
| `pnpm clean`            | Removes build outputs, coverage, reports, and Turborepo caches   |

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

| Port   | Used by                     | When               |
| ------ | --------------------------- | ------------------ |
| `3000` | `apps/web`                  | `pnpm dev`, Docker |
| `3001` | `apps/api`                  | `pnpm dev`, Docker |
| `4310` | `apps/web` under Playwright | `pnpm test:e2e`    |
| `4311` | `apps/api` under Playwright | `pnpm test:e2e`    |

Docker uses the same pair as local development, so `docker compose up` and `pnpm dev` cannot run
at once — whichever starts second fails to bind. The end-to-end ports are separate precisely so
that `pnpm test:e2e` and `pnpm dev` can run at the same time without either noticing the other.

The only endpoint the API serves:

```bash
curl http://localhost:3001/health
# {"status":"ok","service":"devsync-api"}
```

## Testing

Three layers, three runners, forty-five real tests — Vitest in `apps/web`, Jest in `apps/api`, and
Playwright in `tests/e2e`.

```bash
pnpm test        # fast: in-process only, no builds and no browser
pnpm test:e2e    # builds both applications, starts them, drives Chromium
```

`pnpm test` is the inner loop and must stay fast, which is why nothing in it builds or launches a
browser. A workspace with no implementation prints that it has no tests and exits cleanly; that
is correct, and it stays that way until there is real behaviour to cover.

[`testing.md`](testing.md) is the full account: what each layer proves, why the API stays on
Jest, how the end-to-end suite starts its servers, where artifacts go, and what is deliberately
untested.

## Docker

```bash
docker compose up -d --build   # build both images and start them
docker compose ps              # state and health of each service
docker compose logs -f api     # follow one service
docker compose down            # stop and remove both
```

Docker is an additional way to run DevSync, not a replacement for `pnpm dev`: every command above
still works unchanged, and no test tooling or browser is ever installed into an application
image.

[`docker.md`](docker.md) covers the image structure, why both images build from the repository
root, the health checks, and the current limitations.

## Continuous integration

One workflow with three independent jobs — `quality`, `e2e`, and `docker` — running on every pull
request, on pushes to `main`, and on demand.

**CI runs the same commands you run.** There is no CI-only script, so a red run is reproducible by
typing the failing step's command locally. CI only ever reports: it runs `format:check` and
`lint`, never `format` or `lint:fix`, and it never commits, pushes, or tags.

| CI job    | Reproduce locally with                                                   |
| --------- | ------------------------------------------------------------------------ |
| `quality` | The one-liner in [Root commands](#root-commands)                         |
| `e2e`     | `pnpm test:e2e:install` then `pnpm test:e2e`                             |
| `docker`  | `docker compose build`, `docker compose up --detach --wait`, then `curl` |

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

**DevSync does not load `.env` files.** There is no configuration module, so a variable set in a
file on disk is not read by anything. Set it in your shell instead:

```bash
API_PORT=4000 pnpm --filter @devsync/api dev
```

`.env.example` is the documented inventory of what the applications understand, which is
currently one variable: `API_PORT`, read by `apps/api/src/main.ts`, defaulting to `3001`. The
web application reads `PORT` and `HOSTNAME` only in its container, where `compose.yaml` sets
them.

`.env` is git-ignored and reserved for the milestone that introduces configuration loading. This
repository contains no secrets, and none belong in it. If a future change needs one, it arrives
with the loading mechanism, the documentation, and the ignore rules together — not on its own.

### Planned — configuration and migrations in Phase C

**None of the following works yet.** There is no `DATABASE_URL`, no Prisma, no migration, and no
script for any of it; running any command in this subsection today fails, and it is written down so
that C1 implements one plan rather than three.

C1 adds two variables, and they are validated at different moments. **`DATABASE_URL` is required**:
the API and the database package read it, it is checked when that runtime starts, and a missing or
malformed value fails startup with a message naming the variable — never a silent fallback to
another database. **`TEST_DATABASE_URL` is read only by the database-backed test tooling** and
checked only when those tests run; leaving it unset is not a misconfiguration and must never stop
the API from starting. C1 adds them together with the `.env` loading this repository has
deliberately gone without, and `.env.example` gains both in the same change, with non-secret example
values.

Migrations will be created locally with `prisma migrate dev`, applied everywhere else with
`prisma migrate deploy`, committed to the repository, and treated as immutable once they have run:
a mistake is corrected by a new migration. `prisma db push` is not the workflow for the tracked
schema. Database tests will run behind their own explicit command against a database that has been
declared disposable — never `pnpm test`, which keeps building nothing and starting nothing.

The reasoning is in [`architecture.md`](architecture.md#phase-c--planned-persistence-architecture),
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
3. Extend the right configuration from `@devsync/config`: `tsconfig.package.json` for a package,
   `tsconfig.nest.json`, `tsconfig.next.json`, or `tsconfig.playwright.json` for the others.
   Keep only `include`, `outDir`, and `paths` local.
4. Add `eslint.config.mjs` calling `createBaseConfig({ tsconfigRootDir: import.meta.dirname })`,
   or `createNestConfig` for a Nest workspace.
5. Add `@devsync/config` as a dev dependency with `workspace:*`.
6. If it introduces a new root script, add the matching task to `turbo.json` — a root script that
   calls a task Turborepo does not know about silently does nothing. Anything that starts a
   process or a browser sets `cache: false`.
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
