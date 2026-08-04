# Decisions

The choices this repository has already made, why each was made, what it costs today, and what
would justify changing it.

This is one file rather than a directory of numbered records. A dozen entries do not need an ADR
framework, a status workflow, or a template with fields nobody fills in — and a heavier process
would be more overhead than the decisions it documents. If the list grows past the point where it
can be read in one sitting, splitting it is itself a decision worth recording here.

Entries marked **direction** are commitments about what will be built, not descriptions of what
exists. Nothing in a direction entry is installed.

| #                                                                         | Decision                                          |
| ------------------------------------------------------------------------- | ------------------------------------------------- |
| [D1](#d1--pnpm-and-turborepo)                                             | pnpm workspaces and Turborepo                     |
| [D2](#d2--nextjs-for-the-web-application)                                 | Next.js for the web application                   |
| [D3](#d3--nestjs-for-the-api)                                             | NestJS for the API                                |
| [D4](#d4--one-shared-configuration-package)                               | Shared configuration in `@devsync/config`         |
| [D5](#d5--reserved-package-boundaries-stay-empty)                         | Reserved packages stay empty                      |
| [D6](#d6--vitest-for-the-frontend-and-pure-typescript)                    | Vitest for the frontend                           |
| [D7](#d7--jest-retained-for-the-nestjs-api)                               | Jest retained for `apps/api`                      |
| [D8](#d8--playwright-for-browser-and-full-stack-testing)                  | Playwright for browser tests                      |
| [D9](#d9--docker-compose-for-production-style-local-execution)            | Docker Compose locally                            |
| [D10](#d10--one-workflow-four-independent-ci-jobs)                        | One workflow, four independent jobs               |
| [D11](#d11--no-env-loading-yet)                                           | No `.env` loading yet — **superseded in C1**      |
| [D12](#d12--direction-monaco-and-yjs-for-collaborative-editing)           | **Direction:** Monaco + Yjs                       |
| [D13](#d13--direction-postgresql-before-redis)                            | **Direction:** PostgreSQL before Redis            |
| [D14](#d14--direction-an-isolated-execution-runner)                       | **Direction:** an isolated runner                 |
| [D15](#d15--monaco-is-bundled-not-loaded-from-a-cdn)                      | Monaco is bundled, not loaded from a CDN          |
| [D16](#d16--prisma-owned-by-devsyncdatabase)                              | Prisma, owned by one package                      |
| [D17](#d17--direction-phase-c-is-single-user-and-deletion-is-permanent)   | **Direction:** single-user, permanent deletes     |
| [D18](#d18--direction-flat-file-names-and-language-as-a-validated-string) | **Direction:** flat names, language as a string   |
| [D19](#d19--direction-a-new-project-is-created-with-its-first-file)       | **Direction:** projects start with one file       |
| [D20](#d20--direction-zod-contracts-in-devsyncshared)                     | **Direction:** Zod contracts in `@devsync/shared` |
| [D21](#d21--database-tests-run-against-real-postgresql)                   | Database tests use real PostgreSQL                |
| [D22](#d22--devsyncdatabase-is-a-built-commonjs-package)                  | `@devsync/database` is built, and CommonJS        |
| [D23](#d23--postgresql-is-published-on-port-5433)                         | PostgreSQL is published on 5433                   |
| [D24](#d24--file-name-uniqueness-is-pinned-to-the-c-collation)            | File-name uniqueness uses the `C` collation       |

---

### D1 — pnpm and Turborepo

**Decision.** A single pnpm workspace containing every application and package, with Turborepo
running the task graph across it. pnpm is pinned by `packageManager`; `npm` and `yarn` are not
supported.

**Reason.** The product is one system split across a client, a service, and code both need to
agree on — a shared collaboration protocol is meaningless if the two halves can install different
versions of it. One workspace means one lockfile, one dependency resolution, and an atomic change
across client and server. pnpm's content-addressed store makes that cheap on disk and its strict
resolution stops a workspace importing something it never declared. Turborepo adds the task graph
and caching without requiring the repository to be restructured around it.

**Consequence today.** Nine workspaces, one lockfile, `pnpm lint` and `pnpm typecheck` covering
all of them. Both Docker images must use the repository root as their build context, because a
frozen install needs the root lockfile and every manifest.

**Revisit if.** A workspace needs to be published or versioned independently, or the task graph
outgrows what Turborepo expresses. Neither is close.

---

### D2 — Next.js for the web application

**Decision.** Next.js 16 with the App Router and React 19 for `apps/web`.

**Reason.** DevSync's client is an application, not a document: it needs routing, a build
pipeline that handles TypeScript and CSS without assembly, and eventually server-rendered project
views alongside a heavily client-side editor. Next.js provides all of that as defaults rather
than as configuration, and its `standalone` output makes a small production container possible
without a bundler of our own.

**Consequence today.** One route, `/`. `output: 'standalone'` and `outputFileTracingRoot` are set
so the production image can run a self-contained server with no package manager. The `@/*` alias
works identically in `next dev`, `next build`, and `tsc`, and is restated in
`vitest.config.mts` because Vitest does not read `tsconfig.json`.

**Revisit if.** The editor turns out to fight server rendering badly enough that a plain SPA is
simpler, or the framework's release cadence becomes a maintenance cost out of proportion to what
is used. Neither is visible from Phase A.

---

### D3 — NestJS for the API

**Decision.** NestJS 11 on the Express adapter for `apps/api`.

**Reason.** The API is expected to grow modules for projects, membership, authorization, a
WebSocket gateway, and execution job handling. Nest's module system, dependency injection, and
first-class WebSocket gateways give that growth a shape decided in advance, rather than one that
emerges from whichever file grew fastest. Its testing utilities also make HTTP-level tests cheap,
which is what `apps/api` tests today.

**Consequence today.** One module and one endpoint — deliberately little framework for what it
does, which is the trade for not restructuring later. Two TypeScript settings are constrained by
it: `tsconfig.nest.json` cannot set `verbatimModuleSyntax` or `lib`, because
`emitDecoratorMetadata` needs injected classes to survive as values. `apps/api` also has no path
alias, because `tsc` does not rewrite aliases when it emits.

**Revisit if.** The service stays this small permanently — it will not — or Nest's decorator
metadata requirements start blocking a compiler setting that matters more than the framework
does.

---

### D4 — One shared configuration package

**Decision.** TypeScript and ESLint configuration live in `@devsync/config`. Prettier is
configured once at the repository root. A rule is added in one place, never in a workspace.

**Reason.** Nine workspaces with their own copies of a strictness setting drift within weeks, and
the drift is invisible until a rule that was supposed to be repository-wide turns out to be off
in the one workspace where it mattered. Centralising it makes the strictness a property of the
repository rather than of whoever scaffolded a directory.

**Consequence today.** Five layered TypeScript configurations and two ESLint builders, with the
two NestJS carve-outs documented as deliberate. Prettier is not routed through the package,
because it already resolves configuration by walking upwards and a second consumer would add
indirection without removing duplication. ESLint does not run Prettier as a rule, so exactly one
tool reformats code.

**Revisit if.** A second Vitest workspace appears — at which point the runner-agnostic parts of
`apps/web/vitest.config.mts` move into the package, the way the TypeScript and ESLint
configuration did.

---

### D5 — Reserved package boundaries stay empty

**Decision.** `@devsync/shared`, `@devsync/collaboration`, `@devsync/database`, `@devsync/ui`,
and `@devsync/test-utils` exist as workspaces and export nothing. No placeholder classes, stub
functions, or speculative types.

**Reason.** Creating the boundary early is cheap and makes the destination for shared code
obvious before anyone is tempted to write it into an application and copy it. Filling the
boundary early is expensive: a speculative interface has to be unlearned before it can be used,
and it makes the repository look further along than it is.

**Consequence today.** Four workspaces that lint, type-check, and report honestly that they have no
tests. Each `src/index.ts` is a documented `export {}`, and each README states the boundary and the
current state. `@devsync/database` was the fifth until C1 filled it — with a schema, a migration, a
data layer, and 57 tests — which is the outcome this decision was betting on: the boundary was
already there, so filling it was a matter of writing the implementation rather than agreeing where
it should live.

**Revisit if.** A package is still empty when the milestone that was supposed to fill it has come
and gone — that is evidence the boundary was wrong, and the workspace should be deleted rather
than kept as decoration.

---

### D6 — Vitest for the frontend and pure TypeScript

**Decision.** Vitest is the runner for `apps/web` and for any `packages/*` that gains testable
code. jsdom for components.

**Reason.** It shares Vite's transform pipeline with the tooling `apps/web` already uses, so TSX
needs no additional configuration, and it starts fast enough to run on every save.

**Consequence today.** Thirty-six component tests across the home page, the workspace, and the
editor wrapper, the last two against mocked boundaries because jsdom cannot run the real editor.
`layout.tsx` cannot be
tested here — it imports `next/font/google`, which only the Next.js compiler resolves — so the
metadata it declares is asserted by Playwright against the real document instead of being
re-implemented in a mock.

**Revisit if.** A packages-level suite needs something Vitest cannot express. Nothing suggests it
will.

---

### D7 — Jest retained for the NestJS API

**Decision.** `apps/api` uses Jest. It is not migrated to Vitest for the sake of uniformity.

**Reason.** `@nestjs/testing` is written against Jest's API, and `ts-jest` reads
`apps/api/tsconfig.json` directly — including `emitDecoratorMetadata`, which Nest's dependency
injection depends on. Migrating would mean reintroducing decorator metadata through SWC or Babel
in order to buy consistency and nothing else. The migration is not blocked; it is simply not paid
for.

**Consequence today.** Two runners in one repository, and a contributor has to know which
directory uses which. That cost is real and accepted. `pnpm test` runs both, so it is invisible
from the root.

**Revisit if.** A shared helper appears that both runners need and cannot both consume, or Nest's
testing utilities become runner-agnostic. A concrete technical reason — not uniformity.

---

### D8 — Playwright for browser and full-stack testing

**Decision.** Playwright owns `tests/e2e`, and it is the only layer allowed to start real
processes. Chromium only. No second browser-testing framework.

**Reason.** Convergence between clients is the central technical claim of this product, and it
cannot be proved by a single-client test. `browser.newContext()` produces fully isolated sessions
inside one browser process, so a single test can act as two users — which is exactly the shape
the collaboration tests will need. Nothing else in the ecosystem makes that as direct.

**Consequence today.** Eight tests that build both applications, start them on ports 4310 and
4311, and check that each answers, that the editor region paints, that the language selector over it
works in a real browser, and that a real keystroke reaches the real Monaco editor. The suite polls
HTTP readiness rather than sleeping, and
`reuseExistingServer` is off so it can never pass by talking to a server someone started by hand.
One manual step per machine, `pnpm test:e2e:install`, is the price.

**Revisit if.** Browser-specific behaviour appears that Chromium alone cannot catch — the editor
and the collaboration transport are the likely candidates. Cross-browser coverage earns its place
then, not before.

---

### D9 — Docker Compose for production-style local execution

**Decision.** Multi-stage production images and one root `compose.yaml`, carrying only services
something actually uses. Until C1 that meant two applications and nothing else; C1 added PostgreSQL
and the one-shot migration service, because the API now genuinely needs both.

**Reason.** Running the compiled output the way production would run it catches a category of
failure no `pnpm dev` session can — a missing runtime dependency, a traced bundle that cannot
boot, a process that does not bind the interface it was told to. Adding a service nothing uses
would be scaffolding pretending to be architecture, and an empty PostgreSQL container is exactly
the kind of thing that makes a repository look further along than it is.

**Consequence today.** `docker compose up -d --build` starts both applications, each with an HTTP
health check that proves it answers rather than that it started. Both images run compiled output
as the non-root `node` user. Containers use the same ports as `pnpm dev`, so the two cannot run
at once. `pnpm` commands keep working outside Docker — it is an additional way to run DevSync,
not the way.

**Revisit if.** The `web` → `api` edge, which waits for C3 — the first time `web` depends on `api`
at runtime. C1 already brought the rest: PostgreSQL, the first named volume, and the first ordering
edges, with `api` starting after the database is healthy and after the migration service has
exited successfully. [`docker.md`](docker.md) is the full topology.

---

### D10 — One workflow, four independent CI jobs

**Decision.** A single `.github/workflows/ci.yml` with `quality`, `database`, `e2e`, and `docker`
jobs that do not depend on one another. CI runs the same commands a developer runs, holds
`contents: read`, uses no secrets, and never rewrites the tree. It began with three; C1 added
`database` when there was a data layer to exercise.

**Reason.** Passing a build between jobs would make the later jobs prove less than they appear to:
each would be exercising an artifact assembled elsewhere rather than the workflow a developer or a
production image actually follows. Independence costs a duplicated install and buys four complete,
honest reproductions. Keeping every command identical to a local one means a red run never requires
reading CI internals to reproduce.

**Consequence today.** Dependencies install three times, and Playwright's Chromium downloads on
every `e2e` run — both recorded as known costs rather than optimised away with something fragile.
Two jobs now start their own PostgreSQL service container rather than sharing one, which is the
same trade: a shared database between jobs would make each prove less about its own setup. CI
validates and ships nothing: no registry, no tag, no deployment.

**Revisit if.** Run time becomes a real obstacle, at which point caching Chromium by resolved
Playwright version is the first thing to try — not job chaining, which trades away the property
the split exists for.

---

### D11 — No `.env` loading yet

**Decision.** No configuration module, no `dotenv`, no `@nestjs/config`. `.env.example` documents
the variables; values come from the shell, from `compose.yaml`, or from the Playwright
`webServer` block.

**Reason.** One variable does not justify a configuration layer, and a half-built one invites the
worst outcome: a value that is silently defaulted from a file in one environment and absent in
another. Being explicit means an unset variable is unconfigured, visibly.

**Consequence today.** None: the trigger arrived. **C1 superseded this decision**, exactly as it
said it would, and on the terms it set — loading, validation, documentation, and ignore rules
together, with a missing or malformed `DATABASE_URL` failing startup rather than falling back to
some other database. `apps/api` reads `.env` through `@nestjs/config`; the database and end-to-end
tooling read it through `dotenv`. A value already in the environment still wins over the file, so
Compose and CI keep control, and `.dockerignore` still keeps every `.env*` file out of both build
contexts.

**Revisit if.** Nothing left to revisit. The entry stays because the reasoning — that a half-built
configuration layer is worse than none, and that an unset variable should be visibly unset —
is what the C1 implementation was held to.

---

### D12 — **Direction:** Monaco and Yjs for collaborative editing

**Decision.** The editor will be Monaco; the shared document will be a Yjs CRDT, with the model
and bindings living in `@devsync/collaboration`. Real-time updates will carry CRDT operations,
never whole file contents. The initial model is one Yjs document per project.

**Reason.** Monaco is the editor from VS Code — a mature, extensible component with existing CRDT
bindings, so the editor is not the risky part of the project. Yjs gives convergence as a property
of the data structure rather than of message ordering, which is what makes concurrent editing and
offline reconnection tractable at all. Broadcasting whole files scales with file size instead of
edit size and cannot resolve simultaneous edits.

**Consequence today.** **Monaco is installed and rendering; Yjs is not, and no collaboration code
exists.** The editor is bound to nothing, `@devsync/collaboration` is still empty, and Playwright
is in place because two-context convergence tests are how the rest of this will be proved. How
Monaco itself is loaded is [D15](#d15--monaco-is-bundled-not-loaded-from-a-cdn).

**Revisit if.** Monaco's bundle size proves unworkable in the client, or a benchmark on a real
project shows one document per project does not hold — per-file documents are the recorded
alternative. Both are Phase E and F questions, and neither can be settled on paper now.

---

### D13 — **Direction:** PostgreSQL before Redis

**Decision.** PostgreSQL will be the system of record for projects, files, memberships, and
history, reached only through `@devsync/database`. **Redis is not introduced until horizontal
scaling requires it.**

**Reason.** One durable store means one place to look, one backup story, and one consistency
model. Redis solves a problem DevSync does not have yet: sharing collaboration and presence state
between multiple API instances. Adding it before that point buys an extra deployment dependency,
an extra failure mode, and a cache-invalidation problem in exchange for nothing — and presence,
the data most often cited as a reason for it, is ephemeral by design and belongs in process
memory until there is more than one process.

**Consequence today.** The PostgreSQL half is built: PostgreSQL 18 in Compose, reached only through
`@devsync/database`, which `apps/api` depends on. **Redis is still absent**, and nothing in C1
made it any closer — presence and collaboration, the things that would want it, do not exist, and
one API instance shares state with nobody.

**Revisit if.** More than one API instance has to serve one project's room — a Phase M concern.
That is the trigger, and nothing earlier is.

---

### D14 — **Direction:** an isolated execution runner

**Decision.** User code will run in a separate, resource-limited runner service. It will never
execute inside the `apps/web` or `apps/api` process.

**Reason.** An API process that also runs user code has no security boundary left: a sandbox
escape becomes database access, credential access, and access to every other user's project. The
isolation has to be a different process with its own filesystem, network, and resource limits,
and the API has to treat it as untrusted.

**Consequence today.** No execution, no sandbox, and no runner exists — the decision's only
present effect is that nothing is being built in a way that would make it hard to add one later.
It is scheduled last among the functional phases, after authentication, because untrusted
execution without an accountable identity is not something to ship.

**Revisit if.** Never, in substance. The mechanism — container per job, microVM, WebAssembly —
is genuinely open and gets chosen in Phase L against real requirements. The boundary itself is
not negotiable.

---

### D15 — Monaco is bundled, not loaded from a CDN

**Decision.** `apps/web` depends on `monaco-editor` directly and hands that instance to
`@monaco-editor/react` through `loader.config({ monaco })`. The library's default — fetching
Monaco from jsDelivr at runtime — is deliberately overridden.

**Reason.** `monaco-editor` is a required peer dependency of `@monaco-editor/react`, so it is
installed either way; the only question is whether the copy in `node_modules` is the one the
browser runs. Leaving the default would make the application unable to start its editor without
reaching a third-party host — in a container, behind a strict content-security policy, or on a
network that does not allow it — and would make the end-to-end suite depend on a CDN being up,
which is exactly the kind of intermittent failure `retries: 0` exists to expose rather than
absorb. Nothing else in DevSync contacts an external service, and the editor is a poor place to
start.

**Consequence today.** Monaco's full language set ships in the client bundle, which is the largest
single cost in `apps/web` and is accepted rather than optimised away at this size. Monaco's own
worker entry points cannot be used as they are: Turbopack copies them out of `node_modules` as
static files instead of compiling them, so `src/editor/workers/` re-declares them in application
source and `MonacoEnvironment.getWorker` points there — one entry per language service that has a
worker of its own, which is why offering JSON in B2 meant adding a third alongside the editor's own
and TypeScript's. The production image and the Playwright
suite both work with no network access beyond their own ports.

**Revisit if.** The bundle proves too large — the recorded first move is importing a subset of
Monaco's languages rather than the whole package, not returning to the CDN. A change in Turbopack
that compiles worker entry points inside dependencies would let `src/editor/workers/` be deleted;
that is a simplification to take, not a reason to revisit the decision itself.

---

### D16 — Prisma, owned by `@devsync/database`

**Decision.** Prisma is the ORM, and it lives entirely inside `@devsync/database`: schema,
migrations, client construction, connection lifecycle, and the project and file operations. Nothing
else in the repository constructs a client, and `apps/web` never imports the package at all.
Migrations are committed, an applied migration is immutable, and `prisma migrate deploy` — never
`migrate dev` or `db push` — is what applies them outside local development.

**Implemented in C1**, at Prisma 7.9.1 against PostgreSQL 18.3, through the `@prisma/adapter-pg`
driver adapter.

**Reason.** A generated, fully typed client is the shortest path from a schema to compile-time
safety across a strict TypeScript workspace, and Prisma's migration files are ordinary reviewable
artifacts rather than state held in a tool. Confining it to one package is the part that matters
most: a client constructed in a controller is a connection pool nobody owns and a shutdown nobody
runs, and an ORM reachable from every caller stops being replaceable the week after it is
introduced. Exposing named operations instead of an open connection keeps the boundary an
abstraction rather than a directory.

**Consequence today.** Prisma 7's generator writes the client as TypeScript into the package's own
source tree, which is what makes the package build rather than be consumed as source
([D22](#d22--devsyncdatabase-is-a-built-commonjs-package)). The adapter means no query engine
binary ships: the runtime image carries `@prisma/client`, `@prisma/adapter-pg`, and `pg`, and no
Prisma CLI at all — the migration service is a separate image stage for exactly that reason. The
API loads the configuration and drives connect and disconnect through Nest's lifecycle. The routes
that use any of it are C2's.

**Revisit if.** The generated client turns out not to fit the workspace's consumed-as-source model,
or a query the product genuinely needs cannot be expressed. The recorded first move is a raw query
_through_ the package, not a second data-access path around it. Full details are in
[`architecture.md`](architecture.md#prisma-and-migrations).

---

### D17 — **Direction:** Phase C is single-user, and deletion is permanent

**Decision.** Projects and files carry no owner, no membership, no role, no visibility, no slug, no
archive state, and no `deletedAt`. Deleting a project permanently deletes it and, by cascade, its
files. No column, contract, or route is added in advance for any of it.

**Reason.** Every one of those fields is meaningless without identity, and identity is Phase H. A
nullable `ownerId` written by nothing and enforced by nothing is not a head start — it is a shape
that has to be unpicked before it can be used, and a constraint that reads as if authorization
exists when it does not. Soft deletion is the same trade in a worse form: it makes every query
carry a filter that Phase C has no reason to need, and the first query that forgets it becomes a
data-leak bug.

**Consequence today.** Nothing exists to consume it. **From C2**, when the routes exist, every
request is anonymous: anyone who can reach the API can read, rename, and permanently delete every
project in it. The API is not unreachable — it is published on a local host port, and Compose
publishes it too — so this is acceptable only **inside Phase C's local, single-user development
boundary**. It is not suitable for public deployment, and nothing in Phase C should be deployed
where an untrusted client can reach it. Phase H is what introduces real identity and authorization;
until then the boundary is the network the API is exposed on, which is a weaker guarantee than it
sounds and is stated here so nobody mistakes it for a strong one. Delete is unrecoverable, so C3's
interface has to say so plainly.

**Revisit if.** Phase H arrives, which it will. That milestone adds ownership and authorization,
and it is also the point at which recoverable deletion should be argued on its own merits rather
than smuggled in early.

---

### D18 — **Direction:** flat file names, and language as a validated string

**Decision.** A file has a name, unique within its project and case-sensitive, with no folder,
path, parent, or ordering column. Its language is stored as an ordinary string, validated against
the supported list at the API boundary, and is **not** a PostgreSQL or Prisma enum. Name and
language are independent: renaming does not change the language, and changing the language does not
rename.

**Reason.** A file tree is Phase F's problem, and the cheapest way to be ready for it is to store
nothing that would have to be migrated in the wrong direction first. Uniqueness within a project
prevents the one genuinely confusing state — two files a user cannot tell apart — and stops there.
Case-sensitivity is chosen rather than inherited: case-insensitive uniqueness needs a rule about
which spelling survives a collision, and nothing in DevSync has asked for one. The language is a
string because adding a sixth one should be a change to a list and a validator, not a migration: an
enum type would make the database the authority on a set that is really Monaco's, and would couple
every new language to a schema change and a deployment ordering problem.

**Consequence today.** None. **C1 has to make the schema and its collation configuration actually
enforce the composite `(projectId, name)` rule as specified, and cover it with real PostgreSQL
integration tests** — a uniqueness guarantee assumed from a database default is a guarantee nobody
has checked. From C2, an unsupported language is a `400` rather than a constraint violation, and
the identifiers and their validator live in `@devsync/shared`, which the API reads from C2 and the
web application from C3.

**Revisit if.** Real projects need directories — that is Phase F, and it is a migration that adds a
location, not a reinterpretation of the name. Or duplicate-looking names cause genuine confusion in
practice, at which point case-insensitive uniqueness is the recorded alternative.

---

### D19 — **Direction:** a new project is created with its first file

**Decision.** Creating a project also creates one file — `main.ts`, TypeScript, holding the starter
content the local workspace opens with today — in a single transaction. `apps/api` owns that
policy; `@devsync/database` owns the transaction. If either insert fails, neither row remains. A
project may later hold zero files, because the last one can be deleted.

**Reason.** An empty project is a dead end: the first thing a user sees is a view with nothing to
open. Doing it client-side, as a create followed by a second request, means every failure between
the two leaves an empty project behind and every client has to reimplement the same recovery. The
ownership split is what keeps it honest — a persistence layer with an opinion about what a new
project should say has to be edited for a product decision, so the content comes from the API and
only the atomicity comes from the package.

**Consequence today.** None. From C1, the database package needs a transaction helper before it
needs anything else; from C2, `POST /projects` returns the new file's identifier so the client can
open it without guessing.

**Revisit if.** Project templates appear, at which point the starter stops being one hard-coded file
and the policy — still in `apps/api` — becomes a choice. Or the first file proves unwanted, which
is a product observation rather than a technical one.

---

### D20 — **Direction:** Zod contracts in `@devsync/shared`

**Decision.** The request schemas, the response contracts worth pinning, the supported language
identifiers and their validator, and the single error contract are published from `@devsync/shared`,
with Zod as the runtime validation library and the TypeScript types inferred from the schemas.
**They arrive in C2, with `apps/api` as their first consumer; `apps/web` becomes the second in C3.**
Nothing is added to the package during C0. `@devsync/shared` depends on no other workspace and reads
no environment file.

**Reason.** A validator and a type that are written separately are two things that can disagree;
inferring the type from the schema means the check that runs and the type that compiles cannot
drift. Publishing them from one package is the whole reason that package exists — client and server
disagreeing about a wire format is the failure the monorepo was chosen to prevent. C2 rather than C3
is the honest point to start: the schemas the API validates every request against are real code with
a real user, and holding them inside `apps/api` until the client arrives would mean writing each one
twice and hoping the copies agree. What [D5](#d5--reserved-package-boundaries-stay-empty) forbids is
speculation, not a contract that is already being enforced.

**Consequence today.** None. Zod is not installed, and `@devsync/shared` still exports nothing.
From C2 it is a runtime dependency of `apps/api`, and from C3 of `apps/web` as well, so it ships in
the client bundle — which is the cost, and is why the package must never grow anything server-only,
including anything that reads configuration.

**Revisit if.** A concrete incompatibility with the Nest validation pipeline or the Next.js bundler
turns up in C2. Uniformity with Nest's `class-validator` convention is not a reason: DTO classes
cannot be shared with the browser without decorators and metadata reaching it.

---

### D21 — Database tests run against real PostgreSQL

**Decision.** Tests that claim database behaviour run against a real PostgreSQL instance reached
through `TEST_DATABASE_URL`, with the committed migration applied first. Not SQLite, and not a
mocked Prisma client. They live behind their own explicit, non-cached task, and **`pnpm test` keeps
starting no external service.**

**Reason.** The behaviour worth testing is precisely the part a substitute does not have: cascade
deletion, unique constraints, transaction rollback, timestamp and UUID generation. A mocked client
asserts that the code calls the library the way the test expects, which is not the same claim, and
SQLite would prove a different engine's semantics. Keeping it out of `pnpm test` preserves the
existing promise that the fast command builds nothing and starts nothing — the property that makes
it usable on every save.

**Consequence today.** One more command to know about, `pnpm test:db`, and a PostgreSQL that has to
be running for it. The safety gate refuses when the target is missing, malformed, not PostgreSQL,
named anything but `devsync_test`, or the same database as `DATABASE_URL`. `TEST_DATABASE_URL`
belongs to that tooling alone — the API never reads it, and an unset one does not stop the service
from starting. The suite is Vitest in `@devsync/database`, which made it the second Vitest
workspace and triggered [D4](#d4--one-shared-configuration-package)'s recorded move of the
runner-agnostic Vitest configuration into `@devsync/config`. The end-to-end suite depends on the
same tooling, because from C1 the API it starts will not run without a migrated database.

**Revisit if.** Per-worker database or schema isolation gets implemented, at which point the suite
can stop running serially. A container started by the test run itself is the recorded alternative to
requiring one to be up, and it is worth taking only if it does not smuggle a service start back into
`pnpm test`.

---

### D22 — `@devsync/database` is a built, CommonJS package

**Decision.** `@devsync/database` compiles to `dist/` with `tsc` and its `exports` map points at
JavaScript, not at `src/index.ts`. The output is **CommonJS**, and Prisma's generator is configured
to match with `moduleFormat = "cjs"`. It extends a new shared configuration,
`@devsync/config/tsconfig.library.json`; the four reserved packages keep
`tsconfig.package.json` and still emit nothing.

**Reason.** Two constraints, both from the repository rather than from preference. It has to
**build**, because it runs inside the API's production container, where there is no compiler — and
the alternatives are shipping TypeScript and hoping, or adding a runtime loader, both of which put
a compiler-shaped problem into production. It has to be **CommonJS**, because its only consumer is
`apps/api`: NestJS compiles to CommonJS, and its Jest suite loads modules through ts-jest's
CommonJS registry, which cannot `require` an ES module. An ESM package would have failed the API's
own tests before it ever reached a container.

**Consequence today.** The repository can no longer say every `packages/*` library emits nothing,
and `turbo.json` grew a `generate` task that `build`, `lint`, and `typecheck` depend on so the
generated client exists before anything reads it. `apps/api`'s production install names two
packages explicitly rather than using pnpm's `...` suffix, which would drag `@devsync/config` and
its TypeScript into the runtime image.

**Revisit if.** `apps/api` moves to ESM, at which point the CommonJS constraint disappears and the
generator's `moduleFormat` should follow. Or a second consumer appears that cannot use CommonJS —
the browser is not one, because it must never import this package at all.

---

### D23 — PostgreSQL is published on port 5433

**Decision.** Compose publishes PostgreSQL on host port **5433**, not the default 5432. Inside the
Compose network it is the ordinary 5432, so only host-side URLs carry the offset.

**Reason.** A developer with PostgreSQL already installed is listening on 5432, and the collision
is silent in the worst way: `docker compose up` succeeds, the host port is quietly taken by the
other server, and the first connection fails to authenticate against a database nobody meant to
use. This was not hypothetical — it happened on the machine C1 was built on, and cost the time it
takes to work out that the error came from the wrong PostgreSQL. The repository already moves ports
to avoid exactly this: Playwright uses 4310 and 4311 so a suite cannot silently test a development
server.

**Consequence today.** Every host-side URL — `.env.example`, the documentation, and the CI service
container's published port — says 5433, so the string is identical everywhere and nothing has to be
translated between a local run and a CI run. Anyone reading a connection string has one number to
notice.

**Revisit if.** Never, in substance; the cost is one unusual number in a URL, and the alternative
is an error message that means something other than what it says.

---

### D24 — File-name uniqueness is pinned to the `C` collation

**Decision.** `project_files.name` is declared `COLLATE "C"` in the initial migration, by hand,
because Prisma cannot express a collation. File names are therefore compared byte-wise, and
uniqueness within a project is case-sensitive wherever the migration is applied.

**Reason.** The C0 contract says file names are case-sensitive. Without pinning it, that would be a
property of whichever locale the server happened to be initialised with — true on a developer's
machine, and quietly false on a database created with a case-insensitive ICU collation. A rule that
holds by accident is a rule nobody has checked. `citext` and lowercased storage were both rejected:
they change what is stored or add an extension to solve a problem this product does not have.

**Consequence today.** One hand-edited line in a generated migration, with the reason written in
the SQL beside it. `prisma migrate diff` reports no drift, because Prisma does not model collations
at all — which is the same reason it could not generate the line. Two integration tests hold the
behaviour: `README.md` and `readme.md` coexist in one project, and a second `README.md` is
rejected.

**Revisit if.** Case-insensitive uniqueness turns out to be what users expect, which is a product
observation and a migration — and one that also needs a rule about which spelling survives a
collision.

---

## Related documents

| Document                             | Covers                                            |
| ------------------------------------ | ------------------------------------------------- |
| [`architecture.md`](architecture.md) | What these decisions produced, and the principles |
| [`roadmap.md`](roadmap.md)           | When each direction is scheduled to arrive        |
| [`development.md`](development.md)   | The daily workflow they add up to                 |
