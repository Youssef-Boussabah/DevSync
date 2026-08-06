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
- `tests/restart` (`@devsync/restart`) — C4's Docker-level restart, outage, and migration-redeploy
  validation, plus a Vitest suite over its own pure helpers.
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

Three runners plus one harness, each with a boundary:

- **Vitest** — `apps/web`, `packages/database`, `packages/shared`, `tests/restart`, and any other
  workspace that gains testable pure code. jsdom for components, Node for packages. Runner-agnostic
  configuration lives in `@devsync/config/vitest/base`.
- **Jest** — `apps/api` only, in two suites: `*.spec.ts` under `src` for the fast one, and
  `tests/*.db-spec.ts` under its own configuration for the PostgreSQL-backed one. Jest stays there
  because `@nestjs/testing` targets Jest's API and `ts-jest` already honours
  `emitDecoratorMetadata`. Do not migrate it for uniformity; a migration needs a concrete
  technical reason. The database suite runs through `node --experimental-vm-modules` because
  Prisma 7 loads its query compiler with a dynamic `import()`; do not remove that flag.
- **Playwright** — `tests/e2e` only, and it is the only layer allowed to start real **host**
  processes. Chromium only for now. Do not add a second browser-testing framework.
- **The restart validation** — `tests/restart` only, behind `pnpm test:restart`, and the only layer
  allowed to build images and start, stop, and remove containers. It is a plain Node runner rather
  than a test framework, deliberately: it is one ordered scenario against real containers, and a
  runner would add parallelism, retries, and per-test isolation to something that is a sequence by
  nature. Do not move it under Playwright, and do not mock Docker anywhere and call the result a
  restart proof.

`pnpm test` must stay fast: in-process source-level suites only. It performs **no workspace build
and no Prisma generation**, and starts no database, browser, server, or container — `pnpm clean`
followed by `pnpm test` has to pass with `packages/*/dist`, `packages/database/src/generated`, and
`apps/api/dist` still absent afterwards. `test`, `test:unit`, and `test:coverage` therefore declare
**no `dependsOn`** in `turbo.json`; do not add `^build` back to any of them.

**`test:unit` is the Vitest layer, so every Vitest workspace must declare a `test:unit` script —
including one whose suite cannot run in it.** Turborepo resolves an undeclared task to nothing and
reports nothing, so a Vitest workspace without the script disappears from the command silently, which
makes `test:unit` quietly stop meaning what its name says. `apps/api` correctly has none because its
suites are Jest. `tests/restart` declares it and its 58 pure-helper tests run under it — the Docker
scenario stays behind `pnpm test:restart` and joins neither `test` nor `test:unit`.

**`packages/database` has two Vitest configurations and they must not overlap.**
`vitest.unit.config.mts` runs `tests/unit/**/*.unit.test.ts` — the pure failure-classification
suite, which needs no database and no generated client — and is what its `test` and `test:unit`
scripts invoke. `vitest.config.mts` runs everything else against real PostgreSQL under `test:db`, and
**excludes `tests/unit/**`**; without that line the shared file glob matches the pure tests too and
`test:db` silently reports them a second time. Neither suite may be moved into the other: a rule
about what a driver error means belongs in the fast command, and a query against a real server
cannot go there.

What makes that possible is a source-level alias in each workspace that consumes a package which
builds. `apps/api/jest.config.mjs` maps `@devsync/shared` to `packages/shared/src/index.ts` and
`@devsync/database` to `packages/database/src/contracts.ts`, with `tsconfig.test.json` carrying the
matching `paths` so ts-jest type-checks against the same sources; `apps/web/vitest.config.mts` maps
`@devsync/shared` to that same `src/index.ts`, which is what kept the fast command build-free when
C3 made the web application the package's second consumer. Those are the real modules, not copies.
**Production is unaffected** — `pnpm build`, `node dist/main.js`, `next build`, and Docker all
resolve the packages through their `exports` maps to `dist`. `jest.db.config.mjs` deliberately
carries no mapping, because that suite must load the compiled packages.

Browser runs live behind `pnpm test:e2e`, the browser download behind `pnpm test:e2e:install`,
database runs behind `pnpm test:db`, and container runs behind `pnpm test:restart` — never inside an
ordinary test command. Those may build their real runtime dependencies; the fast command may not.

