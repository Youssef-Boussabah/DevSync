# Testing

How DevSync is tested, what each layer is responsible for proving, and — just as
importantly — what is not tested yet.

The testing architecture was introduced in **Phase A2 — testing foundation** and its shape is
unchanged at **Phase B complete**: the phase added tests to it rather than layers. Phase C0 added
neither — it planned the database-testing ladder below without writing a line of it. The product
has no collaboration,
no persistence, no accounts, and no code execution, so none of those things are tested. What
exists is the architecture that will hold those tests when they are written, plus real coverage of
everything the two applications currently do.

## Layers

| Layer                  | Runner         | Lives in                     | Runs against                              |
| ---------------------- | -------------- | ---------------------------- | ----------------------------------------- |
| Unit / component       | **Vitest**     | `apps/web`                   | React components, in jsdom, in-process    |
| HTTP-level application | **Jest**       | `apps/api`                   | A Nest application on an ephemeral socket |
| Browser / full-stack   | **Playwright** | `tests/e2e` (`@devsync/e2e`) | The built applications, on real ports     |

Three runners is a deliberate choice rather than an accident of history.

**Vitest owns the frontend and, in future, the pure TypeScript packages.** It shares Vite's
transform pipeline with the tooling `apps/web` already uses, starts fast enough to run on every
save, and handles TSX without extra configuration.

**Jest stays in `apps/api`.** `@nestjs/testing` is written against Jest's API, and `ts-jest`
reads `apps/api/tsconfig.json` directly — including `emitDecoratorMetadata`, which NestJS's
dependency injection depends on. Moving the API to Vitest would mean reintroducing that
decorator metadata through SWC or Babel to buy uniformity and nothing else. The migration is
not blocked; it is simply not paid for. If a concrete reason appears — a shared helper the two
runners cannot both consume, say — that is the point to revisit it.

**Playwright owns everything that needs a real process.** It is the only layer that runs
compiled output, binds ports, and drives a browser.

## What the current tests actually prove

### `apps/web` — `tests/home-page.test.tsx` (Vitest, jsdom, 8 tests)

Renders the real `src/app/page.tsx` with React Testing Library and asserts that the page
identifies the product as DevSync, describes what DevSync is, states which phase the repository
is at, gives the workspace a place on the page, says that the file is temporary and that a refresh
discards the changes and returns the file to TypeScript, says that choosing a language re-reads the
one file rather than opening another, and does not claim that collaboration, persistence, or
execution work yet.

The workspace is stubbed to a bare element here. This file is about what the page says and what it
places on the page; the workspace and the editor each have their own file below, and a page test
that also drove Monaco's loading behaviour would fail for two unrelated reasons at once.

The home page is a Server Component, but a synchronous one that touches no server-only API — it
is an ordinary function returning JSX, so it mounts directly and no test-only wrapper had to be
invented for it. `layout.tsx` is different: it imports `next/font/google`, which only the
Next.js compiler resolves, so Vitest cannot load it. The metadata it declares is therefore
asserted by Playwright against the real document instead of being re-implemented in a mock.

### `apps/web` — `tests/local-editor-workspace.test.tsx` (Vitest, jsdom, 17 tests)

The state-ownership layer, and the reason B1 and B2 are testable at all. `CodeEditor` is replaced by
a plain textarea honouring the same controlled contract, typed as the real `CodeEditorProps` so the
stand-in cannot drift from the boundary without the type-check noticing. That is enough to act as a
user typing and a user choosing, without pretending jsdom can run Monaco. What it proves about the
content:

- the workspace opens the sample file, names it `main.ts`, and opens it as TypeScript;
- what the user types is kept — the value is the workspace's, not the editor's;
- a re-render does not reset it, which is what distinguishes owned state from a prop passed down
  every render;
- a file emptied to `''` stays empty, because empty is valid content;
- **remounting starts again from the sample**, which is the positive proof that nothing is stored
  anywhere.

And about the language:

- TypeScript is the selected language on first render, and the selector says so;
- exactly five options are offered, with the labels a user reads — asserted against a list restated
  in the test rather than imported from the component, which would only prove it agrees with
  itself;
