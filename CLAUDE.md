# CLAUDE.md

Durable working instructions for AI assistants in this repository.

## Project

DevSync is a browser-based collaborative development environment. This repository is the
monorepo it is being built in.

## Monorepo layout

- `apps/web` — Next.js client (`@devsync/web`).
- `apps/api` — NestJS service (`@devsync/api`).
- `packages/collaboration` — reusable real-time collaboration logic.
- `packages/database` — PostgreSQL schema, migrations, and data access.
- `packages/shared` — request, response, and error contracts, as Zod schemas with the types
  inferred from them. It and `packages/database` are the only `packages/*` workspaces that build,
  because both run in production.
- `packages/ui` — reusable interface components.
- `packages/config` — shared development configuration.
- `packages/test-utils` — reusable test helpers.
- `tests/e2e` (`@devsync/e2e`) — Playwright browser and full-stack tests.
- `docs/` — project documentation.

Code shared by more than one workspace belongs in `packages/`, not duplicated across apps.
A `packages/*` workspace stays empty until something real needs it; do not populate one with
placeholder classes, stub functions, or speculative types.

## Package manager

pnpm only, at the version pinned in the root `packageManager` field. Never run `npm` or `yarn`
against this repository, and never commit a `package-lock.json` or `yarn.lock`.
`pnpm-lock.yaml` is a tracked file and must stay in sync with the manifests.

Add a dependency only when something in the repository uses it now.

## TypeScript

Strict mode everywhere. Do not introduce `any` to make an error go away, and do not silence
errors with `@ts-ignore`, `@ts-expect-error`, or by disabling a lint rule — fix the underlying
type.

Every workspace extends a configuration from `@devsync/config`, which owns the strictness
settings: `tsconfig.package.json` for the `packages/*` that emit nothing,
`tsconfig.library.json` for `packages/database` and `packages/shared`, which do emit,
`tsconfig.nest.json` for `apps/api`, `tsconfig.next.json` for `apps/web`,
`tsconfig.playwright.json` for `tests/e2e`. A workspace's own `tsconfig.json` should only hold what
is genuinely local to it — `include`, `outDir`, `paths`, the `next` plugin. If a compiler
option belongs to more than one workspace, it belongs in `@devsync/config`.

Two overrides there are load-bearing and must not be "tidied up": `tsconfig.nest.json`
deliberately omits `verbatimModuleSyntax` and `lib`, because `emitDecoratorMetadata` needs
injected classes to survive as values. `packages/config/README.md` explains why.

## Quality configuration

- **ESLint** is flat config only. Shared rules live in `@devsync/config/eslint/base`, with
  `@devsync/config/eslint/nest` layered on for `apps/api`. `apps/web` composes the shared
  rules with `eslint-config-next`. Add a rule in `@devsync/config`, not in a workspace.
- **Prettier** is configured once, in `prettier.config.mjs` at the root. Do not add a second
  Prettier config anywhere, and do not run Prettier as an ESLint rule.
- **`pnpm lint` and `pnpm format:check` must stay read-only.** `pnpm lint:fix` and
  `pnpm format` are the only commands that may modify files.
- Every TypeScript workspace participates in `lint` and `typecheck`. Do not add a workspace
  that opts out of either, and do not silence a rule repository-wide to make a command pass.

## Import aliases

`apps/web` uses `@/*` → `./src/*`; Next.js resolves it at type-check, dev, and build time.

`apps/api` has no internal alias on purpose: `tsc` does not rewrite path aliases when it
emits, so one would work in the editor and fail at runtime. Do not add an alias to `apps/api`
without also adding the runtime resolution that makes it real.

Across workspaces, import the package (`@devsync/shared`), never a deep relative path.

## Testing

Tests must exercise real behaviour. Never add a test that asserts something trivially true in
order to make a command pass. A workspace with nothing worth testing yet is expected to say so
and exit cleanly, which is what its `test` script already does — leave it that way until there
is real behaviour to cover.

Three runners, each with a boundary:

- **Vitest** — `apps/web`, `packages/database`, `packages/shared`, and any other `packages/*` that
  gains testable code. jsdom for components, Node for packages. Runner-agnostic configuration lives
  in `@devsync/config/vitest/base`.
- **Jest** — `apps/api` only, in two suites: `*.spec.ts` under `src` for the fast one, and
  `tests/*.db-spec.ts` under its own configuration for the PostgreSQL-backed one. Jest stays there
  because `@nestjs/testing` targets Jest's API and `ts-jest` already honours
  `emitDecoratorMetadata`. Do not migrate it for uniformity; a migration needs a concrete
  technical reason. The database suite runs through `node --experimental-vm-modules` because
  Prisma 7 loads its query compiler with a dynamic `import()`; do not remove that flag.
