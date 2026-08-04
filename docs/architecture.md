# Architecture

What DevSync is made of today, where the boundaries are drawn, and which of those boundaries are
real code rather than reserved space.

DevSync is intended to become a browser-based collaborative development environment. **Almost
none of that product exists yet.** What exists is a monorepo, two small applications — one of
which now hosts a Monaco editor — a shared configuration package, three testing layers, two
production images, and a CI workflow. This document describes that, and separates it from the
design the repository is being shaped towards.

## How to read this document

Everything below is labelled as exactly one of three things, and the labels are load-bearing:

| Label           | Meaning                                                                     |
| --------------- | --------------------------------------------------------------------------- |
| **Implemented** | Code exists, runs, and is exercised by a test or a check                    |
| **Reserved**    | A workspace and a boundary exist; the implementation is deliberately absent |
| **Planned**     | Neither code nor workspace-level commitment — a direction, and nothing more |

A planned system described in the present tense would make this document lie about the
repository, which is the specific failure it exists to prevent.

## The system today — implemented

Two independent HTTP applications, each serving one route, neither of which calls the other.

```mermaid
flowchart LR
    client["Browser / HTTP client"]

    subgraph running["Running processes"]
        web["apps/web<br/>Next.js 16, App Router<br/>port 3000"]
        api["apps/api<br/>NestJS 11 on Express<br/>port 3001"]
    end

    client -->|"GET / — the home page and its editor"| web
    client -->|"GET /health — JSON status"| api
    web -.->|"no call exists yet"| api
```

That dotted edge is the whole of the current inter-service story: `apps/web` serves a prerendered
page whose editor runs entirely in the browser, and never contacts `apps/api`. There is no shared
session, no proxy, no API client, and no serialisation format agreed between them. The first real
edge between the two applications belongs to the milestone that gives them something to say to
each other.

There is also no database, cache, queue, message broker, background worker, or scheduler
anywhere in the repository. Nothing DevSync runs today writes to persistent storage of any kind.

## Repository structure

A pnpm workspace with a Turborepo task graph over it. Nine workspaces, plus the root project that
owns the shared tooling.

```text
devsync/
├── apps/
│   ├── web/                  Next.js client                        implemented
│   └── api/                  NestJS HTTP service                   implemented
├── packages/
│   ├── config/               Shared TypeScript and ESLint config   implemented
│   ├── shared/               Types, schemas, protocol              reserved
│   ├── collaboration/        Real-time collaboration logic         reserved
│   ├── database/             Schema and data access                reserved
│   ├── ui/                   Reusable interface components         reserved
│   └── test-utils/           Shared test helpers                   reserved
├── tests/
│   └── e2e/                  Playwright browser and HTTP suite     implemented
├── .github/workflows/ci.yml  Quality, end-to-end, and Docker jobs  implemented
├── compose.yaml              The web and API services              implemented
├── turbo.json                Task graph
├── pnpm-workspace.yaml       Workspace globs: apps/*, packages/*, tests/*
└── prettier.config.mjs       Formatting, for the whole repository
```

| Workspace                | Package name             | Kind        | Builds | Emits            |
| ------------------------ | ------------------------ | ----------- | ------ | ---------------- |
| `apps/web`               | `@devsync/web`           | Application | `next` | `.next/`         |
| `apps/api`               | `@devsync/api`           | Application | `nest` | `dist/`          |
| `packages/config`        | `@devsync/config`        | Config      | no     | nothing          |
| `packages/shared`        | `@devsync/shared`        | Reserved    | no     | nothing          |
| `packages/collaboration` | `@devsync/collaboration` | Reserved    | no     | nothing          |
| `packages/database`      | `@devsync/database`      | Reserved    | no     | nothing          |
| `packages/ui`            | `@devsync/ui`            | Reserved    | no     | nothing          |
| `packages/test-utils`    | `@devsync/test-utils`    | Reserved    | no     | nothing          |
| `tests/e2e`              | `@devsync/e2e`           | Test suite  | no     | reports, ignored |

All nine participate in `pnpm lint` and `pnpm typecheck`. None is excluded from either, and the
two that build are the only two that produce a deployable artifact.

### Why the `packages/*` libraries do not build

Each is consumed as TypeScript source through its `exports` map — `".": "./src/index.ts"` — so
the application importing one compiles it. They are type-checked in place with `tsc --noEmit` and
never emit JavaScript. That keeps the workspace graph simple while there is nothing to publish,
and it means a package cannot go stale relative to its own build output, because it has none.

## `apps/web` — implemented

| Property     | Value                                                     |
| ------------ | --------------------------------------------------------- |
| Framework    | Next.js 16, App Router, React 19                          |
| Styling      | Tailwind CSS v4, through `@tailwindcss/postcss`           |
| Editor       | Monaco, through `@monaco-editor/react`                    |
| Routes       | `/` only                                                  |
| Alias        | `@/*` → `./src/*`                                         |
| Dev port     | 3000                                                      |
| Build output | `.next/`, including `.next/standalone` and `.next/static` |
| Tests        | Vitest, jsdom, 36 component tests                         |

`src/app/layout.tsx` declares the document metadata and loads two fonts through
`next/font/google`. `src/app/page.tsx` is a synchronous Server Component that renders the
project's name, a one-line description, an honest statement of what is not built yet, and the
workspace. **There is no file tree, no project view, no editor tabs, no state management library,
and no data fetching of any kind.**

### The workspace — implemented

