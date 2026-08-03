# Decisions

The choices this repository has already made, why each was made, what it costs today, and what
would justify changing it.

This is one file rather than a directory of numbered records. A dozen entries do not need an ADR
framework, a status workflow, or a template with fields nobody fills in — and a heavier process
would be more overhead than the decisions it documents. If the list grows past the point where it
can be read in one sitting, splitting it is itself a decision worth recording here.

Entries marked **direction** are commitments about what will be built, not descriptions of what
exists. Nothing in a direction entry is installed.

| #                                                               | Decision                                  |
| --------------------------------------------------------------- | ----------------------------------------- |
| [D1](#d1--pnpm-and-turborepo)                                   | pnpm workspaces and Turborepo             |
| [D2](#d2--nextjs-for-the-web-application)                       | Next.js for the web application           |
| [D3](#d3--nestjs-for-the-api)                                   | NestJS for the API                        |
| [D4](#d4--one-shared-configuration-package)                     | Shared configuration in `@devsync/config` |
| [D5](#d5--reserved-package-boundaries-stay-empty)               | Reserved packages stay empty              |
| [D6](#d6--vitest-for-the-frontend-and-pure-typescript)          | Vitest for the frontend                   |
| [D7](#d7--jest-retained-for-the-nestjs-api)                     | Jest retained for `apps/api`              |
| [D8](#d8--playwright-for-browser-and-full-stack-testing)        | Playwright for browser tests              |
| [D9](#d9--docker-compose-for-production-style-local-execution)  | Docker Compose locally                    |
| [D10](#d10--one-workflow-three-independent-ci-jobs)             | One workflow, three independent jobs      |
| [D11](#d11--no-env-loading-yet)                                 | No `.env` loading yet                     |
| [D12](#d12--direction-monaco-and-yjs-for-collaborative-editing) | **Direction:** Monaco + Yjs               |
| [D13](#d13--direction-postgresql-before-redis)                  | **Direction:** PostgreSQL before Redis    |
| [D14](#d14--direction-an-isolated-execution-runner)             | **Direction:** an isolated runner         |
| [D15](#d15--monaco-is-bundled-not-loaded-from-a-cdn)            | Monaco is bundled, not loaded from a CDN  |

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

**Consequence today.** Five workspaces that lint, type-check, and report honestly that they have
no tests. Each `src/index.ts` is a documented `export {}`, and each README states the boundary and
the current state.

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

**Consequence today.** Seven tests that build both applications, start them on ports 4310 and
4311, and check that each answers, that the editor region paints, and that the language selector
over it works in a real browser. The suite polls HTTP readiness rather than sleeping, and
`reuseExistingServer` is off so it can never pass by talking to a server someone started by hand.
One manual step per machine, `pnpm test:e2e:install`, is the price.

**Revisit if.** Browser-specific behaviour appears that Chromium alone cannot catch — the editor
and the collaboration transport are the likely candidates. Cross-browser coverage earns its place
then, not before.

---

### D9 — Docker Compose for production-style local execution

**Decision.** Two multi-stage production images and one root `compose.yaml`. Nothing else: no
database, cache, queue, volume, named network, or `depends_on` edge.

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

**Revisit if.** Phase C introduces PostgreSQL, which is the first service that will genuinely
belong in Compose, and the first `depends_on` edge along with it.

---

### D10 — One workflow, three independent CI jobs

**Decision.** A single `.github/workflows/ci.yml` with `quality`, `e2e`, and `docker` jobs that
do not depend on one another. CI runs the same commands a developer runs, holds `contents: read`,
uses no secrets, and never rewrites the tree.

**Reason.** Passing a build between jobs would make the end-to-end and Docker jobs prove less than
they appear to: each would be exercising an artifact assembled elsewhere rather than the workflow
a developer or a production image actually follows. Independence costs a duplicated install and
buys three complete, honest reproductions. Keeping every command identical to a local one means a
red run never requires reading CI internals to reproduce.

**Consequence today.** Dependencies install twice, and Playwright's Chromium downloads on every
`e2e` run — both recorded as known costs rather than optimised away with something fragile. CI
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

**Consequence today.** `API_PORT` must be set in the shell to change the API's port, and
`compose.yaml` passes it explicitly rather than relying on a file. `.dockerignore` keeps every
`.env*` file out of both build contexts.

**Revisit if.** The first milestone that needs more than a port — a database URL, in Phase C.
Loading, validation, documentation, and ignore rules arrive together at that point.

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

**Consequence today.** No database, ORM, migration, or connection exists. `@devsync/database` is
an empty boundary, and `apps/api` does not depend on it. Compose contains no data service.

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

## Related documents

| Document                             | Covers                                            |
| ------------------------------------ | ------------------------------------------------- |
| [`architecture.md`](architecture.md) | What these decisions produced, and the principles |
| [`roadmap.md`](roadmap.md)           | When each direction is scheduled to arrive        |
| [`development.md`](development.md)   | The daily workflow they add up to                 |