**`pnpm test:restart` is C4's and stays outside `pnpm test:all`.** `test:all` is the host ladder —
`test`, then `test:db`, then `test:e2e` — and `test:restart` is the only command that needs a Docker
daemon rather than a running PostgreSQL. It runs in CI's `docker` job. It is also the one root test
script with **no** Turborepo task, because it invokes no Turborepo task: it runs
`node tests/restart/tools/run-restart-validation.mjs` directly and builds its images through Docker.
Declaring a task nothing runs would let `turbo run test:restart` exit 0 having done nothing, which is
the failure the "every root test script needs a task" rule exists to prevent. Every root test script
that **fans out through Turborepo** still needs one.

**The restart validation runs only in the `devsync-c4-validation` Compose project**, on host ports
4321 and 5434, with its own network and its own volume, and it removes all three in a `finally` path.
That isolation is enforced in `tests/restart/lib/`, not documented: a Compose command against any
other project is refused before the process is spawned, the cleanup refuses to delete a volume Docker
does not label as this project's, and the run proves afterwards that the `devsync` project's volumes
are unchanged. **Never point `docker compose down --volumes` at the development project**, and do not
weaken those guards. Every wait in it is a named condition with a deadline; no fixed sleep is
acceptable as proof of readiness anywhere in it.

**Every Docker command in that harness has its exit code asserted, including the preflight cleanup.**
A stale-stack removal that failed leaves the previous run's populated volume in place, so the run
stops there rather than building images over data it did not create. Do not reintroduce a discarded
command result anywhere in `tests/restart`.

**Every `.mjs` file DevSync runs carries `// @ts-check` and must be in `pnpm typecheck`**, or the
annotation is decorative. Two rules make that true, and both are load-bearing: the workspace's
`tsconfig.json` turns on `allowJs` and `checkJs`, and any `.mjs` with a `.d.mts` beside it is named
in `files` rather than left to a wildcard — a wildcard drops it, because the declaration wins on
extension priority. That covers `tests/restart/lib/*.mjs` and `tools/run-restart-validation.mjs`,
`packages/database/tools/test-database.mjs`, `packages/config/vitest/base.mjs` and `eslint/*.mjs`,
`apps/api/tests/global-setup.mjs`, and `tests/e2e/tools/run-e2e.mjs`. Where a `files` list is added
to a config a build config extends, the build config must clear it — `files` beats `exclude`, and
tooling must not reach `dist`. Tool configuration read only by its own tool — `jest.config.mjs`,
`jest.db.config.mjs`, `postcss.config.mjs`, `prettier.config.mjs` — carries no `// @ts-check` and
stays outside every tsconfig.

`pnpm test:e2e` runs `tests/e2e/tools/run-e2e.mjs`, which does two things Turborepo and Playwright
cannot: it resets the disposable database through `@devsync/database/test-database` **before** the
applications are built or started, and it puts `NEXT_PUBLIC_API_URL=http://127.0.0.1:4311` in the
environment so the web build embeds the API this suite actually starts. `playwright.config.ts`
refuses to run when the two disagree. Do not move either into a Playwright `globalSetup`: Playwright
starts its `webServer` processes before a global setup runs, so a reset there would drop the schema
under an API that had already connected.

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

Every root test script that fans out through Turborepo needs a matching task in `turbo.json` —
`pnpm test:restart` is the one exception, and the paragraph above says why. Anything depending on
live processes or a browser must set `cache: false`.

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
  workspace manifest, so a per-app context cannot work. **Both Dockerfiles enumerate every workspace
  manifest, and a new workspace must be added to both** — the install still succeeds without one, so
  the omission is silent until something about resolution depends on it.
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
- Do not add a cache, queue, or database UI until something uses one. The `web` → `api`
  `depends_on` edge exists from C3, because the browser the `web` image serves now calls `api`.