`src/editor/local-editor-workspace.tsx` is a client component holding two pieces of React state:
the contents of the single open file, and the language those contents are read as. It seeds them
from a short TypeScript sample and TypeScript, passes both to the editor, and takes edits back
through a callback. That is the entire model — there is no file list, no file identifier, no
project, and no store.

Both are browser memory and only browser memory. Neither is ever read from or written to
`localStorage`, IndexedDB, a cookie, or the network, so unmounting the component or reloading the
page starts again from the sample, as TypeScript. That is the behaviour, not a limitation waiting
to be patched: the milestone that makes editing survive a reload is a later one, and it arrives
with a real store behind it.

Ownership matters more than it looks. Before this, the contents lived inside Monaco's model and no
other part of the application could read them; a language switch, a second pane, or a CRDT binding
would each have had to reach into the editor to find out what the user had typed. With the value in
React state, those become a matter of passing a prop — which is exactly what the language selection
below turned out to be.

### The language selection — implemented

`src/editor/languages.ts` is a five-entry readonly list, and it is the only source of truth for
what a language is: its Monaco identifier, the label a user reads, and the name the file is shown
under while it is being read that way.

| Label      | Monaco language | File shown as |
| ---------- | --------------- | ------------- |
| TypeScript | `typescript`    | `main.ts`     |
| JavaScript | `javascript`    | `main.js`     |
| Python     | `python`        | `main.py`     |
| JSON       | `json`          | `data.json`   |
| Markdown   | `markdown`      | `README.md`   |

**This is one file under five readings, not five files.** There is one buffer, and changing the
language changes only how Monaco interprets it: the content is passed through untouched, so nothing
is reset, translated, or replaced. There is no starter template per language, no language
detection, and no inference from a file name — the name is derived from the language, never the
other way round, and **nothing resolves it**. There is no path, directory, or second file it could
be distinguished from.

The control is a native `<select>` with a visible `<label>`, which is what a five-option choice
should be: keyboard behaviour, the accessible name, and the platform's own picker come for free,
and no component library was added to reproduce them. The DOM reports the chosen value as an
ordinary string, so it is resolved back against the list rather than asserted to belong to it; a
value that is not offered is ignored, which is what keeps the state narrowly typed with no cast.