- selecting each of the other four hands that Monaco language to the editor and shows the file
  under the matching name — `main.js`, `main.py`, `data.json`, `README.md`;
- **content typed before a language change is still there afterwards**, which is the whole claim of
  the milestone: one buffer, read differently;
- a re-render does not reset the language, for the same reason it does not reset the content;
- **remounting opens as TypeScript again**, so the language is stored exactly as little as the
  content is;
- a value the markup never offered — which a `<select>` reports as an empty string — is ignored
  rather than stored, which is the guard that keeps an arbitrary DOM string out of the state
  without a cast.

The selector is queried by its accessible name rather than by a test id, so the test fails if the
label stops being associated with the control.

The workspace can never be handed an `undefined` value: `CodeEditorProps` promises a string, and
the file below covers Monaco's `undefined` being dropped before it could reach here. That is a
boundary the type system enforces, so it is tested where it is actually decided rather than
re-asserted through a cast.

### `apps/web` — `tests/code-editor.test.tsx` (Vitest, jsdom, 11 tests)

**jsdom is not a browser Monaco can run in.** It has no canvas text metrics, no layout, and no
web workers, so a test that tried to start the real editor would be testing jsdom's limits rather
than DevSync's code. `@monaco-editor/react` and `monaco-editor` are therefore mocked at their
narrowest point — a component that records the props it was handed — and the assertions stay on
the side of the boundary DevSync owns:

- a loading message is shown before Monaco is available, and the editor is not mounted yet;
- the editor mounts once Monaco has loaded, inside a region a user can identify by name;
- Monaco comes from the bundled package rather than a CDN, which is what `loader.config` is
  called to arrange;
- the content and language it was given are the ones handed to Monaco, through the controlled
  `value` rather than a default — an uncontrolled editor would leave `value` unset and fail here;
- an edit is reported back to the caller, and an emptied file is reported as the real edit it is;
- **a change Monaco reports without a value is ignored**, so a transient `undefined` can never
  blank the file the caller is holding;
- `automaticLayout` is on and the editor carries an accessible name — both DevSync's options, not
  the library's defaults;
- a loading surface is handed to the integration for its own start-up;
- a Monaco that cannot be loaded at all produces an honest message rather than a permanent
  spinner. `@monaco-editor/react` only logs a failed initialisation, so this branch is the
  application's own.

**Nothing here proves Monaco works.** That is not what this layer is for; the Playwright suite
covers the real editor in a real browser.

### `apps/api` — `src/health/health.http.spec.ts` (Jest, 1 test)

An **HTTP-level application test**, not a unit test. It compiles the real `HealthModule`, boots
a Nest application from it, and drives `GET /health` through the framework's routing and
serialisation, asserting status `200` and the exact body `{"status":"ok","service":"devsync-api"}`.
Supertest binds an ephemeral socket, so it depends on no fixed port and no running server.

It deliberately does not prove that `main.ts` bootstraps, that `AppModule` imports
`HealthModule`, or that the compiled output in `dist` serves anything. Those are failure modes
of the built process rather than of the health feature, and they belong to the layer below.

### `tests/e2e` — Playwright, 8 tests

`specs/web/home.spec.ts` (6 tests) loads `/` from the production build served by `next start`
and asserts the response status is `200`, that the document title is `DevSync`, that the
level-1 heading names the product, and that the editor region is visible. The title assertion is
what covers `layout.tsx`.

The editor assertion is deliberately shallow. It proves the thing jsdom cannot: that a client
component carrying Monaco survives server rendering, reaches a real browser, and paints. It
matches the region DevSync labels rather than anything inside Monaco's own DOM, so a Monaco
upgrade cannot break it for a reason that has nothing to do with DevSync.

The remaining three drive the language selector in the real browser, which they can do in full
because it is ordinary application markup rather than part of Monaco: the file opens as TypeScript
under `main.ts`; selecting Python leaves the selector on `python`, shows the file as `main.py`, and
leaves the editor region mounted; and switching away and reloading returns both the selector and
the name to TypeScript and `main.ts`, because nothing is stored. The selector is found by its
label, and the assertions stay on DevSync's own values — how Monaco then highlights the text is
Monaco's business.