- **The three published host ports are `${WEB_HOST_PORT:-3000}`, `${API_HOST_PORT:-3001}`, and
  `${POSTGRES_HOST_PORT:-5433}`**, and `WEB_ORIGIN` and the `NEXT_PUBLIC_API_URL` build argument are
  derived from the first two rather than restated. Container-side ports never move and nothing passed
  between services changes. They exist so C4's validation can publish a second copy of the stack;
  keep the defaults exactly as they are, and do not parameterise anything else for symmetry.
- **The browser API URL is a build argument, not a runtime variable.** `next build` embeds
  `NEXT_PUBLIC_API_URL`, so Compose passes it under `build.args` and it must be an address the
  **user's browser** can resolve — `http://127.0.0.1:3001`, never the Compose service name
  `http://api:3001`, which resolves only inside the Compose network.
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
- **C4's restart validation is a step of the `docker` job, not a fifth job.** That job now enables
  Corepack and sets up Node — only to _run_ `pnpm test:restart`; no image build reads anything from
  the host, which is still the property under test. Its cleanup is two `down --volumes` lines, one
  per Compose project, both under `if: always()`.
- **CI reports, it never rewrites.** `format:check` and `lint` only — never `format` or
  `lint:fix`, and never a step that commits, pushes, or tags.
- `permissions: contents: read` at the workflow level. Do not grant write scopes, and do not
  introduce secrets — nothing here authenticates to anything.
- Official `actions/*` only, each pinned to **that action's own current major** —
  `checkout@v6`, `setup-node@v6`, `upload-artifact@v7`. The three release independently, so the
  numbers are not meant to match; pinning them all to one is how a reference to a major that was
  never published gets written. Check the action's releases before changing a pin, and never use a
  floating tag or a branch. No third-party action where an official one or a direct command will do.
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
version history, or code execution as working until they are. **Restart survival is proved from C4
and may be described as such; backup, restore, replication, failover, high availability, automatic
retry, zero downtime, production readiness, and public-deployment safety are none of them true and
must not be claimed.** Update documentation in the same change that makes it inaccurate.

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

**Phases A, B, and C are complete. Phase D — rooms and presence — is next.** Phase A's foundation is
in place: monorepo scaffold, centralised TypeScript and quality configuration, the testing layers,
two production Docker images, GitHub Actions CI, and the documentation above. Phase B added the local
editor.

**C1 built the storage half of Phase C, C2 put an HTTP surface on it, C3 connected the browser, C4
proved the data outlives the processes, and C5 audited and closed the phase.** PostgreSQL 18 and a
one-shot `migrate` service are in Compose; Prisma 7, the schema, one committed migration, and the
data layer are in `@devsync/database`; `apps/api` validates `DATABASE_URL` and `WEB_ORIGIN`, opens a
connection during startup, and serves five project routes and five nested project-file routes over
it, with the contracts in `@devsync/shared`.

**`apps/web` now calls `apps/api`**, which is the first web-to-API runtime dependency the repository
has ever had. A person can create a project, open it, edit a file in Monaco, press Save, reload, and
find their work unchanged. Phase B's `LocalEditorWorkspace` is gone: the home page is a project
list, `/projects/[projectId]` is the workspace, and `apps/web` is the second consumer of
`@devsync/shared`.

Eight Phase C rules are durable enough to state here; the reasoning is in `docs/`:

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
  inside that package**: callers use `parseContract`, and neither application declares a Zod
  dependency. Nothing server-only may go in — no environment loading, no database, no NestJS, no
  React — because `apps/web` bundles it into the browser from C3.
- **The browser reaches the API directly, over one configured origin.** `NEXT_PUBLIC_API_URL` is
  validated once in `apps/web/src/api/api-url.ts` and embedded at build time; `WEB_ORIGIN` is
  validated in `apps/api`'s configuration and is the only origin CORS allows — no wildcard, no
  credentials, no reflected origin. There is no Next.js route handler or proxy in front of the API,
  and no `NEXT_PUBLIC_` name may ever carry a database URL.
- **The API answers one error shape, with seven stable codes.** No response may contain SQL, a
  Prisma code, a table name, a connection string, or a stack. Validation failures, malformed
  identifiers, unreadable bodies, and oversized bodies are all `400`; the JSON limit is 1 MiB.