The list lives in `apps/web` because it has exactly one consumer. It moves to `packages/` when a
second one exists, under the rule in [Boundaries stay separated](#boundaries-stay-separated) — not
before, and it needs no registry, plugin point, or configuration layer to get there.

### The editor — implemented

`src/editor/code-editor.tsx` renders one Monaco editor and is **controlled**: it displays the value
its caller gives it and reports edits back, rather than owning content of its own. Four properties
of it are architectural rather than cosmetic.

- **Monaco never runs on the server.** A client component is still rendered during SSR, and
  `monaco-editor` reads browser globals as it initialises, so the package is imported from an
  effect rather than at module scope. The route therefore still prerenders as static content, and
  the page's first paint is a loading message rather than an editor.
- **Monaco is bundled, not fetched.** `@monaco-editor/react` loads Monaco from a CDN by default;
  the component overrides that with `loader.config({ monaco })` so the copy in `node_modules` is
  the one used. Without this the production image would depend on a third-party host at runtime,
  which no other part of DevSync does.
- **Monaco's language workers are declared in application source.** Monaco points at its own
  worker entry points, but Turbopack copies those out of `node_modules` as static files instead of
  compiling them, and they fail on their first import. `src/editor/workers/` holds three one-line
  re-exports that Turbopack does compile — the editor's own worker, the TypeScript and JavaScript
  language service, and JSON's — and `MonacoEnvironment.getWorker` routes to them by label. A
  language service with a worker of its own needs an entry there, because the fallback answers the
  generic requests and none of the language-specific ones; Python and Markdown need none, as both
  are tokenised in the main thread.
- **A change without a value is not a change.** Monaco's callback reports `string | undefined`, and
  `undefined` means it had no content to hand over rather than that the file is now empty. It is
  dropped, so it can never blank the caller's state. An empty string is forwarded, because a file
  the user has cleared is a real edit.

Editor content lives in the browser and nowhere else. **Nothing is saved, sent, or shared**, and a
reload discards it.

Two configuration choices in `next.config.ts` matter to the rest of the system:

- **`output: 'standalone'`** emits a self-contained server tree, which is what the production
  image runs. It is an additional output, so `next dev` and `next start` are unaffected.
- **`outputFileTracingRoot`** points at the repository root. Left at its default, module tracing
  would begin at `apps/web` and miss everything pnpm resolved through the workspace store,
  producing a bundle that cannot boot.

## `apps/api` — implemented

| Property      | Value                                                       |
| ------------- | ----------------------------------------------------------- |
| Framework     | NestJS 11, on the Express platform adapter                  |
| Modules       | `AppModule` → `HealthModule` → `HealthController`           |
| Routes        | `GET /health`                                               |
| Configuration | `API_PORT`, read from the process environment, default 3001 |
| Dev port      | 3001                                                        |
| Build output  | `dist/`, compiled by `tsc` through the Nest CLI             |
| Tests         | Jest, 1 HTTP-level application test                         |

The whole service is one endpoint:

```http
GET /health  →  200  {"status":"ok","service":"devsync-api"}
```

The response shape is typed by the `HealthResponse` interface in
`src/health/health.controller.ts`, and the exact payload is asserted in three separate places —
the Jest test, the Playwright test, and the Docker job in CI — because it is the only contract
this repository currently has.

`main.ts` calls `app.listen(port)` with no host argument, so Node binds the unspecified address
and accepts both IPv4 and IPv6. That is deliberate: pinning it to `0.0.0.0` would narrow it to
IPv4 and break `localhost` on machines that resolve it to `::1` first, including Windows.

**There is no global prefix, no validation pipe, no exception filter, no interceptor, no guard,
no authentication, no CORS configuration, and no versioning scheme.** Each of those is a real
decision, and each belongs to the milestone that first needs it rather than to a foundation that
would only be guessing.

## `packages/config` — implemented

The only `packages/*` workspace with contents. It is private, never published, and contains no
runtime code: everything it exports is consumed at build, lint, or type-check time.

- **Five TypeScript configurations** — a strict `tsconfig.base.json` carrying correctness
  settings only, and four layered on top of it, one per kind of workspace: `package`, `nest`,
  `next`, and `playwright`.
- **Two ESLint builders** — `eslint/base` for `packages/*` and `apps/web`, and `eslint/nest`
  layered on it for `apps/api`.

Two deviations in `tsconfig.nest.json` are load-bearing rather than oversights: it omits
`verbatimModuleSyntax` and `lib`, because `emitDecoratorMetadata` needs injected classes to
survive as values. [`packages/config/README.md`](../packages/config/README.md) is the full
account of what each configuration sets and why.

Prettier is deliberately **not** owned here. It is configured once at the repository root, and
ESLint does not run it as a rule, so exactly one tool reformats code.

## Reserved package boundaries

Five workspaces exist, are linted and type-checked, and export nothing. Each `src/index.ts` is a
documented `export {}`.

| Package                  | Reserved for                                                        |
| ------------------------ | ------------------------------------------------------------------- |
| `@devsync/shared`        | Types, runtime schemas, constants, and the collaboration protocol   |
| `@devsync/collaboration` | The shared document model, CRDT bindings, awareness, room lifecycle |
| `@devsync/database`      | Schema, migrations, generated client, repository helpers            |
| `@devsync/ui`            | Presentational primitives shared by more than one front-end         |
| `@devsync/test-utils`    | Fixtures, harnesses, and assertions used by more than one workspace |

Reserving a boundary is not the same as designing what fills it. These workspaces exist so that
the first piece of genuinely shared code has an obvious home and does not get written into
`apps/web` and then copied into `apps/api`. They stay empty until something real needs them: a
placeholder class or a speculative type would be worse than an honest empty module, because it
would have to be unlearned before it could be used.

Phase C is the milestone that fills the first two. What `@devsync/database` and `@devsync/shared`
will own — and what they must not — is settled in
[Phase C — planned persistence architecture](#phase-c--planned-persistence-architecture). **Both
are still empty.**

## `tests/e2e` — implemented

The only workspace allowed to start real processes. Playwright, Chromium only, eight tests across
three specs. It builds both applications, starts them on ports 4310 and 4311, waits on HTTP
readiness checks — never a fixed sleep — and shuts them down afterwards. `specs/web/local-editor.spec.ts`
is the one place that drives the real Monaco editor rather than markup DevSync owns.

The three testing layers as a whole:

| Layer                  | Runner     | Location    | Runs against                         |
| ---------------------- | ---------- | ----------- | ------------------------------------ |
| Component              | Vitest     | `apps/web`  | React components in jsdom            |
| HTTP-level application | Jest       | `apps/api`  | A Nest app on an ephemeral socket    |
| Browser and full-stack | Playwright | `tests/e2e` | Both compiled applications, on ports |

Forty-five real tests in total. [`testing.md`](testing.md) covers what each layer proves, why the
API stays on Jest, and what is deliberately untested.

## Request and process boundaries

**Request boundaries.** Exactly two, both HTTP, both from a client outside the system:
`GET /` to `apps/web`, and `GET /health` to `apps/api`. No request crosses from one application
to the other. There is no WebSocket, no server-sent event stream, no long-poll, no GraphQL
endpoint, and no RPC layer.

**Process boundaries.** Each application is a separate operating-system process in every mode
DevSync runs in, and no mode runs them in the same process:

| Mode                | Processes                                   | Ports      |
| ------------------- | ------------------------------------------- | ---------- |
| `pnpm dev`          | `next dev`, `nest start --watch`            | 3000, 3001 |
| `pnpm test`         | Vitest and Jest workers; no servers         | none       |
| `pnpm test:e2e`     | `next start`, `node dist/main.js`, Chromium | 4310, 4311 |
| `docker compose up` | One container per application               | 3000, 3001 |

The end-to-end ports are far from the development pair on purpose, so a suite run cannot silently
test a server a developer started by hand. `reuseExistingServer` is off for the same reason.

## Environment and configuration

**DevSync loads no `.env` file.** There is no configuration module, no `@nestjs/config`, and no
`dotenv` anywhere in the repository. A variable that is not set in the shell, in `compose.yaml`,
or in the Playwright `webServer` block is not configured at all.

| Variable   | Read by                         | Default | Set where                  |
| ---------- | ------------------------------- | ------- | -------------------------- |
| `API_PORT` | `apps/api/src/main.ts`          | `3001`  | Shell, Compose, Playwright |
| `PORT`     | The Next.js standalone server   | `3000`  | Compose and the web image  |
| `HOSTNAME` | The Next.js standalone server   | —       | Compose and the web image  |
| `NODE_ENV` | Both frameworks, conventionally | —       | Compose and both images    |

`API_PORT` is the only variable the repository's own code reads; the other three are read by
frameworks. `.env.example` is the documented inventory, `.env` is git-ignored and reserved, and
`.dockerignore` keeps every `.env*` file out of both build contexts.

**This repository contains no secrets**, no credentials, and no external service configuration,
because there is no external service to authenticate against.

## Build and runtime outputs

| Workspace  | Command      | Output                       | Runtime entry point          |
| ---------- | ------------ | ---------------------------- | ---------------------------- |
| `apps/web` | `next build` | `.next/`, `.next/standalone` | `apps/web/server.js` (image) |
| `apps/api` | `nest build` | `dist/`                      | `dist/main.js`               |

`pnpm build` runs exactly these two. Every other workspace has no build step, so the task graph
resolves to two units of work. All build output, coverage, and test reports are git-ignored;
nothing generated by a build or a test run is tracked, and no test run modifies a tracked file.

## Containers — implemented

Two production images and one Compose file. [`docker.md`](docker.md) is the full account; the
architectural points are:

- **Both images build from the repository root.** A pnpm workspace cannot do a frozen install
  without the root lockfile, `pnpm-workspace.yaml`, and every workspace manifest, so a
  per-application build context cannot work.
- **Multi-stage, always.** Build tooling never reaches a runtime image. `apps/web` ships the
  Next.js standalone output with no package manager at all; `apps/api` ships `dist` plus a
  production-only install.
- **Both run compiled output as the image's non-root `node` user**, never a dev server, never
  root.
- **Each service declares an HTTP health check** that proves the application answers, not merely
  that a process is alive.
- **Compose contains the two applications and nothing else** — no database, cache, queue, volume,
  named network, or `depends_on` edge, because nothing uses one.

## Continuous integration — implemented

One workflow, [`.github/workflows/ci.yml`](../.github/workflows/ci.yml), with three independent
jobs. [`ci.md`](ci.md) is the full account.

| Job       | Validates                                                                  |
| --------- | -------------------------------------------------------------------------- |
| `quality` | Formatting, lint, types, in-process tests, and both builds                 |
| `e2e`     | Both applications start from a real build and answer in Chromium           |
| `docker`  | Both images build, start, become healthy, and serve the expected responses |

The jobs are deliberately independent, and CI runs the same commands a developer runs — there is
no CI-only script. The workflow holds `contents: read`, uses no secrets, and publishes nothing.

## Architectural principles

These are the durable rules later milestones are expected to follow. They are commitments about
_where things go_, not a description of code that exists — nothing in this section is
implemented, and several of the technologies named here are not installed.

### Boundaries stay separated

Web, API, collaboration, database, shared contracts, and UI concerns each keep their own
boundary. A concern that grows a second consumer moves into `packages/`; it is not duplicated
across applications, and it is not absorbed into whichever application happened to need it first.
The reserved workspaces are how that separation is kept cheap: the destination already exists, so
moving shared code there is a refactor rather than an argument.

Concretely: collaboration logic does not live in `apps/web`, data access does not live in
`apps/api`, and a type shared by client and server lives in `@devsync/shared` so the two cannot
drift apart.

### The server enforces authorization; the client is never trusted

When access control arrives, it is enforced on the server. A client may hide a control it
believes the user cannot use, but every decision that matters is made where the request is
handled — including collaboration messages, which are requests like any other. No client-supplied
claim about identity, membership, or role is taken at face value.

### Collaboration is CRDT-based, not broadcast

Real-time editing will synchronise through CRDT document updates, not by broadcasting whole file
contents. Sending a full document on every keystroke does not converge under concurrent edits, it
scales with file size rather than edit size, and it makes offline reconnection unresolvable. A
CRDT gives convergence as a property of the data structure instead of as a property of message
ordering.

The intended library is Yjs. **It is not installed, and no synchronisation code exists.**

### One Yjs document per project, initially

The expected starting model is a single Yjs document per project, with each file a sub-document
or a named shared type within it. One document per project keeps cross-file operations — renames,
moves, a multi-file undo — inside a single consistency domain, and it means one awareness channel
per room rather than one per open file.

This is a starting point recorded so the first implementation is a deliberate choice rather than
an accident. Per-file documents scale better for very large projects, and the trade-off is
expected to be revisited when a real project size makes it concrete.

### Presence is ephemeral and separate from persisted data

Cursors, selections, and who-is-here are awareness state: they live for the duration of a
connection and are never written to the durable store. Persisting presence would put the
highest-frequency, lowest-value data in the most expensive place, and every row would be garbage
the moment its connection dropped. Project content persists; presence does not.

### PostgreSQL owns durable records; Redis waits for a reason

When persistence arrives, PostgreSQL is the system of record for projects, files, memberships,
and history. One durable store, one place to look, one backup story.

**Redis is not introduced until scaling requires it** — specifically, until more than one API
instance has to share collaboration state or presence across processes. A single instance needs
no shared cache, and adding one before that point buys an extra deployment dependency, an extra
failure mode, and a cache-invalidation problem in exchange for nothing.

### Code execution runs outside the web and API processes

User-submitted code is never executed inside `apps/web` or `apps/api`. Execution gets its own
isolated runner with its own resource, filesystem, and network limits, and the API talks to it
across a boundary it does not trust. An API process that also runs user code has no meaningful
security boundary left: a sandbox escape becomes database access.

### Documentation separates what is from what is planned

Every document in `docs/` states which of its contents are implemented and which are direction.
A document that describes a planned system in the present tense is worse than no document,
because it cannot be distinguished from a description of reality. Documentation is updated in the
same change that makes it inaccurate.

## Planned architecture — none of this exists

The shape the system is being built towards. Each piece arrives in the milestone that needs it;
see [`roadmap.md`](roadmap.md) for the sequence.

```mermaid
flowchart TB
    browser["Browser<br/>editor + presence UI"]

    subgraph planned["Planned services"]
        web2["apps/web<br/>Next.js client"]
        api2["apps/api<br/>NestJS: projects, auth,<br/>collaboration transport"]
        runner["Execution runner<br/>isolated, resource-limited"]
        pg[("PostgreSQL<br/>projects, files, members, history")]
    end

    browser -->|"HTTP"| web2
    browser -->|"CRDT updates + awareness"| api2
    api2 -->|"via @devsync/database"| pg
    api2 -->|"submit job, read result"| runner
```

- **The code editor driven by a CRDT-backed shared document.** Monaco is in the client already;
  Yjs is the intended CRDT and is not installed, so the editor is bound to nothing.
- **The API as the authority** over project data, membership, access control, and the
  collaboration transport. The transport is expected to be WebSocket-based; no WebSocket
  dependency exists.
- **PostgreSQL behind `@devsync/database`**, reached through one package rather than from
  controllers scattered across the API.
- **A separate execution runner**, isolated from both applications, for running user code.
- **Shared contracts published from `@devsync/shared`** — types, schemas, and the collaboration
  protocol — so client and server cannot disagree about the wire format.
- **Redis, only if and when horizontal scaling requires it.**

## Phase C — planned persistence architecture

**Everything in this section is planned.** Nothing in it is installed or written: there is no
PostgreSQL, no Prisma, no Zod, no schema, no migration, no route beyond `GET /health`, and no call
from `apps/web` to `apps/api`. It is recorded here because C0 is the milestone that decided it, and
because a data model is far cheaper to argue about before a migration has run than after.
[`roadmap.md`](roadmap.md) has the C0–C5 sequence and what each milestone must meet;
[`decisions.md`](decisions.md) has the reasoning behind each choice and what would justify
revisiting it.

### What Phase C is, and what it refuses to prepare for

Phase C is **single-user**. It gives DevSync projects and files that survive a restart, so that
later phases have something worth sharing, and it stops there.

There are no users, owners, memberships, roles, invitations, or authorization checks; no slug,
visibility, archival, or soft deletion; no folders, paths, or file trees; and no collaboration,
presence, version history, chat, or execution. Those absences are the design, not a gap in it: a
nullable `ownerId` or a `deletedAt` added now would be a column nobody writes, a constraint nobody
enforces, and a shape Phase H would have to unpick before it could use it. **Phase C adds no
placeholder column and no placeholder contract for anything on that list.**

### The data model

Two records, one relationship. `ProjectFile` is the implementation-level name for the second
one — `File` is a browser global, and a model that shadows it would read ambiguously in exactly the
package where both meanings are plausible.

#### Project

```text
id         opaque UUID, generated by the persistence layer
name       required, trimmed, 1–100 characters
createdAt  server-generated
updatedAt  server-generated; moves on file changes too, see below
```

The name is trimmed before it is persisted, and a name that is empty or entirely whitespace is
invalid rather than stored. **Project names are not unique** — two projects may share one, because
a person naming two things the same has not made an error worth rejecting, and uniqueness would
need a scope that does not exist until there are owners. 100 characters is a practical ceiling for
a label that appears in a list, chosen so the column is bounded rather than because anything
measured it; the number is C0's to set and C5's to correct if the interface disagrees with it.

Deletion is permanent. There is no archive state, no `deletedAt`, and no restore route.

#### ProjectFile

```text
id         opaque UUID, generated by the persistence layer
projectId  references exactly one project
name       required, trimmed, 1–255 characters, unique within its project
language   one of the supported identifiers, stored as an ordinary string
content    text; empty is valid
createdAt  server-generated
updatedAt  server-generated
```

- **A file belongs to exactly one project, and deleting the project deletes its files** —
  permanently, by a cascade in the schema rather than by a loop in application code.
- **Names are flat.** No folder, no path, no parent, and no ordering column. `README.md` is a name,
  not a location, and nothing in Phase C parses it.
- **A name is unique within one project and free in every other.** Two projects may each hold a
  `main.ts`; one project may not hold two.
- **That uniqueness is deliberately case-sensitive** — a product decision, not something inherited
  from whatever the database happens to do. `README.md` alongside `readme.md` is a strange project
  rather than a broken one, and case-insensitive uniqueness would need a rule about which spelling
  survives that nothing has asked for. **C1 must make the schema and its collation configuration
  actually enforce the composite `(projectId, name)` rule as written**, and real PostgreSQL
  integration tests have to cover it: a uniqueness rule assumed from a default is a rule nobody has
  checked. `citext`, lowercased storage, and case-insensitive uniqueness are all out of scope.
- **`language` is a string, validated at the API boundary, not a database enum.** The supported
  values are the five `apps/web` already offers — `typescript`, `javascript`, `python`, `json`, and
  `markdown` — and they move to `@devsync/shared` in C2, together with the validator that checks
  them. Adding a sixth must be a change to that list and its validator, not a migration: an enum
  type would make the database the authority on a set that is really Monaco's, and would tie every
  new language to a schema change and a deployment ordering problem.
- **`content` is text, and empty is valid content.** That is already the rule the editor follows —
  `code-editor.tsx` forwards an emptied file as a real edit and drops only Monaco's `undefined` —
  and persistence must not quietly reintroduce a distinction the editor deliberately does not make.
- **The name and the language are independent stored properties.** Renaming a file must not change
  its language, and changing its language must not rename it. This is the one place where Phase C
  deliberately breaks with Phase B, where the file name is derived from the language and there is
  only ever one buffer.

#### Identifiers and timestamps

Identifiers are opaque UUIDs generated by the persistence layer. A client does not choose one, and
a malformed one is a `400` rather than a lookup that happens to miss.

`createdAt` and `updatedAt` are generated by the server and the database, never accepted from a
request. They are stored in time-zone-aware columns and returned over HTTP as UTC ISO-8601 strings,
so the wire format carries no local time and no ambiguity for the browser to guess at.

**`Project.updatedAt` means "when this project last changed", not "when this row was last
written".** It is set at creation and moves when the project is renamed, when a file is created,
renamed, retyped, edited, or deleted. A file mutation updates its parent project's timestamp **in
the same transaction** that changes the file, so the two can never disagree about whether the change
happened.

That definition is what makes the project list orderable by recent work without a speculative
`lastActivityAt` column: the column already exists, and Phase C simply says what it counts.
`ProjectFile.updatedAt` is the ordinary meaning — when that file last changed.

#### Creating a project creates its first file

A new project is created together with one file, **in a single transaction**: `main.ts`, in
TypeScript, holding the starter content `LocalEditorWorkspace` opens with today. An empty project
would greet its creator with nothing to click, and a client that had to follow every create with a
second request would leave a project with no files behind whenever the second one failed.

The ownership split matters more than the behaviour:

- **`apps/api` owns the policy** — that a new project gets a starter file, what it is called, what
  language it is, and what it contains.
- **`@devsync/database` owns the atomicity** — one transaction, both rows, and if either insert
  fails, neither record remains.

The database package must not invent starter content of its own. A persistence layer with an
opinion about what a new project should say is a persistence layer that has to be edited for a
product decision.

A project may later hold zero files, because deleting the last one is allowed. Nothing in the
product requires an undeletable file, and a rule that a project must always have one would be a
constraint invented for tidiness.

### The HTTP surface

Files are addressed under their project, because a file has no meaning outside one and a flat
`/files/:id` would make the project a query parameter on every request.

```http
POST   /projects
GET    /projects
GET    /projects/:projectId
PATCH  /projects/:projectId
DELETE /projects/:projectId

POST   /projects/:projectId/files
GET    /projects/:projectId/files
GET    /projects/:projectId/files/:fileId
PATCH  /projects/:projectId/files/:fileId
DELETE /projects/:projectId/files/:fileId
```

**`POST /projects`** takes `{ "name": "My project" }`, creates the project and its initial `main.ts`
atomically, and answers `201` with the project and its files — for a new project, the one file's
identifier, name, language, and timestamps. The caller can therefore open what it just created
without guessing an identifier or listing the project to find one.

**`GET /projects`** returns project summaries — the project's own fields, without files. They are
ordered **most recently updated first, with the identifier as the final tie-breaker**, so a listing
is stable when two projects share a timestamp. That ordering is only meaningful because
`Project.updatedAt` moves on file changes as well as renames, which is
[defined above](#identifiers-and-timestamps). **There is no pagination**, deliberately: one person
with a list of their own projects does not need it, and the route that would have to grow it is the
one Phase H rewrites anyway when projects acquire owners.

**`GET /projects/:projectId`** returns one project with a summary of each of its files — identifier,
name, language, timestamps — and **not** their contents. Files have their own resource; sending
every byte of a project on every open would make the cost of listing a project scale with the size
of the code in it.

**`PATCH /projects/:projectId`** renames the project. `name` is the only mutable project property in
Phase C, and a body containing no supported property is a `400` rather than a successful request
that changes nothing.

**`DELETE /projects/:projectId`** permanently deletes the project and, by cascade, every file in it.
`204`, with no body.

**`POST /projects/:projectId/files`** takes `{ "name": "utils.ts", "language": "typescript", "content": "" }`
and answers `201` with the created file. **`content` is optional and defaults to an empty string**;
a file created without content is empty, not absent, which is the same rule the model states and
the editor already follows.

**`GET /projects/:projectId/files`** returns the project's files, without their contents, **oldest
first by creation time with the identifier as the tie-breaker** — a stable order that does not
reshuffle the list every time someone types.

**`GET /projects/:projectId/files/:fileId`** returns one complete file, contents included. A file
that exists under a different project is a `404` here: the project in the path is part of the
lookup, not decoration, so an identifier cannot be read through the wrong project's URL.

**`PATCH /projects/:projectId/files/:fileId`** may change `name`, `language`, or `content`, in any
combination. **Sending all three is never required**, because saving a keystroke should not have to
restate the file's identity; a body with none of them is a `400`.

**`DELETE /projects/:projectId/files/:fileId`** permanently deletes the file. `204`, no body.

**Every route that creates, changes, or deletes a file also moves its project's `updatedAt`**, in
the transaction that made the change. There are no bulk, search, archive, restore, copy, move,
folder, or upload routes in Phase C.

#### Request size

The API needs a **maximum request body size**, enforced at its boundary, so that a large paste or a
malformed upload is rejected as a `400` before it becomes a row. The practical value is chosen and
tested when the API is written, against what a plausible source file actually weighs — putting a
number here now would be a guess presented as a contract.

That is the whole of Phase C's resource story. **It is not a quota system**: there is no per-project
size limit, no file-count limit, no rate limiting, and no accounting. Broad quotas and distributed
resource hardening belong to the later phases that own reliability and production concerns, and
moving them forward into Phase C would be building for a scale that does not exist.

### Errors

One shape, from every route, so the web application can read a failure without knowing which layer
produced it.

| Status | Means                                                                           |
| ------ | ------------------------------------------------------------------------------- |
| `400`  | Malformed body, invalid UUID, unsupported language, or a patch with no property |
| `404`  | No such project, or no such file under the project in the path                  |
| `409`  | A file with that name already exists in that project                            |
| `503`  | The configured database is unreachable                                          |
| `500`  | Anything unexpected                                                             |

```json
{
  "statusCode": 409,
  "code": "FILE_NAME_TAKEN",
  "message": "A file named \"utils.ts\" already exists in this project.",
  "issues": [{ "path": ["name"], "message": "Already used in this project." }]
}
```

- **`statusCode`** is the HTTP status, repeated in the body so a logged response is self-contained.
- **`code`** is stable and machine-readable. It is what a client branches on.
- **`message`** is human-readable, for a log line or a toast. **Clients and tests must not parse
  it**, and it may be reworded without that being a contract change.
- **`issues`** is optional and carries field-level detail **whenever field-level detail is useful** —
  request validation, and field-specific conflicts such as a duplicate file name. Its shape is one
  documented thing: a list of `{ path, message }`, where `path` is the field's location in the
  request body. An error with nothing field-specific to say omits it entirely rather than sending an
  empty list.

The stable codes C2 has to implement:

| Code                   | Status | Raised when                                                                      |
| ---------------------- | ------ | -------------------------------------------------------------------------------- |
| `VALIDATION_FAILED`    | `400`  | A malformed body, an unsupported language, or a patch with no supported property |
| `INVALID_IDENTIFIER`   | `400`  | A path parameter that is not a well-formed UUID                                  |
| `PROJECT_NOT_FOUND`    | `404`  | No project with that identifier                                                  |
| `FILE_NOT_FOUND`       | `404`  | No file with that identifier under the project in the path                       |
| `FILE_NAME_TAKEN`      | `409`  | A file with that name already exists in that project                             |
| `DATABASE_UNAVAILABLE` | `503`  | The configured database cannot be reached                                        |
| `INTERNAL_ERROR`       | `500`  | Anything unexpected                                                              |

`INVALID_IDENTIFIER` is separate from `VALIDATION_FAILED` because it is worth telling a client that
the URL it built is wrong rather than the body it sent — a distinction the client can act on, which
is the only reason to add a code.

Nest's default error body is `{ statusCode, message, error }`, so producing this shape uniformly is
an exception filter C2 has to write rather than something the framework provides.

**No error response may contain a Prisma error, a SQL fragment, a connection string, a stack trace,
or an internal table name.** The boundary is enforced in two places: `@devsync/database`
classifies persistence failures into meanings — not found, unique violation, unavailable, unknown —
and `apps/api` maps those meanings to the table above. The web application therefore consumes
stable HTTP errors and never inspects an ORM exception, which is what allows the ORM to be replaced
without touching the client.

Two failures are configuration rather than requests. **A missing or malformed `DATABASE_URL` fails
startup**, loudly, rather than defaulting to some other database. **A database that goes away after
startup** produces `503` and `DATABASE_UNAVAILABLE` from the persistence routes for as long as it is
gone; `GET /health` is a separate question, and whether it should start reporting readiness is C1's
to decide when there is something to be unready for.

### Where the code goes

```text
apps/web
  └── @devsync/shared

apps/api
  ├── @devsync/shared
  └── @devsync/database

@devsync/database
  └── Prisma and the PostgreSQL driver

@devsync/shared
  └── nothing — not apps/api, not apps/web, not @devsync/database
```

**`@devsync/database`** will own the Prisma schema, the migrations, client construction, the
connection lifecycle, the project and file data-access functions, the atomic project-plus-first-file
creation, transaction helpers, and the classification of persistence errors.

It will not own HTTP controllers, status codes, React, UI state, browser APIs, the runtime schemas
shared with the browser, the starter-project policy, authentication, or anything to do with
collaboration.

**`@devsync/shared`** will own the runtime request schemas, the response contracts where they
genuinely stop client and server drifting apart, the TypeScript types inferred from them, the
supported language identifiers and their validator, and the error contract above. Zod is the
intended validation library.

**It starts exporting in C2**, when `apps/api` becomes its first consumer, and `apps/web` becomes
the second in C3. The rule that has kept it empty so far is about speculation, not about consumer
arithmetic: a contract the API is validating every request against is real, and waiting until C3 to
publish it would mean writing the same schema twice and hoping the copies agree — the exact drift
this package exists to prevent. It gains no collaboration, authentication, membership, or
version-history types on the way past, and **nothing is added to it during C0.**

**`apps/api`** will own HTTP routing, validation wiring, application orchestration, the
project-creation starter values, and the mapping from persistence results and errors to responses.
It also owns configuration: it loads and validates `DATABASE_URL`, and it drives the database
package's connect and disconnect through Nest's lifecycle. **That dependency edge is C1's**, before
any route exists — a data layer the real API process never opens is a data layer nobody has proved.

**`apps/web`** will reach the API over HTTP and nothing else. It must never import
`@devsync/database`, Prisma, a PostgreSQL client, or database configuration, and **the browser must
never connect to PostgreSQL**. A database credential that reaches a bundle is a published
credential.

### Prisma and migrations

Prisma is the intended ORM, and it lives in `@devsync/database` — schema, migrations, and client
construction all inside that package.

- **One process, one client.** Construction and shutdown belong to the package; `apps/api` asks it
  to connect and disconnect through its lifecycle hooks. Controllers and React code construct
  nothing.
- **The package exposes operations, not an ORM.** Callers get functions named for projects and
  files, not an open connection they can run arbitrary queries through — otherwise the boundary is
  a directory rather than an abstraction, and replacing Prisma later becomes a repository-wide
  edit.
- **A Prisma model type is not an HTTP contract.** Responses are mapped to the shared resource
  shapes, so a column added for storage reasons does not silently appear on the wire.
- **Migrations are committed, and generated artifacts are reproducible and never hand-edited.**
  Generated client output stays out of the repository unless the Prisma version and generator in
  use require a repository-owned generated directory, in which case that requirement is documented
  where the decision is, not left to be inferred from a diff.
- **`prisma migrate dev` creates migrations in local development only. `prisma migrate deploy`
  applies committed ones** in CI, in Compose, and anywhere production-shaped. `prisma db push` is
  not the workflow for the tracked schema.
- **An applied migration is immutable.** A mistake is corrected by a new migration, because
  rewriting one that has already run somewhere leaves two databases that disagree about their own
  history. Names describe what the migration does.
- **Migrations run before the API serves persistence requests**, and production startup never
  creates a development migration. Ordering that race-free in Compose — most likely an explicit
  one-shot migration step the API waits on — is C1's to choose and document.
- **A destructive reset is only ever pointed at a database that has been explicitly declared
  disposable.** Verifying that a migration preserves data belongs to C4.

The initial migration arrives in C1. There is none now, and no Prisma version has been selected.

### Configuration

Three variables, once C1 implements them:

| Variable            | Read by                            | Required                                  |
| ------------------- | ---------------------------------- | ----------------------------------------- |
| `API_PORT`          | `apps/api/src/main.ts`             | No — defaults to 3001. **Already exists** |
| `DATABASE_URL`      | `apps/api` and `@devsync/database` | Yes, from C1 onward                       |
| `TEST_DATABASE_URL` | The database-backed test tooling   | Only while those tests run                |

**`DATABASE_URL` is required from C1 and validated when the API and database runtime starts.** A
missing or malformed value fails startup with a message naming the variable and what was wrong —
never a silent fallback to a default database, which is how a test suite ends up truncating
someone's development data.

**`TEST_DATABASE_URL` is read only by the database-backed integration-test tooling, and validated
only when those tests run.** Its absence is not a startup failure and must never stop the ordinary
API from starting — an unset test variable means "these tests were not asked for", not "this service
is misconfigured". The tests themselves refuse to run if it is missing, if it is obviously unsafe,
or if it is equal to `DATABASE_URL`.

**Neither database URL ever reaches the browser.** `apps/web` gets no database configuration of any
kind, and no such value may be exposed through a `NEXT_PUBLIC_` variable.

Loading and validation arrive together in C1 — that is the milestone [D11](decisions.md#d11--no-env-loading-yet)
named as its trigger. `@devsync/shared` does not read environment files; it is imported by the
browser bundle, and a package that reads configuration cannot safely be. `.env.example` gains the
new variables in the same change that makes the applications understand them, with non-secret
example values only.

### Compose, and testing

[`docker.md`](docker.md) owns the planned Compose topology — the PostgreSQL service, the named
volume, the health check, the migration step, and what `docker compose down` does and does not
destroy. [`testing.md`](testing.md) owns the planned testing ladder — what C1, C2, C3, and C4 each
have to prove, and why database tests stay outside `pnpm test`.

### What Phase C changes about the editor

Phase B's editor holds one buffer and derives its file name from the selected language. Phase C
inverts that: a file has a stored name and a stored language, changed independently, and the
derived name in `apps/web/src/editor/languages.ts` stops being meaningful. C3 is where the client
changes. **The five language identifiers and their validator move to `@devsync/shared` in C2**,
with everything else the API has to validate; the labels a user reads may stay in the client,
because they are presentation, and C3 is when the client starts reading the identifiers from the
shared package rather than from its own list.

The model-ownership problem recorded in [`testing.md`](testing.md) is **not** solved by Phase C.
Loading a file's contents into the editor is a controlled-value change like any other, and
user-paced typing is unaffected; it is Phase E's programmatic remote edits that force the question.

## What this architecture deliberately does not contain

Recorded so that their absence reads as a decision rather than an oversight. None of the
following exists anywhere in this repository:

- A database, ORM, migration tool, or any persistence — including browser storage: the workspace
  uses neither `localStorage`, `sessionStorage`, nor IndexedDB, and has no save action or
  saved/unsaved state, because there is nowhere to save to
- Authentication, sessions, accounts, or authorization
- WebSockets, Socket.IO, or any real-time transport
- A CRDT library or any collaboration code — the editor exists, but it is bound to nothing
- Code execution, sandboxing, or a runner service
- Redis, a cache, a queue, or a message broker
- A shared type, schema, or protocol definition — `@devsync/shared` exports nothing
- Deployment configuration, Kubernetes manifests, cloud infrastructure, or release automation
- A dependency bot, a changelog, or a versioning scheme

## Related documents

| Document                           | Covers                                                  |
| ---------------------------------- | ------------------------------------------------------- |
| [`development.md`](development.md) | Prerequisites, commands, ports, and daily workflow      |
| [`testing.md`](testing.md)         | The three testing layers and what each proves           |
| [`docker.md`](docker.md)           | Image structure, Compose, and container limitations     |
| [`ci.md`](ci.md)                   | The GitHub Actions workflow and its jobs                |
| [`decisions.md`](decisions.md)     | Why each of these choices was made, and when to revisit |
| [`roadmap.md`](roadmap.md)         | The milestone sequence and current position             |