### `tests/e2e` — `specs/web/local-editor.spec.ts` (Playwright, 1 test)

The only place in the repository that drives the real Monaco editor. One test, because the guarantee
is one sequence: a browser user types, changes the language, and reloads. It clicks the rendered
code surface, selects the buffer with `ControlOrMeta+A`, types `const browserEdit = 42;`, and
asserts the line appears in the editor. It then selects Python and asserts the selector, the file
name, **and that the typed line is still there and the sample is not**. Finally it reloads and
asserts the sample is back, the typed line is gone, and the selector and name have returned to
TypeScript and `main.ts`.

Three properties of it are deliberate:

- **One Monaco-owned selector, scoped beneath the region DevSync labels.** Monaco's accessible
  textbox is real but drawn off-view at effectively zero size, so it can be found by role and never
  clicked; the click has to land on the rendered code surface. `.view-lines` under
  `role="region"[name="Code editor"]` is the least Monaco-specific knowledge that allows a click and
  a read, and the application-owned region stays the stable outer boundary.
- **One line, and no `Enter`.** Monaco's suggestion widget captures `Enter`, so a test that typed a
  newline mid-identifier could silently accept a completion and assert against text nobody typed. A
  single-line edit proves the same thing with none of that exposure.
- **Typed at a person's pace, not a machine's.** `@monaco-editor/react` rewrites the whole model
  whenever the controlled `value` and the live model disagree, so characters delivered faster than
  React can commit a render are overwritten by a value that has already gone stale. Playwright types
  with no delay by default; the test uses 50 ms per character, which is a fast typist. **This is a
  real property of the integration, not a test artifact** — but it is not reachable by a user
  either. Typing at human speed is stable, and paste is unaffected because a paste arrives as a
  single change rather than one per character; both were verified against the production container
  at Phase B closure, including a multi-line paste that survived a language change. The exposure is
  to machine-speed _programmatic_ edits — a CRDT applying remote operations, in Phase E — and that
  is the milestone that has to answer it.

**What this test proves, and what it does not.** Both halves of this were established by mutation
rather than reasoned about, which is why they can be stated precisely.

It proves that a real keystroke in Chromium reaches Monaco's model and renders, that a legitimate
workspace rerender does not restore stale content over it, and that a reload discards it. Making the
workspace hand `CodeEditor` the initial sample instead of the current content on a language change
fails it, at the assertion that the typed line is still present.

It does **not** prove that Monaco's change callback reaches React state. Stopping `CodeEditor` from
forwarding a valid change leaves this test passing, because `@monaco-editor/react` re-drives the
controlled value into the editor only when that value actually changes: if the callback never fires
the prop never changes, nothing is ever pushed back, and Monaco simply behaves as an uncontrolled
editor. That direction is proved compositionally in jsdom instead — `code-editor.test.tsx` for
Monaco's change reaching `onChange`, and `local-editor-workspace.test.tsx` for `onChange` reaching
the content state. That is sound layering, but the browser test must not be described as observing
it. Closing the gap in a real browser would need application state visible somewhere other than the
editor, which nothing in the product requires; it is recorded here rather than manufactured with a
test-only hook.

`specs/api/health.spec.ts` (1 test) requests `/health` from the compiled `dist/main.js` running
on a real port and asserts status `200` and the exact expected payload.

The overlap with the Jest test is intentional and is not duplication: the Playwright test is the
only thing that proves the service bootstraps, that `AppModule` really imports `HealthModule`,
that the build produced working output, and that the process binds the port it was given. The
Jest test is the only thing that catches a regression in the health feature in under two
seconds, without a build or a browser. Each catches failures the other structurally cannot.

## Commands

### From the repository root