- **Database-backed tests use real PostgreSQL** through `TEST_DATABASE_URL`, behind `pnpm test:db`
  and its own non-cached task, and **restart behaviour uses real containers** through
  `pnpm test:restart`. `pnpm test` must keep building nothing and starting nothing; no fake database
  may be used to claim a route works, and no mocked Docker may be used to claim data survives a
  restart.
- **Migrations are committed and immutable.** `prisma migrate dev` creates them locally,
  `prisma migrate deploy` applies them everywhere else, and a mistake is corrected by a new
  migration. Generated Prisma Client stays untracked and reproducible.

**What the product does, and what it still does not.** Two routes: `/` lists projects and creates,
renames, opens, and deletes them; `/projects/[projectId]` is one project, its files, and one open
file in Monaco. A file's name, language, and content are three independent stored properties, saved
by an explicit Save button that sends only what changed. The four save states — saved, unsaved
changes, saving, failed — are visible, and a draft is never discarded without a deliberate choice.

**There is still no autosave and no browser storage** — not `localStorage`, not `sessionStorage`,
not IndexedDB, not a service-worker cache. Unsaved content is not persisted, and a browser that
never pressed Save loses it. There are no tabs, no file tree, no folders, no search, and no
pagination; there is no collaboration, no presence, and no WebSocket, so a second browser sees a
change only after it reloads.

**The language identifiers are `@devsync/shared`'s and there is now exactly one copy of them.**
`apps/web/src/editor/languages.ts` builds its options from `SUPPORTED_LANGUAGE_IDS` and validates a
selection with `languageIdSchema`; what it adds is the label a user reads. **The derived file name
is gone** — a file has a stored name, renaming it does not change its language, and changing its
language does not rename it.

Two Monaco integration facts are worth knowing before changing the editor:

- **`@monaco-editor/react` pushes the controlled value into the model only when that value
  changes.** The browser test therefore cannot observe Monaco's `onChange` reaching React state;
  that direction is proved by the component suites instead. Do not "fix" this with a state mirror,
  a `window` global, or any other production test hook.
- **It rewrites the whole model whenever the controlled value and the live model disagree**, so
  edits arriving faster than React commits are overwritten by a stale value. User-paced typing and
  paste are unaffected. Phase E applies remote CRDT operations programmatically and is where the
  model-ownership design has to be reconsidered.

`apps/api/src/projects/starter-file.ts` is the one place that decides what a new project contains.
C3 rewrote its content, because the file it creates is now stored rather than held in a tab.

**C4's restart validation is a layer above C1's, not a correction of it.** C1 met its own boundary at
the data-access edge — `packages/database`'s lifecycle tests over a client disconnect and reconnect,
an unreachable database classified rather than leaked — plus container restarts checked by hand. C4
stops the server instead of the client, goes through the public HTTP routes, runs the production
Compose topology, and compares a recorded fixture field by field after an API restart, a PostgreSQL
outage, a recovery without restarting the API, and the committed migration redeployed over populated
rows. Both layers still run. **Do not describe C1 as having had no restart evidence**, and do not
describe C4 as the first time persistence was tested. `docs/testing.md` has the scenarios in full.

**Neither C4 nor C5 changed product behaviour.** C4's only non-documentation change outside
`tests/restart` was making `compose.yaml`'s three published host ports variables with their existing
defaults. C5 audited the phase against the C0 contract, found the two in agreement, and corrected
four things that were not: both Dockerfiles now copy `tests/restart/package.json` like every other
workspace manifest, `docs/ci.md` describes the action pins the workflow actually uses,
`packages/database` declares a `test:unit`, and the four runtime `.mjs` files whose `// @ts-check` no
tsconfig was reading are in `pnpm typecheck`. **No retry, circuit breaker, queue, schema change, or
second migration was added by either.**

**One real defect was first exposed after closure by the pull-request CI run: a PostgreSQL outage was
classified as `unknown`, and it took two attempts to fix because the mechanism was not the obvious
one.** C4's outage scenario got `500 INTERNAL_ERROR` where the contract says
`503 DATABASE_UNAVAILABLE`. **C4's container-level layer is what caught it**; no lower-level suite
held a deterministic regression for any of it, and earlier local runs passed because Docker Desktop
resolves a stopped service differently from a Linux CI runner.