- **Playwright** — `tests/e2e` only, and it is the only layer allowed to start real processes.
  Chromium only for now. Do not add a second browser-testing framework.

`pnpm test` must stay fast: in-process source-level suites only. It performs **no workspace build
and no Prisma generation**, and starts no database, browser, server, or container — `pnpm clean`
followed by `pnpm test` has to pass with `packages/*/dist`, `packages/database/src/generated`, and
`apps/api/dist` still absent afterwards. `test`, `test:unit`, and `test:coverage` therefore declare
**no `dependsOn`** in `turbo.json`; do not add `^build` back to any of them.

What makes that possible is `apps/api/jest.config.mjs`: it maps `@devsync/shared` to
`packages/shared/src/index.ts` and `@devsync/database` to `packages/database/src/contracts.ts`, with
`tsconfig.test.json` carrying the matching `paths` so ts-jest type-checks against the same sources.
Those are the real modules, not copies. **Production is unaffected** — `pnpm build`,
`node dist/main.js`, and Docker all resolve both packages through their `exports` maps to `dist`.
`jest.db.config.mjs` deliberately carries no mapping, because that suite must load the compiled
packages.

Browser runs live behind `pnpm test:e2e`, the browser download behind `pnpm test:e2e:install`, and
database runs behind `pnpm test:db` — never inside an ordinary test command. Those three may build
their real runtime dependencies; the fast command may not.

`pnpm test:db` runs the `packages/database` suite and then the `apps/api` suite, **sequentially**,
because both reset the same schema. Keep that ordering explicit in the root script rather than
leaving it to Turborepo.

Database tests use real PostgreSQL through `TEST_DATABASE_URL`. Never SQLite, and never a mocked
Prisma client while claiming database or route behaviour. The suites drop a schema, so the safety
gate — in `packages/database/tools/test-database.mjs`, reached from `apps/api` through the
`@devsync/database/test-database` export — must keep refusing any database it cannot prove is
disposable, and must not be copied.

End-to-end tests start their own servers on ports 4310 and 4311, wait on an HTTP readiness
check, and must never reuse a server a developer started by hand or sleep for a fixed interval.
Development ports 3000 and 3001 are off limits to them.

Every root test script needs a matching task in `turbo.json`. Anything depending on live
processes or a browser must set `cache: false`.

Test artifacts — `coverage/`, `test-results/`, `playwright-report/` — stay git-ignored, and a
test run must never modify a tracked file. Coverage is measured in `apps/web` and `apps/api`
only; do not describe it as repository-wide, and do not add thresholds until there is
substantive application logic to hold to them.

[`docs/testing.md`](docs/testing.md) is the long-form version and must be updated in the same
change that makes it inaccurate.

## Docker

Two production images, a migration image stage, and one Compose file at the root running those
alongside PostgreSQL.

- **Build context is always the repository root**, for both Dockerfiles. A pnpm workspace
  cannot do a frozen install without the root lockfile, `pnpm-workspace.yaml`, and every
  workspace manifest, so a per-app context cannot work.
- Install from the committed lockfile with `--frozen-lockfile`, and get pnpm from Corepack so
  the image uses the version pinned in `packageManager`.
- Multi-stage, always: build tooling must not reach the runtime image. `apps/web` ships the
  Next.js `standalone` output; `apps/api` ships `dist` plus a `--prod` install.
- Run as the image's `node` user, never root. Run the compiled output, never a dev server.
- Compose passes every variable explicitly. Containers load no `.env`, so an unset variable there
  is unconfigured, not defaulted from a file.
- **PostgreSQL's volume mounts at `/var/lib/postgresql`** — the PostgreSQL 18 path, not the
  `/data` suffix that was correct up to 17. `docker compose down` must keep the data; only
  `--volumes` may destroy it.
- **Migrations run in the one-shot `migrate` service, never from API startup**, and the API waits
  on `service_completed_successfully`.
- The API runtime image carries runtime dependencies only — no `.ts` source, no compiler, no Prisma
  CLI, no Nest CLI, no test runner, anywhere in the image. Its production install names
  `@devsync/api`, `@devsync/database`, and `@devsync/shared` explicitly rather than using pnpm's
  `...` suffix, which would drag `@devsync/config` and TypeScript in, and it passes
  **`--no-optional`**, without which `@prisma/client`'s optional peers put the Prisma CLI and
  `tsc` back in the pnpm store. Keep that flag on the `prod-deps` stage and off the `migrate` one.
- Do not add a cache, queue, or database UI until something uses one, and do not add a
  `depends_on` edge between `web` and `api` until `web` actually calls `api`.
- Never run Playwright, install browsers, or add test tooling inside an application image.
- `pnpm` commands must keep working outside Docker; Docker is an additional way to run
  DevSync, not the way.

[`docs/docker.md`](docs/docker.md) is the long-form version.

## Continuous integration