| Command                 | What it runs                                                         |
| ----------------------- | -------------------------------------------------------------------- |
| `pnpm test`             | Every in-process suite: Vitest and Jest. No browsers, no builds run. |
| `pnpm test:unit`        | The Vitest layer only — the fast inner loop.                         |
| `pnpm test:e2e`         | Playwright. Builds both applications first, then starts them.        |
| `pnpm test:all`         | `test` and `test:e2e` together.                                      |
| `pnpm test:coverage`    | Coverage for the two workspaces that have code to measure.           |
| `pnpm test:e2e:install` | Downloads the Chromium build Playwright needs. Run once per machine. |

`pnpm test` is the default because it stays fast: it neither builds anything nor launches a
browser. End-to-end runs are separate for the same reason.

`pnpm test:e2e:install` is separate on purpose. It writes roughly 300 MB to a machine-level
cache, and a command that mutates a developer's machine should be something they chose to run,
not a side effect of running tests.

The `test:unit` / `test` distinction is a real one rather than an alias: `apps/api`'s suite is
an HTTP-level application test, so it correctly has no `test:unit` script and does not appear in
that command.

### Within a workspace

```bash
pnpm --filter @devsync/web test           # vitest run
pnpm --filter @devsync/web test:watch     # vitest, watching
pnpm --filter @devsync/web test:coverage  # vitest run --coverage

pnpm --filter @devsync/api test           # jest
pnpm --filter @devsync/api test:watch     # jest --watch
pnpm --filter @devsync/api test:coverage  # jest --coverage

pnpm --filter @devsync/e2e test:e2e       # playwright test, assuming both apps are already built
```

The last one skips the Turborepo build step, so it fails with a missing `dist/main.js` or
`.next` if the applications have not been built. Use `pnpm test:e2e` from the root unless you
know they have.

### Turborepo tasks

`test`, `test:unit`, `test:coverage`, and `test:e2e` are all declared in `turbo.json`. A root
script that calls a task Turborepo does not know about silently does nothing, so a new test
script must be added in both places.

`test:coverage` declares `coverage/**` as its output and is cached like any other deterministic
task. `test:e2e` sets `cache: false`: its result depends on live processes binding real ports
and on a browser being installed, none of which is part of the input hash, so a cache hit would
report a pass without having proved anything.

Keep `pnpm test` free of build steps. A workspace that declares an application as a package
dependency inherits that application's `build` through `dependsOn: ["^build"]` on `test`, which
is how the fast command quietly stops being fast.

## How the end-to-end suite starts the services

`tests/e2e/playwright.config.ts` declares two `webServer` entries, and Playwright starts both
before the first test and shuts both down afterwards.

```text
apps/web   pnpm exec next start --port 4310    ready when GET http://127.0.0.1:4310/ answers
apps/api   node dist/main.js  (API_PORT=4311)  ready when GET http://127.0.0.1:4311/health answers
```

Four properties of that setup are load-bearing:

- **Production output, not development servers.** The `test:e2e` Turborepo task declares
  `@devsync/web#build` and `@devsync/api#build` as dependencies, which is what puts
  `apps/web/.next` and `apps/api/dist` on disk before Playwright runs. They are named
  explicitly rather than pulled in through `^build`, because `@devsync/e2e` does not import the
  applications — it starts them — and making them package dependencies to get the same ordering
  would also drag both builds into `pnpm test`.
- **Readiness is polled, never slept on.** Each entry declares the URL that means "ready" — for
  the API, the very endpoint under test — with an explicit timeout (120 s for the web build,
  60 s for the API). **Nothing in the suite waits on a fixed delay**: every assertion auto-waits,
  there is no `waitForTimeout`, and `retries` is `0`. The one timing value anywhere in it is the
  50 ms between keystrokes in the real-editor test, which paces input like a person rather than
  waiting for anything.
- **`reuseExistingServer` is off.** A server already listening on a test port is an error, not
  an accidental test subject. The suite can never pass by talking to something a developer
  started by hand.
- **Configuration comes from the config file, not from a file on disk.** This repository has no
  `.env` loading, so `API_PORT` is passed through the `webServer` environment and the web port
  through a command-line argument.

Paths are resolved from `__dirname`, so the suite behaves identically whether it is started by
Turborepo, by pnpm, or by hand from any directory.

## Ports