**Two distinct shapes were involved, and only the second is the one CI hit.** When PostgreSQL is
stopped under a live pool it answers SQLSTATE `57P01`, and the adapter publishes that under
`meta.driverAdapterError.cause` — a real shape, now handled. But when the _address_ of a stopped
container cannot be resolved, `@prisma/adapter-pg` converts only four socket codes
(`ENOTFOUND`, `ECONNREFUSED`, `ECONNRESET`, `ETIMEDOUT`) and rethrows every other system error
untouched; Prisma then turns any error carrying a string `code` into a
`PrismaClientKnownRequestError` **whose code is that operating-system code and whose metadata holds
nothing but the model name**. On a GitHub runner that code is `EAI_AGAIN`, so there was no SQLSTATE,
no adapter kind, and no driver metadata anywhere to find — and a classifier reading `error.meta`
could not have found it. Both shapes were captured from the production image against real
PostgreSQL 18.3, and the CI one was reproduced deterministically by pointing a container at a
black-holed resolver.

**The classifier now reads the complete exception**, not `error.meta`: a bounded, cycle-safe,
own-property walk from the error itself over `meta` and `cause`, four links deep and 32 nodes wide.
**`unavailable` is decided structurally**, in `src/failure-classification.ts`, over four closed
allowlists — Prisma's `P1000`/`P1001`/`P1002`/`P1008`/`P1017`; SQLSTATE class `08` plus
`57P01`/`57P02`/`57P03`; the adapter kinds `DatabaseNotReachable`, `ConnectionClosed`, and
`SocketTimeout`; and the transport codes `EAI_AGAIN`, `EAI_FAIL`, `EAI_NODATA`, `ENOTFOUND`,
`ECONNREFUSED`, `EHOSTDOWN`, `EHOSTUNREACH`, `ENETDOWN`, `ENETUNREACH`, `ETIMEDOUT`, `ECONNABORTED`,
`ECONNRESET`, `ENETRESET`, and `EPIPE` — read only from the structured keys `code`, `originalCode`,
and `kind`. **`P2010` and `P2039` on their own still mean `unknown`** — a syntax error, a constraint,
and a shutdown all arrive under them — and **no classification may be made from words in a message**.
`sqlState` is deliberately absent: nothing installed writes that key. Do not widen any allowlist
without a captured error shape to justify each addition; do not add class `57` by prefix (`57014`,
`57P04`, and `57P05` are not unavailability); and do not add a system error that is not a transport
failure (`ENOENT` and `EACCES` say nothing about the database being away). The 83 pure tests in
`tests/unit/failure-classification.unit.test.ts` hold all of it with no PostgreSQL, no Prisma
generation, and no Docker.

**`PersistenceError` now carries a `diagnostic`** — a fixed token naming which rule classified the
failure, logged by `apps/api` for 5xx and never serialised. It exists because the defect was
invisible from a log: every unclassified failure says the same fixed sentence, so nothing
distinguished "understood" from "not recognised". It carries no value out of the original exception.
That optional field is the only thing `contracts.ts` gained; `PersistenceFailure` still has its four
meanings and the API still switches on those alone. **No route, HTTP response shape, error code,
Prisma schema, migration, dependency, lockfile entry, or retry behaviour changed.**

**What none of this claims.** There is no backup, restore, replication, failover, high availability,
automatic retry, or zero-downtime story, and nothing here is production-ready or safe to expose. The
validation shows one API process recovers after one PostgreSQL returns; it says nothing about
behaviour under load, about a request in flight when the connection drops, or about how many requests
fail while the database is away. **Local validation never stands in for CI**: running every command
locally proves the commands, not the runner, and a pull request does not merge until all four jobs
pass. Do not call a workflow run green until it has actually completed.

Do not implement later milestones early. Specifically, do not add authentication, WebSockets, a CRDT
library, code execution, Kubernetes, cloud deployment, release automation, or a dependency bot until
the milestone that calls for it. If a task seems to require one of these, say so and stop rather
than building ahead.
[`docs/roadmap.md`](docs/roadmap.md) is the sequence and the boundary each milestone must meet.