One workflow, `.github/workflows/ci.yml`, with four independent jobs: `quality`, `database`,
`e2e`, `docker`.

- **CI runs the same commands a developer runs.** Do not add a CI-only script, and do not let a
  workflow step drift from the `package.json` script it mirrors. If a job needs a new command,
  the command belongs in `package.json` first.
- **CI reports, it never rewrites.** `format:check` and `lint` only — never `format` or
  `lint:fix`, and never a step that commits, pushes, or tags.
- `permissions: contents: read` at the workflow level. Do not grant write scopes, and do not
  introduce secrets — nothing here authenticates to anything.
- Official `actions/*` only, pinned to a major version. No third-party action where an official
  one or a direct command will do.
- Node comes from a workflow-level `NODE_VERSION`; pnpm comes from Corepack reading
  `packageManager`. Never hard-code a pnpm version in the workflow.
- `corepack enable` must stay **before** `actions/setup-node`, because its pnpm cache runs
  `pnpm store path`.
- Keep the jobs independent. Do not pass a build between them to save time; each job proving a
  complete workflow is the point.
- Upload failure artifacts only, and only the small ones that explain a failure.
- The Docker job must clean up under `if: always()`, with the log-dumping step before it.

[`docs/ci.md`](docs/ci.md) is the long-form version.

## Documentation

`README.md` describes what exists, not what is planned. Do not describe collaboration, accounts,
version history, or code execution as working until they are, and do not describe persistence as
something a **user** can reach until `apps/web` calls `apps/api`.
Update documentation in the same change that makes it inaccurate.

Seven documents, each owning one subject. Link to them rather than restating their content, so
there is exactly one place to correct.

- [`docs/architecture.md`](docs/architecture.md) — the implemented architecture, the reserved
  package boundaries, the request and process boundaries, the durable architectural principles,
  and the planned architecture. Every claim is labelled implemented, reserved, or planned.
- [`docs/development.md`](docs/development.md) — prerequisites, commands, ports, artifacts,
  adding a workspace, and repository-level Git conventions.
- [`docs/roadmap.md`](docs/roadmap.md) — the milestone sequence, Phase A through Phase N.
- [`docs/decisions.md`](docs/decisions.md) — decisions already made, with the reason, the current
  consequence, and what would justify revisiting each. One file; do not turn it into an ADR
  directory.
- [`docs/testing.md`](docs/testing.md), [`docs/docker.md`](docs/docker.md), and
  [`docs/ci.md`](docs/ci.md) — the long-form versions of the three sections above.

Anything describing a system that does not exist must be explicitly marked as planned or as
direction. Present tense is reserved for what runs. A document that describes a planned system as
if it were built is worse than no document.

## Git

**Claude must not create commits, push branches, open pull requests, merge branches, or delete
branches. The user controls all Git publishing operations.**

Staging, inspecting, and diffing are fine. Anything that writes history or reaches a remote is
the user's call.

## Architectural commitments

These are boundaries for future work, not descriptions of code. None of the technologies named
here is installed, and none may be installed ahead of the milestone that calls for it.

- Web, API, collaboration, database, shared contracts, and UI concerns stay separated. Code with
  a second consumer moves into `packages/`; it is not duplicated across applications.
- The server enforces authorization. No client-supplied claim about identity, membership, or role
  is trusted, and that applies to collaboration messages exactly as it does to HTTP requests.
- Real-time collaboration synchronises CRDT document updates, never whole file contents. Yjs is
  the intended library, and the initial model is one Yjs document per project.
- Presence and awareness are ephemeral. They live for the duration of a connection and are never
  written to the durable store.
- PostgreSQL owns durable application records once persistence exists. **Redis is not introduced
  until horizontal scaling requires it** — a single API instance needs no shared cache.
- Code execution runs outside the `apps/web` and `apps/api` processes, in an isolated,
  resource-limited runner.

[`docs/architecture.md`](docs/architecture.md) is the long-form version, and
[`docs/decisions.md`](docs/decisions.md) records why each was chosen.

## Current boundary

**Phase A and Phase B are complete. Phase C — database-backed projects — is at C2: C0, C1, and C2
are complete, and C3 is next.** Phase A's foundation is in place: monorepo scaffold, centralised
TypeScript and quality configuration, the testing layers, two production Docker images, GitHub
Actions CI, and the documentation above. Phase B added the local editor: `apps/web` renders one
Monaco editor over one file whose contents and language a client workspace component holds in React
state, and Playwright types into the real editor in Chromium against the production build.

**C1 built the storage half of Phase C, and C2 put an HTTP surface on it.** PostgreSQL 18 and a
one-shot `migrate` service are in Compose; Prisma 7, the schema, one committed migration, and the
data layer are in `@devsync/database`; `apps/api` validates `DATABASE_URL`, opens a connection
during startup, and serves five project routes and five nested project-file routes over it, with
the contracts in `@devsync/shared`. **`apps/web` still makes no request to `apps/api`** — that is
C3, and until then nothing a user can click saves or loads anything.