| Port   | Used by                     |
| ------ | --------------------------- |
| `3000` | `apps/web` in development   |
| `3001` | `apps/api` in development   |
| `4310` | `apps/web` under Playwright |
| `4311` | `apps/api` under Playwright |

The end-to-end ports are fixed rather than random so that a failing run can be reproduced and
inspected, and they are far from the development pair so that `pnpm test:e2e` and `pnpm dev` can
run at the same time without either noticing the other.

## Artifacts

| Path                           | Produced by | Contents                                |
| ------------------------------ | ----------- | --------------------------------------- |
| `apps/web/coverage/`           | Vitest + v8 | Text summary and HTML report            |
| `apps/api/coverage/`           | Jest        | HTML, lcov, clover, JSON                |
| `tests/e2e/test-results/`      | Playwright  | Traces and screenshots, on failure only |
| `tests/e2e/playwright-report/` | Playwright  | HTML report                             |

All four are ignored by Git, by Prettier, and by ESLint. Nothing generated by a test run is
tracked, and no test run modifies a tracked file.

Traces are retained on failure and screenshots captured on failure — enough to diagnose a red
run without recording gigabytes for green ones. The HTML report never opens a browser by itself,
so a failing run cannot leave a stray window behind; open it deliberately with
`pnpm --filter @devsync/e2e exec playwright show-report`.

## Coverage, and what the numbers mean

Coverage is measured in the two workspaces that have code: `apps/web` through Vitest's v8
provider, and `apps/api` through Jest. **There is no repository-wide coverage figure**, and the
six workspaces with no implementation are not counted in either direction.

As of this milestone:

```text
apps/web               79.54%  statements  (page.tsx, local-editor-workspace.tsx and
                                            languages.ts 100%, code-editor.tsx 80.76%,
                                            layout.tsx and the three worker entry points 0%)
apps/api               68.75%  statements  (health.controller.ts and health.module.ts 100%,
                                            app.module.ts 0%)
```

Both numbers are reported as measured, including the parts that look bad:

- `apps/web/src/app/layout.tsx` is at 0% because Vitest cannot import it at all — `next/font/google`
  only resolves inside the Next.js compiler. It is covered in substance by the Playwright title
  assertion, which no coverage tool attributes back to it.
- `apps/web/src/editor/code-editor.tsx` is short of 100% by exactly the three worker factories, and
  the three entry points in `src/editor/workers/` are at 0% for the same reason: jsdom has no web
  workers, so the functions that construct them are never called and the modules they point at are
  never loaded. They run in Chromium, under Playwright, where nothing attributes them back either.
  The figure fell slightly at B2 because JSON's language service added a fourth branch to
  `getWorker` and a third entry point, all of them in that same unmeasurable region.
- **`apps/web/src/editor/local-editor-workspace.tsx` and `src/editor/languages.ts` are at 100%**,
  which is what a component holding two values and a five-entry list should be. They are the least
  interesting numbers here and the easiest to keep honest.
- `apps/api/src/app.module.ts` is at 0% because the Jest test boots `HealthModule` directly. The
  Playwright suite boots the real `AppModule`, again without being attributed.
- `apps/api/src/main.ts` is excluded from measurement rather than reported at 0%. It calls
  `app.listen`, so importing it from an in-process test would bind a port as a side effect of
  measuring it. Playwright runs it for real instead.

**No coverage thresholds are configured, deliberately.** Five source files and three one-line worker
entry points are still too small a base for a percentage to mean anything, and a threshold on a
foundation this size mostly invites
tests written to satisfy the number. Thresholds should be introduced with the first milestone
that adds substantive application logic — a real service, a real reducer, a real protocol
handler — and set from what that code actually achieves rather than from a round number.

## How persistence will be tested — planned

