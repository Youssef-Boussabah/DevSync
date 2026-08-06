# Decisions

The choices this repository has already made, why each was made, what it costs today, and what
would justify changing it.

This is one file rather than a directory of numbered records. A dozen entries do not need an ADR
framework, a status workflow, or a template with fields nobody fills in — and a heavier process
would be more overhead than the decisions it documents. If the list grows past the point where it
can be read in one sitting, splitting it is itself a decision worth recording here.

Entries marked **direction** are commitments about what will be built, not descriptions of what
exists. Nothing in a direction entry is installed.

| #                                                                             | Decision                                               |
| ----------------------------------------------------------------------------- | ------------------------------------------------------ |
| [D1](#d1--pnpm-and-turborepo)                                                 | pnpm workspaces and Turborepo                          |
| [D2](#d2--nextjs-for-the-web-application)                                     | Next.js for the web application                        |
| [D3](#d3--nestjs-for-the-api)                                                 | NestJS for the API                                     |
| [D4](#d4--one-shared-configuration-package)                                   | Shared configuration in `@devsync/config`              |
| [D5](#d5--reserved-package-boundaries-stay-empty)                             | Reserved packages stay empty                           |
| [D6](#d6--vitest-for-the-frontend-and-pure-typescript)                        | Vitest for the frontend                                |
| [D7](#d7--jest-retained-for-the-nestjs-api)                                   | Jest retained for `apps/api`                           |
| [D8](#d8--playwright-for-browser-and-full-stack-testing)                      | Playwright for browser tests                           |
| [D9](#d9--docker-compose-for-production-style-local-execution)                | Docker Compose locally                                 |
| [D10](#d10--one-workflow-four-independent-ci-jobs)                            | One workflow, four independent jobs                    |
| [D11](#d11--no-env-loading-yet)                                               | No `.env` loading yet — **superseded in C1**           |
| [D12](#d12--direction-monaco-and-yjs-for-collaborative-editing)               | **Direction:** Monaco + Yjs                            |
| [D13](#d13--direction-postgresql-before-redis)                                | **Direction:** PostgreSQL before Redis                 |
| [D14](#d14--direction-an-isolated-execution-runner)                           | **Direction:** an isolated runner                      |
| [D15](#d15--monaco-is-bundled-not-loaded-from-a-cdn)                          | Monaco is bundled, not loaded from a CDN               |
| [D16](#d16--prisma-owned-by-devsyncdatabase)                                  | Prisma, owned by one package                           |
| [D17](#d17--phase-c-is-single-user-and-deletion-is-permanent)                 | Single-user, and permanent deletes                     |
| [D18](#d18--flat-file-names-and-language-as-a-validated-string)               | Flat names, language as a validated string             |
| [D19](#d19--a-new-project-is-created-with-its-first-file)                     | Projects start with one file                           |
| [D20](#d20--zod-contracts-in-devsyncshared)                                   | Zod contracts in `@devsync/shared`                     |
| [D21](#d21--database-tests-run-against-real-postgresql)                       | Database tests use real PostgreSQL                     |
| [D22](#d22--devsyncdatabase-is-a-built-commonjs-package)                      | `@devsync/database` is built, and CommonJS             |
| [D23](#d23--postgresql-is-published-on-port-5433)                             | PostgreSQL is published on 5433                        |
| [D24](#d24--file-name-uniqueness-is-pinned-to-the-c-collation)                | File-name uniqueness uses the `C` collation            |
| [D25](#d25--devsyncshared-is-a-built-commonjs-package-carrying-zod-4)         | `@devsync/shared` is built, CommonJS, and owns Zod     |
| [D26](#d26--the-json-body-limit-is-1-mib-and-an-oversized-body-is-a-400)      | 1 MiB of JSON, and oversize is a `400`                 |
| [D27](#d27--the-apis-database-suite-runs-jest-with---experimental-vm-modules) | Jest needs `--experimental-vm-modules` for Prisma 7    |
| [D28](#d28--the-browser-api-url-is-a-build-time-public-variable)              | The browser API URL is public and build-time           |
| [D29](#d29--cors-allows-exactly-one-configured-origin)                        | CORS allows exactly one configured origin              |
| [D30](#d30--saving-is-explicit-and-there-is-no-autosave)                      | Saving is explicit; there is no autosave               |
| [D31](#d31--restart-validation-runs-in-its-own-compose-project)               | Restart validation is isolated, and its own command    |
| [D32](#d32--the-published-host-ports-are-variables-with-their-old-defaults)   | Published host ports are variables; defaults unchanged |

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

**Consequence today.** Ten workspaces, one lockfile, `pnpm lint` and `pnpm typecheck` covering
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

**Consequence today.** Two routes since C3 — `/` and `/projects/[projectId]` — the first static, the
second rendered on demand, with neither fetching project data on the server. `output: 'standalone'`
and `outputFileTracingRoot` are set so the production image can run a self-contained server with no
package manager. The `@/*` alias works identically in `next dev`, `next build`, and `tsc`, and is
restated in `vitest.config.mts` because Vitest does not read `tsconfig.json`. C3 added a second alias
there, for `@devsync/shared`, and one Next.js-specific fact turned out to matter more than expected:
`.env` is read from the application's own directory, not the repository root, so `next.config.ts`
loads the root file explicitly.

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

**Consequence today.** Four modules and eleven routes since C2 — configuration, the database
connection, health, and projects with the nested project files — with a browser calling them from
C3, which is the growth this decision was made for. The module system earned its place: adding the routes meant one `ProjectsModule` and
two thin controllers rather than a restructure. Two TypeScript settings are constrained by it:
`tsconfig.nest.json` cannot set `verbatimModuleSyntax` or `lib`, because `emitDecoratorMetadata`
needs injected classes to survive as values. `apps/api` still has no path alias in the code it
emits, because `tsc` does not rewrite aliases — the only `paths` entries anywhere are in
`tsconfig.test.json`, which never emits and is paired with a matching Jest resolver.

**Revisit if.** Nest's decorator metadata requirements start blocking a compiler setting that
matters more than the framework does. The "it stays this small" clause has expired.

---

### D4 — One shared configuration package

**Decision.** TypeScript and ESLint configuration live in `@devsync/config`. Prettier is
configured once at the repository root. A rule is added in one place, never in a workspace.

**Reason.** Ten workspaces with their own copies of a strictness setting drift within weeks, and
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

**Consequence today.** Three workspaces that lint, type-check, and report honestly that they have no
tests. Each `src/index.ts` is a documented `export {}`, and each README states the boundary and the
current state. `@devsync/database` was the fifth until C1 filled it — with a schema, a migration, a
data layer, and 57 database-backed tests — and `@devsync/shared` the fourth until C2 did, with the schemas the API
validates every request against. That is the outcome this decision was betting on, twice: the
boundary was already there, so filling it was a matter of writing the implementation rather than
agreeing where it should live. Neither arrived as a placeholder; both arrived with a consumer.

**Revisit if.** A package is still empty when the milestone that was supposed to fill it has come
and gone — that is evidence the boundary was wrong, and the workspace should be deleted rather
than kept as decoration.

---

### D6 — Vitest for the frontend and pure TypeScript

**Decision.** Vitest is the runner for `apps/web` and for any `packages/*` that gains testable
code. jsdom for components.

**Reason.** It shares Vite's transform pipeline with the tooling `apps/web` already uses, so TSX
needs no additional configuration, and it starts fast enough to run on every save.

**Consequence today.** 151 tests in `apps/web` since C3 — the home page, the project list, the
workspace, the API client, the language metadata, the draft model, and the editor wrapper — with the
API layer and Monaco replaced at their narrowest boundaries because jsdom can run neither.
`layout.tsx` cannot be tested here — it imports `next/font/google`, which only the Next.js compiler
resolves — so the metadata it declares is asserted by Playwright against the real document instead of
being re-implemented in a mock. C1 made `packages/database` the second Vitest workspace and C2 made
`packages/shared` the third, with 100 schema tests that run in Node and need nothing.

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
from the root. C2 added a second Jest suite in the same workspace — the PostgreSQL-backed one — with
its own configuration and its own file pattern, and one Jest-specific workaround recorded as
[D27](#d27--the-apis-database-suite-runs-jest-with---experimental-vm-modules).

**Revisit if.** A shared helper appears that both runners need and cannot both consume, or Nest's
testing utilities become runner-agnostic. A concrete technical reason — not uniformity, and not one
command-line flag.

---

### D8 — Playwright for browser and full-stack testing

**Decision.** Playwright owns `tests/e2e`, and it is the only layer allowed to start real
processes. Chromium only. No second browser-testing framework.

**Reason.** Convergence between clients is the central technical claim of this product, and it
cannot be proved by a single-client test. `browser.newContext()` produces fully isolated sessions
inside one browser process, so a single test can act as two users — which is exactly the shape
the collaboration tests will need. Nothing else in the ecosystem makes that as direct.

**Consequence today.** Fourteen tests since C3, and the first that are genuinely full-stack: they
build both applications, reset a disposable PostgreSQL, start the applications on ports 4310 and
4311, and drive a real browser through creating a project, typing into the real Monaco editor,
saving, reloading, and finding the work unchanged. The suite polls HTTP readiness rather than
sleeping, and `reuseExistingServer` is off so it can never pass by talking to a server someone
started by hand. Because it now **writes**, it runs serially — one worker against one schema — which
is the trade recorded in [`testing.md`](testing.md). One manual step per machine,
`pnpm test:e2e:install`, is the price.

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

**Revisit if.** Nothing outstanding. The trigger this entry named — the `web` → `api` edge — arrived
in C3, and the file now describes the whole graph: `web` after a healthy `api`, `api` after a healthy
database and a migration that exited 0. C3 also added the one build argument in the file,
`NEXT_PUBLIC_API_URL`, because `next build` embeds it; [`docker.md`](docker.md) is the full topology,
and [D28](#d28--the-browser-api-url-is-a-build-time-public-variable) is why it is an argument rather
than a variable.

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
`@devsync/database`, which `apps/api` depends on. **Redis is still absent**, and nothing in C1 or C2
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
Prisma CLI at all — the migration service is a separate image stage for exactly that reason. Keeping
the CLI out needs `--no-optional` alongside `--prod`, because `@prisma/client` declares it as an
optional peer; [`docker.md`](docker.md) has the mechanism. The
API loads the configuration and drives connect and disconnect through Nest's lifecycle. The routes
that use any of it are C2's.

**Revisit if.** The generated client turns out not to fit the workspace's consumed-as-source model,
or a query the product genuinely needs cannot be expressed. The recorded first move is a raw query
_through_ the package, not a second data-access path around it. Full details are in
[`architecture.md`](architecture.md#prisma-and-migrations).

---

### D17 — Phase C is single-user, and deletion is permanent

**Decision.** Projects and files carry no owner, no membership, no role, no visibility, no slug, no
archive state, and no `deletedAt`. Deleting a project permanently deletes it and, by cascade, its
files. No column, contract, or route is added in advance for any of it.

**Reason.** Every one of those fields is meaningless without identity, and identity is Phase H. A
nullable `ownerId` written by nothing and enforced by nothing is not a head start — it is a shape
that has to be unpicked before it can be used, and a constraint that reads as if authorization
exists when it does not. Soft deletion is the same trade in a worse form: it makes every query
carry a filter that Phase C has no reason to need, and the first query that forgets it becomes a
data-leak bug.

**Consequence today.** **The routes exist from C2, and every request to them is anonymous**: anyone
who can reach the API can read, rename, and permanently delete every project in it. The API is not
unreachable — it is published on a local host port, and Compose publishes it too — so this is
acceptable only **inside Phase C's local, single-user development boundary**. It is not suitable for
public deployment, and nothing in Phase C should be deployed where an untrusted client can reach it.
Phase H is what introduces real identity and authorization; until then the boundary is the network
the API is exposed on, which is a weaker guarantee than it sounds and is stated here so nobody
mistakes it for a strong one. **C3's CORS configuration does not change any of it** — it constrains
browsers and nothing else; see [D29](#d29--cors-allows-exactly-one-configured-origin). `DELETE` is
`204` and unrecoverable, and C3's interface says so: both delete confirmations use the word
"permanent", and neither offers an undo.

**Revisit if.** Phase H arrives, which it will. That milestone adds ownership and authorization,
and it is also the point at which recoverable deletion should be argued on its own merits rather
than smuggled in early.

---

### D18 — Flat file names, and language as a validated string

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

**Consequence today.** C1 made the schema and its collation enforce the composite
`(projectId, name)` rule and covered it with real PostgreSQL integration tests — a uniqueness
guarantee assumed from a database default is a guarantee nobody has checked. C2 put the identifiers
and their validator in `@devsync/shared`: an unsupported language is a `400 VALIDATION_FAILED` with
an issue on `language`, rejected at the boundary rather than reaching a constraint. **C3 made the
browser read them from there too**, which deleted the duplicated list in
`apps/web/src/editor/languages.ts` and, with it, the derived file name Phase B had shown. Name and
language are independent on the wire, in the schema, and now in the interface — `PATCH` accepts
either alone, three integration tests assert that changing one leaves the other untouched, and a
Playwright test proves the same thing through a real browser and a reload.

**Revisit if.** Real projects need directories — that is Phase F, and it is a migration that adds a
location, not a reinterpretation of the name. Or duplicate-looking names cause genuine confusion in
practice, at which point case-insensitive uniqueness is the recorded alternative.

---

### D19 — A new project is created with its first file

**Decision.** Creating a project also creates one file — `main.ts`, TypeScript, holding the starter
content `apps/api/src/projects/starter-file.ts` owns — in a single transaction. `apps/api` owns that
policy; `@devsync/database` owns the transaction. If either insert fails, neither row remains. A
project may later hold zero files, because the last one can be deleted.

**Reason.** An empty project is a dead end: the first thing a user sees is a view with nothing to
open. Doing it client-side, as a create followed by a second request, means every failure between
the two leaves an empty project behind and every client has to reimplement the same recovery. The
ownership split is what keeps it honest — a persistence layer with an opinion about what a new
project should say has to be edited for a product decision, so the content comes from the API and
only the atomicity comes from the package.

**Consequence today.** Implemented. C1 gave the database package the transaction;
**C2 put the policy in `apps/api/src/projects/starter-file.ts`** — one module holding the name, the
language, and the content — and `POST /projects` answers with the new file's identifier so a client
can open what it just created without listing the project to find one. An integration test watches
what the data layer was handed, so the policy cannot quietly migrate into the package. It answers a
**summary** rather than the starter content: a create is not the route that ships file contents. C3
rewrote the content itself, because the file it creates is now stored rather than held in a tab, and
the browser goes straight into the new project on the strength of the identifier the route answers
with.

**Revisit if.** Project templates appear, at which point the starter stops being one hard-coded file
and the policy — still in `apps/api` — becomes a choice. Or the first file proves unwanted, which
is a product observation rather than a technical one.

---

### D20 — Zod contracts in `@devsync/shared`

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

**Implemented in C2**, at Zod 4.4.3.

**Consequence today.** `@devsync/shared` publishes the four request schemas, the resource and
listing schemas, the identifier schemas, the five language identifiers, and the error contract — and
the type inferred from each. **Both applications validate against them and neither declares a Zod
dependency**: each calls `parseContract`, which returns either the parsed value or the issues already
in the published `{ path, message }` shape. The API validates every request that way through two
pipes; from C3 the browser parses every response the same way, so a route that grew a property or
dropped a timestamp fails at the client's parse rather than rendering as `undefined`. Zod therefore
stays an implementation detail of one package, and no DTO class or decorator exists anywhere. The
package now ships in the client bundle, which is the cost, and is why it must never grow anything
server-only.

**Revisit if.** Nothing outstanding. The incompatibility this entry was watching for — the Next.js
bundler and a CommonJS package — did not appear: Turbopack bundles it, and Zod with it, without a
second output format or a `transpilePackages` entry. Uniformity with Nest's `class-validator`
convention is still not a reason to change: DTO classes cannot be shared with the browser without
decorators and metadata reaching it.

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
be running for it — and, from C2, a fast suite that has to be able to run without the packages that
suite builds. `apps/api`'s Jest configuration reads `@devsync/shared` and `@devsync/database` from
source so `pnpm test` builds nothing, while `test:db` reads the compiled output; `@devsync/database`
carries an ORM-independent `contracts.ts` to make the first half possible. **C3 extended the same
arrangement to `apps/web`**, which now depends on `@devsync/shared` too — one alias in
`vitest.config.mts`, and the fast command still builds nothing. `testing.md` has the mechanism. The safety gate refuses when the target is missing, malformed, not PostgreSQL,
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
generated client exists before anything reads it — deliberately **not** `test`, which reads source
and must keep building nothing. `apps/api`'s production install names its
workspaces explicitly — three of them since C2 — rather than using pnpm's `...` suffix, which would
drag `@devsync/config` and its TypeScript into the runtime image.
[D25](#d25--devsyncshared-is-a-built-commonjs-package-carrying-zod-4) applied the same reasoning to
`@devsync/shared`, which is what the `tsconfig.library.json` this decision introduced was for.

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

### D25 — `@devsync/shared` is a built, CommonJS package carrying Zod 4

**Decision.** `@devsync/shared` compiles to `dist/` with `tsc` and its `exports` map points at
JavaScript, not at `src/index.ts`. The output is **CommonJS**, so the package carries no
`"type": "module"`. Zod 4 is a runtime dependency of that package and of no other: `apps/api`
declares none, and reaches every schema through `parseContract`.

**Implemented in C2**, at Zod 4.4.3, extending `@devsync/config/tsconfig.library.json` — the
configuration [D22](#d22--devsyncdatabase-is-a-built-commonjs-package) added for `@devsync/database`.

**Reason.** The same two constraints that made the data layer a built CommonJS package, arriving for
the same consumer. It has to **build**, because it runs inside the API's production container where
there is no compiler. It has to be **CommonJS**, because `apps/api` compiles to CommonJS and its
ts-jest suite loads modules through a registry that cannot `require` an ES module — an ESM package
would have failed the API's own tests before it ever reached a container. Keeping Zod inside the
package is the separable half of the decision: two workspaces declaring their own Zod range is two
places for a validator and a type to end up disagreeing, and a consumer that never imports Zod
cannot import a different one.

**Consequence today.** No bundler, no `tsup`, no dual package, and no runtime TypeScript loader — a
second output format waits for a consumer that proves one necessary, and **the Next.js client that
arrived in C3 did not**: Turbopack bundles the CommonJS output, and the Zod inside it, into the
chunks it emits without complaint or configuration. A consumer wanting a schema type without
importing Zod gets `ContractSchema`, `ContractValue`, and `ContractResult` from the package instead.

The cost is a build that has to happen first, and it applies to **most** of the repository's
commands rather than all of them:

| Needs `@devsync/shared` built                                                  | Reads its source instead |
| ------------------------------------------------------------------------------ | ------------------------ |
| `pnpm build` — production compilation, including `next build`                  | `pnpm test`              |
| `pnpm typecheck` — the repository-wide check against `dist`                    | `pnpm test:unit`         |
| `pnpm lint` — type-aware rules read the compiled declarations                  | `pnpm test:coverage`     |
| `pnpm test:db` — the API's PostgreSQL-backed suite loads the compiled packages |                          |
| `node apps/api/dist/main.js`, `next start`, and both container images          |                          |

Those three fast commands declare **no** `dependsOn` in `turbo.json`, deliberately: `apps/api`'s
fast Jest configuration maps `@devsync/shared` to its real `src/index.ts` and `@devsync/database` to
its ORM-independent `src/contracts.ts`, and from C3 `apps/web`'s Vitest configuration maps
`@devsync/shared` the same way — so `pnpm test` runs with nothing built and no Prisma Client
generated. Those are the real modules, not copies. `pnpm test:db` carries no such mapping, because
proving the compiled packages work is the only thing it is for, and production resolves both
packages through their `exports` maps to `dist/index.js` exactly as this decision intends.
[`testing.md`](testing.md#how-the-fast-suites-run-with-nothing-built) has the mechanism.

**Revisit if.** `apps/api` moves to ESM, at which point the CommonJS constraint disappears for both
packages at once. The other trigger this entry named — a real cost for CommonJS interop in the
browser bundle — did not materialise in C3.

---

### D26 — The JSON body limit is 1 MiB, and an oversized body is a `400`

**Decision.** `apps/api` accepts up to **1,048,576 bytes** of JSON, set once at bootstrap in
`configureHttpApplication`. A body over that limit answers `400 VALIDATION_FAILED` in the shared
error shape — **not** the `413` and the HTML-ish body Express produces on its own. A body that is not
valid JSON answers the same way.

**Implemented in C2.** C0 deliberately left the number to the milestone that could test it.

**Reason.** Express defaults to 100 kB, which is small for a source file and would reject
legitimate work. A mebibyte is comfortably larger than any plausible file while still being a clear
boundary against accidental or malformed input; it is **not** a quota, and no per-project size,
file-count, or rate limit exists. The status is a `400` because a client that sent something the
server could not read has made a request error, and because a route answering with one shape and the
body parser answering with another gives a client two error formats to handle for the same class of
mistake. Doing that uniformly needs a translation **in front of the router**, because Nest rewrites a
parser's `SyntaxError` into its own `BadRequestException`, message and all, before any exception
filter is consulted.

**Consequence today.** One `ErrorRequestHandler` registered immediately after the JSON parser, and
one number that `main.ts` and the integration tests share, so the limit under test is the limit that
runs. A file of a million characters is accepted and one over the limit is refused, both asserted
against the real application.

**Revisit if.** A real file is rejected — the number is a ceiling chosen against what source files
weigh, not a measured constant, and moving it is a one-line change. A genuine quota system, if one is
ever wanted, is a different feature and belongs to the phase that owns resource limits.

---

### D27 — The API's database suite runs Jest with `--experimental-vm-modules`

**Decision.** `apps/api`'s `test:db` script invokes Jest through
`node --experimental-vm-modules node_modules/jest/bin/jest.js` rather than through the `jest` shim.
The fast suite does not.

**Reason.** Prisma 7 loads its WebAssembly query compiler with a dynamic `import()`, and Jest's
sandbox refuses one without that flag. Without it the real client cannot open a connection from
inside a test at all: every test fails at `app.init()` with `A dynamic import callback was invoked
without --experimental-vm-modules`. This is a Jest constraint rather than a Prisma defect —
`packages/database`'s Vitest suite needs nothing, because Vite's runtime supports dynamic import
natively.

Invoking Jest's entry point through `node` is what makes the flag work everywhere. The
`NODE_OPTIONS=… command` form is POSIX shell syntax and fails on Windows, where pnpm runs scripts
through `cmd.exe`, and this repository is developed on Windows.

**Consequence today.** One experimental-feature warning per run of `pnpm test:db`. The tests
themselves are unaffected and stay CommonJS. The flag is deliberately **not** on the fast suite:
nothing there opens a connection, and a flag carried where it is not needed is a flag nobody
remembers the reason for.

**Revisit if.** Jest enables VM modules by default, or Prisma ships a query compiler that does not
need a dynamic import. Moving `apps/api` to Vitest to avoid the flag is not the answer —
[D7](#d7--jest-retained-for-the-nestjs-api) needs a stronger reason than one command-line argument.

---

### D28 — The browser API URL is a build-time, public variable

**Decision.** `apps/web` reads one variable, `NEXT_PUBLIC_API_URL`, holding the API **origin**. It is
validated once, in `src/api/api-url.ts`, at module scope; there is no default, no fallback to
`window.location`, and no Next.js route handler or proxy in front of the API. The browser calls
`apps/api` directly.

**Implemented in C3.**

**Reason.** A client that guessed where its API was would find one on the wrong host the first time
it was deployed anywhere, and guessing from `window.location` bakes in an assumption — same origin —
that is false in every arrangement this repository actually runs, including Compose. Validating an
**origin** rather than a base URL is the same reasoning applied one level down: DevSync's API has no
global prefix, so a path, a query, a fragment, or credentials in that value would each mean the
author was describing something else, and silently trimming it would hide the mistake until a request
404ed.

A Next.js proxy was the obvious alternative and was rejected. It would have removed the need for
CORS by adding a second hop that has to be operated, secured, and reasoned about — and it would have
made the deployed topology quietly different from the one
[`architecture.md`](architecture.md#the-system-today--implemented) draws, where the browser reaches
the API and the API reaches the database.

**Consequence today.** Three things follow from `NEXT_PUBLIC_*` being **inlined by `next build`**
rather than read at runtime, and each is visible somewhere else in the repository. The value is
**public**, so no server-only value may ever be given such a name — a database URL there would be a
published credential. A build for one API origin **cannot be reused** for another, so the variable is
in the `build` task's `env` in `turbo.json`, and `tests/e2e/tools/run-e2e.mjs` sets it before
Turborepo builds anything. And the Docker image takes it as a **build argument**, whose value must be
the host-published address rather than the Compose service name, because the browser is not on the
Compose network.

The costs are real and accepted: changing the API origin is a rebuild, `pnpm build` now fails without
the variable, and CI has to set it. `apps/web`'s Vitest configuration supplies its own value, which
is what keeps `pnpm test` runnable with no environment at all.

**Revisit if.** DevSync is ever served from the same origin as its API — behind one reverse proxy,
say — at which point a same-origin default becomes defensible. That is a deployment decision and
belongs to the phase that makes one.

---

### D29 — CORS allows exactly one configured origin

**Decision.** `apps/api` requires `WEB_ORIGIN`, validated as an exact `http:` or `https:` origin, and
allows cross-origin requests from that origin and no other. No wildcard, no pattern, no reflected
origin, and no credentials. The allowed methods are the five the client uses and the one allowed
request header is `Content-Type`. It is registered in `configureHttpApplication`, so the running
service, the fast HTTP tests, and the PostgreSQL-backed suite are configured identically.

**Implemented in C3**, which is when the first legitimate cross-origin browser request existed.

**Reason.** A wildcard would let any page on the internet make requests to a developer's API on
behalf of their browser, and this API is anonymous — there is nothing behind it to refuse. Reflecting
whatever `Origin` arrives is the same thing spelled differently. A required variable with no default
is the other half: an API that guessed which site may read it would have stopped enforcing anything,
and a default of `localhost:3000` would be a guess that looks like a policy.

Credentials are off because DevSync sends none. Turning them on would widen what another origin could
attempt in exchange for nothing the product asked for, and it is the setting that makes a wildcard
illegal anyway.

**What this is not.** **CORS is not access control.** It constrains browsers, and it protects nothing
from `curl`. Every request to this API is still anonymous, and the boundary in Phase C is the network
the API is exposed on — see [D17](#d17--phase-c-is-single-user-and-deletion-is-permanent). Phase H is
what makes it safe.

**Consequence today.** One more required variable, set in `.env.example`, in Compose, in
`apps/api/tests/global-setup.mjs`, and in the Playwright `webServer` block. The exactness has a
usability edge that has to be documented rather than smoothed over: `http://localhost:3000` and
`http://127.0.0.1:3000` are different origins to a browser, so DevSync has to be opened at the
address `WEB_ORIGIN` names. Seventeen fast tests and two end-to-end tests hold the policy, and the
`docker` CI job checks it through the real stack.

**Revisit if.** DevSync is served from more than one origin — a staging host alongside production,
or a domain and its `www` — at which point the value becomes a list and the validator checks each
entry. A wildcard is not the recorded alternative, and reflecting arbitrary origins never is.

---

### D30 — Saving is explicit, and there is no autosave

**Decision.** A file's contents reach the database when the user presses Save, and at no other time.
The workspace keeps the persisted resource and the browser draft apart, sends only the properties
that differ, shows saved, unsaved changes, saving, and failed, and never discards a draft without a
deliberate confirmation. **Nothing is written to browser storage** — no `localStorage`,
`sessionStorage`, IndexedDB, or service-worker cache.

**Implemented in C3.**

**Reason.** Autosave is a good feature and a bad first one. It needs debouncing, request coalescing,
a conflict story for the save that is still in flight when the next keystroke lands, and an answer
for what a failed background write should do to a user who has moved on — and every one of those
answers is easier to design once the collaboration model exists, because Phase E replaces the
question entirely: a CRDT synchronises continuously and "saving" stops being an event. Building an
autosave now would mean building it twice.

Explicit saving also makes the state legible, which is the property this milestone is judged on: a
user can tell what is stored and what is not, and the four visible states say which. Browser storage
was rejected for a related reason — a draft cached in one tab is a second source of truth that has to
be reconciled with the server, invalidated, and explained, and Phase C has one source of truth on
purpose.

**Consequence today.** A Save button, disabled until something changes, and a confirmation before
anything that would abandon a draft — switching file, adding a file, deleting the open file,
deleting the project, or leaving for the list — plus a `beforeunload` warning for the ways out the
application does not control. A user who closes the tab through the dialog loses the draft, and that
is the stated behaviour rather than a gap.

**Revisit if.** Phase E arrives, which changes the question rather than answering it: with a CRDT
there is no draft to save. If autosave is ever wanted before then, the recorded first move is to keep
the explicit Save and add a background write on top of the same draft model, not to replace it.

---

### D31 — Restart validation runs in its own Compose project

**Decision.** C4's automated, full-stack proof that data survives a restart — the layer above C1's
data-access lifecycle tests, not a replacement for them — runs under `pnpm test:restart`, in a Compose
project called `devsync-c4-validation` with its own network, its own volume, and its own published
ports — never against the `devsync` project a developer works in. It is a separate root command and
is deliberately **not** part of `pnpm test:all`. The isolation is enforced in code: every Compose
invocation's project name is checked before the process is spawned, the cleanup reads the volumes
Docker labels as this project's and refuses the batch if one falls outside the prefix, and the run
proves afterwards that the development project's volumes are unchanged.

**Implemented in C4.**

**Reason.** The scenario is destructive by nature. It stops an API mid-flight, takes a database away
from it, and ends by deleting a volume — and the volume beside it, `devsync_postgres_data`, holds
every project a developer has. A validation that could reach the wrong one would be a worse bug than
anything it was written to catch, so "it does not touch the development stack" had to be a property
of the code rather than a claim in a document. Compose already offers exactly the boundary needed:
a project name scopes containers, networks, and volumes, and `--project-name` beats the `name:` key
in the file.

The command is separate for a different reason. `pnpm test:all` is the host ladder — three commands
that need a PostgreSQL somebody started — and `test:restart` is the only command in the repository
that needs a **Docker daemon**. Folding it in would make a pre-push command start failing on a
machine with no daemon, and would put an image build in front of a suite whose value is being quick
to reach. CI runs both, in different jobs, so nothing is skipped by the split.

**Consequence today.** One more root command and one more workspace, `tests/restart`. The `api` and
`migrate` images are built a second time under the validation project's name — a re-tag, because
every layer is already in the BuildKit cache — and the `web` image is not built at all, because no
C4 scenario opens a page. A developer can run the validation with their own stack up, `pnpm dev`
running, and `pnpm test:e2e` in flight.

**Revisit if.** A second validation needs the same isolation, at which point the project name and
the guards belong in something shared rather than in one workspace. Or if Compose gains a way to
express "a disposable copy of this stack" directly, which would make the project-name convention
unnecessary.

---

### D32 — The published host ports are variables with their old defaults

**Decision.** `compose.yaml` publishes `${WEB_HOST_PORT:-3000}`, `${API_HOST_PORT:-3001}`, and
`${POSTGRES_HOST_PORT:-5433}` rather than three literals, and derives `WEB_ORIGIN` and the
`NEXT_PUBLIC_API_URL` build argument from the first two. Container-side ports and everything Compose
passes between services are unchanged, and `.env.example` documents the three commented out, so
copying it changes nothing.

**Implemented in C4.**

**Reason.** [D31](#d31--restart-validation-runs-in-its-own-compose-project) needs a second copy of
this stack running beside a developer's own, and two stacks cannot publish the same port. The
alternatives were worse. A second Compose file would be a second production topology to keep in step
with the first, and the point of C4 is to validate the images and the service graph that actually
ship — a copy would validate the copy. An override file layered on top would be a third file to read
before understanding what runs. Three variables with their previous values as defaults change nothing
for anyone who does not set them, which is the smallest change that makes the isolation possible.

`WEB_ORIGIN` and `NEXT_PUBLIC_API_URL` follow the ports rather than restating them because they are
the two halves of one browser boundary: a stack published on another port whose API still allowed
`http://127.0.0.1:3000` would answer every request without an allow-origin header, and the failure
would look like a CORS bug rather than a port mismatch.

**Consequence today.** Three variables that `compose.yaml` reads and no application does. Overriding
`API_HOST_PORT` for a stack that serves pages means rebuilding the web image, because that value is
embedded by `next build` — which is [D28](#d28--the-browser-api-url-is-a-build-time-public-variable)
and not new. The restart validation avoids that entirely by never starting the web service.

**Revisit if.** More of the Compose configuration needs to vary per stack, at which point the honest
answer is a documented override file rather than a growing list of variables — or if a second
production topology becomes genuinely necessary, which it is not for one disposable validation.

---

## Related documents

| Document                             | Covers                                            |
| ------------------------------------ | ------------------------------------------------- |
| [`architecture.md`](architecture.md) | What these decisions produced, and the principles |
| [`roadmap.md`](roadmap.md)           | When each direction is scheduled to arrive        |
| [`development.md`](development.md)   | The daily workflow they add up to                 |