Seven Phase C rules are durable enough to state here; the reasoning is in `docs/`:

- **Phase C is single-user.** No users, owners, memberships, roles, authorization, slugs,
  visibility, archival, soft deletion, folders, or paths — and no placeholder column or contract for
  any of them. Every request is anonymous, so nothing in Phase C may be exposed to an untrusted
  network.
- **Prisma, the schema, the migrations, and the client belong to `@devsync/database`.** Nothing else
  constructs a client, no caller gets the raw Prisma client, and no Prisma error escapes the
  package. `apps/web` never imports it, Prisma, or a database URL. No HTTP concept goes into it: it
  classifies failures into four meanings, and `apps/api` maps those to status codes.
  **`src/contracts.ts` is the ORM-independent half** — the records, the operation interfaces,
  `Database`, and `PersistenceError` — and it must keep importing nothing from Prisma. Everything
  that touches the generated client sits beside it and depends on it, never the reverse.
- **`@devsync/database` and `@devsync/shared` emit CommonJS and must keep doing so.** `apps/api` is
  CommonJS and its ts-jest suite cannot `require` an ES module. That is why the Prisma generator is
  set to `moduleFormat = "cjs"`, why `packages/shared` carries no `"type": "module"`, and why both
  build to `dist/` rather than being consumed as source.
- **Runtime contracts belong to `@devsync/shared`** — request and response schemas, the supported
  language identifiers and their validator, and the one error contract, all Zod 4. **Zod stays
  inside that package**: callers use `parseContract`, and `apps/api` declares no Zod dependency.
  Nothing server-only may go in — no environment loading, no database, no NestJS, no React — because
  `apps/web` bundles it from C3.
- **The API answers one error shape, with seven stable codes.** No response may contain SQL, a
  Prisma code, a table name, a connection string, or a stack. Validation failures, malformed
  identifiers, unreadable bodies, and oversized bodies are all `400`; the JSON limit is 1 MiB.
- **Database-backed tests use real PostgreSQL** through `TEST_DATABASE_URL`, behind `pnpm test:db`
  and its own non-cached task. `pnpm test` must keep building nothing and starting nothing, and no
  fake database may be used to claim a route works.
- **Migrations are committed and immutable.** `prisma migrate dev` creates them locally,
  `prisma migrate deploy` applies them everywhere else, and a mistake is corrected by a new
  migration. Generated Prisma Client stays untracked and reproducible.

**That workspace is still the only product functionality**, and C2 did not touch it. Its content and
its language live in browser
memory and are never read, written, or sent anywhere; remounting or reloading starts again from the
sample, as TypeScript. The five languages in `apps/web/src/editor/languages.ts` — TypeScript,
JavaScript, Python, JSON, Markdown — are five readings of the one buffer: the file name is derived
from the language, changing the language leaves the content untouched, and nothing is detected,
generated, or translated. There is no second file, no file tree, no tabs, no save action or
saved/unsaved state, no persistence of any kind — not `localStorage`, not `sessionStorage`, not
IndexedDB — and no API call.

**The authoritative language identifiers are `@devsync/shared`'s from C2**, and `apps/api` validates
against them. `apps/web` does not import that package yet, so its list repeats the same five strings
for now. Leave the duplication alone: C3 makes the client the package's second consumer and removes
it. The labels and the derived display names stay browser-owned either way — they are presentation,
and the shared package carries none.

Two Monaco integration facts are worth knowing before changing the editor:

- **`@monaco-editor/react` pushes the controlled value into the model only when that value
  changes.** The browser test therefore cannot observe Monaco's `onChange` reaching React state;
  that direction is proved by the component suites instead. Do not "fix" this with a state mirror,
  a `window` global, or any other production test hook.
- **It rewrites the whole model whenever the controlled value and the live model disagree**, so
  edits arriving faster than React commits are overwritten by a stale value. User-paced typing and
  paste are unaffected. Phase E applies remote CRDT operations programmatically and is where the
  model-ownership design has to be reconsidered.

The starter content `apps/api/src/projects/starter-file.ts` writes into a new project is a copy of
that sample, and its comment stops being true the moment a project persists. **Do not fix that in
`apps/web`**: C3 replaces the local workspace and is where both copies are resolved.

Do not implement later milestones early. Specifically, do not add an API client in `apps/web`, CORS,
authentication, WebSockets, a CRDT library, code execution, Kubernetes, cloud deployment, release
automation, or a dependency bot until the milestone that calls for it. If a task seems to require
one of these, say so and stop rather than building ahead.
[`docs/roadmap.md`](docs/roadmap.md) is the sequence and the boundary each milestone must meet.