**Nothing in this section exists.** There is no database, no test database, and no such test; C0
decided the ladder so that C1 does not have to invent it while also writing its first migration.
The shape of the data being tested is in
[`architecture.md`](architecture.md#phase-c--planned-persistence-architecture).

Two rules hold across all of it. **Database tests run against real PostgreSQL** — not SQLite, and
not a mocked Prisma client, because the behaviour worth testing is precisely what a substitute does
not have: cascades, unique constraints, rollback, and server-generated identifiers and timestamps.
And **`pnpm test` keeps starting nothing.** It is the command that runs on every save; a suite that
needs a database running belongs behind its own command, not inside the fast one.

### C1 — the data layer

Integration tests in `@devsync/database`, run by Vitest under the existing runner boundary, against
a real PostgreSQL instance reached through `TEST_DATABASE_URL` with the committed migration applied
first. They isolate deterministically: each test cleans the records it needs cleaned rather than
depending on the order the runner happened to choose, and the destructive cleanup runs only after a
safety check has confirmed the target is disposable — missing, unsafe, or equal to `DATABASE_URL`
means refuse to run, not proceed carefully. They run serially until per-worker database or schema
isolation exists, because two workers truncating one database is a flaky suite by construction.

At minimum they cover project persistence, file persistence, generated UUIDs and timestamps, a
duplicate file name within one project being rejected, the same name in two projects being
accepted, empty content round-tripping unchanged, cascade deletion when a project is removed, the
project-plus-first-file creation being atomic in both directions, and data still being there after
the client disconnects and reconnects.

Two of those deserve naming, because they are the ones an assumption could quietly get wrong:

- **Case-sensitive file-name uniqueness.** `README.md` and `readme.md` must both be storable in one
  project, and a second `README.md` must be rejected. The schema and its collation are what have to
  produce that, so the test has to exercise the real database rather than trust a default.
- **`Project.updatedAt` moving on file changes.** Creating, renaming, retyping, editing, or deleting
  a file must move its project's timestamp, in the same transaction — including the rollback
  direction, where a failed file change leaves the project timestamp untouched.

`TEST_DATABASE_URL` belongs to this tooling alone. The API never reads it, and leaving it unset must
not affect anything except whether these tests can run.

### C2 — the API

Jest in `apps/api`, as now, but with a real Nest application and a real test database wherever the
claim involves persistence. Mocking the data layer would prove the controller calls it the way the
test expects, which is not the same thing. These cover validation, the CRUD behaviour of every
route, the exact status codes and error codes, a duplicate name producing `409` with
`FILE_NAME_TAKEN`, a missing record producing `404`, a malformed identifier producing `400`, a file
addressed through the wrong project producing `404`, and persistence errors arriving as the
documented error shape rather than as anything Prisma wrote.

`GET /projects` ordering is proved here rather than at the data layer, because it is an API
guarantee: editing a file in an older project must move that project to the front of the list.

### C3 — the browser

Playwright, against the real web application, the real API, and a disposable database: create a
project, add a file, edit it, reload, and find it unchanged. This is also where the repository's
oldest testing gap closes — the suite finally exercises `apps/web` calling `apps/api`, which today
it cannot, because that call does not exist.

### C4 — restarts

The milestone that proves persistence rather than asserting it: a browser reload, an API restart, a
PostgreSQL container restart, closing and reopening a project, the committed migration applying to
a database that already holds rows without losing any, and a database that is temporarily
unavailable producing a controlled `503` instead of a stack trace.

### The task it runs under

Database-backed tests get their own root script and their own `turbo.json` task, added together the
way every other test task was — a root script calling a task Turborepo does not know about silently
does nothing. It is `cache: false`, for the same reason `test:e2e` is: the result depends on a live
database that is not part of the input hash.

It must be explicit rather than implied by an ordinary test command, must never run against a
developer's normal `DATABASE_URL`, must not modify a tracked file, must not wait on a fixed sleep,
and must name what failed rather than reporting that a suite did. The local command comes first and
CI uses that same command afterwards — CI runs what a developer runs, and this is not the place to
start making an exception.

## How collaboration will be tested later

Nothing below exists yet. It is recorded so the current structure is understood as a foundation
rather than as a finished strategy.

Real-time collaboration is the one thing in DevSync that cannot be proved by a single-client
test, because the property under test is _convergence between clients_. Playwright is in this
repository primarily for that: `browser.newContext()` produces fully isolated sessions —
separate storage, cookies, and service workers — inside a single browser process, so one test
can act as two users:

```ts
// Illustrative only; no such test exists.
const alice = await browser.newContext();
const bob = await browser.newContext();
// ...open the same document in both, type in one, assert the other converges.
```

That shape is what will eventually cover concurrent editing, remote cursors and presence,
conflict resolution under simultaneous edits, and reconnection after a dropped socket. Each
needs the collaboration transport to exist first.

## Known limitations

- **No cross-application test exists**, because no such behaviour exists: `apps/web` never calls
  `apps/api` today. The end-to-end suite proves each application serves correctly; it does not
  prove they talk to each other, because they do not.
- **Monaco's change callback is proved in jsdom, not in a browser.** `specs/web/local-editor.spec.ts`
  proves a real keystroke reaches Monaco and survives a workspace rerender; it cannot prove the
  Monaco → React half, for the reason set out in that test's section above. The direction is covered
  by the component suites against a stand-in.
- **Machine-speed edits lose characters.** The controlled value is rewritten into the model whenever
  it disagrees with it, so edits arriving faster than React commits are overwritten by a stale
  value. Human-paced typing and paste were both verified unaffected at Phase B closure, so no user
  interaction today is exposed — but Phase E applies remote CRDT operations programmatically, and
  that is where the model-ownership design has to be answered.
- **No test asserts how Monaco highlights a language.** The suites prove that the selected language
  reaches Monaco and that the content survives the change; tokenisation is Monaco's, and asserting
  it here would test Microsoft's code through DevSync's.
- **Monaco's own editing behaviour is not re-tested.** Undo, selection, multi-cursor, suggestions,
  search, and copy-paste are Microsoft's to cover. B3 asserts one line typed through one integration
  boundary, which is the part DevSync owns.
- **Monaco's own behaviour is not tested and should not be.** Tokenisation, the language service,
  and the worker protocol are Microsoft's to cover; DevSync tests the boundary it owns.
- **Concurrent editing, persistence, authentication, reconnection, and code execution are
  untested**, because none of them are implemented.
- **Chromium only.** Firefox and WebKit are not installed or run. One engine is enough to prove
  a page renders and an endpoint answers; cross-browser coverage earns its place once there is
  browser-specific behaviour to disagree about.
- **CI runs every command in this document, but on Ubuntu only.** Nothing validates that the
  suite passes on Windows or macOS, even though the repository is developed on Windows. See
  [`ci.md`](ci.md).
- **`@devsync/test-utils` is still empty.** No current test needs a shared helper — the three
  layers use three different runners and each assertion is a few lines — and inventing one now
  would be an abstraction with no user.
- **Vitest configuration is not shared.** `apps/web` is the only Vitest workspace, so
  `apps/web/vitest.config.mts` is self-contained. When a second workspace needs Vitest, the
  runner-agnostic parts move into `@devsync/config`, the way the TypeScript and ESLint
  configuration did in Phase A1.
- **The Playwright suite needs one manual step per machine**, `pnpm test:e2e:install`, before it
  can run.

## Current inventory

| Workspace                | Runner     | Real tests | Environment       | Coverage |
| ------------------------ | ---------- | ---------- | ----------------- | -------- |
| `@devsync/web`           | Vitest     | 36         | jsdom             | yes      |
| `@devsync/api`           | Jest       | 1          | node              | yes      |
| `@devsync/e2e`           | Playwright | 8          | Chromium and HTTP | no       |
| `@devsync/collaboration` | none       | 0          | —                 | no       |
| `@devsync/database`      | none       | 0          | —                 | no       |
| `@devsync/shared`        | none       | 0          | —                 | no       |
| `@devsync/ui`            | none       | 0          | —                 | no       |
| `@devsync/test-utils`    | none       | 0          | —                 | no       |
| `@devsync/config`        | none       | 0          | —                 | no       |

**Forty-five real tests in total.** The six workspaces without a runner print that they have no
tests and exit successfully. That is the correct behaviour for a workspace with no implementation: a
test runner installed into an empty package, or a test asserting that `true` is `true`, would
make the table above look uniform while proving strictly less than the sentence it prints.
