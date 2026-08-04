# Testing

How DevSync is tested, what each layer is responsible for proving, and — just as
importantly — what is not tested yet.

The testing architecture was introduced in **Phase A2 — testing foundation**. C1 added database
integration tests, in `packages/database`, against a real PostgreSQL. **C2 added two more layers**:
schema tests in `packages/shared`, which need nothing, and HTTP integration tests in `apps/api`
against the real application over that same real PostgreSQL. The product still has no collaboration,
no accounts, and no code execution, so none of those things are tested — and persistence is now
tested at the data layer _and_ through every route, but not from a browser, because `apps/web` makes
no request to `apps/api`.

## Layers

| Layer                  | Runner         | Lives in                     | Runs against                               |
| ---------------------- | -------------- | ---------------------------- | ------------------------------------------ |
| Contract               | **Vitest**     | `packages/shared`            | Schemas, in Node, in-process               |
| Unit / component       | **Vitest**     | `apps/web`                   | React components, in jsdom, in-process     |
| HTTP-level application | **Jest**       | `apps/api`                   | A Nest application on an ephemeral socket  |
| Database integration   | **Vitest**     | `packages/database`          | A real PostgreSQL, with migrations applied |
| API integration        | **Jest**       | `apps/api`                   | The real `AppModule`, over that PostgreSQL |
| Browser / full-stack   | **Playwright** | `tests/e2e` (`@devsync/e2e`) | The built applications, on real ports      |

Six layers, three runners. No runner was added: the two new layers joined the runner their workspace
already used.

**Vitest owns the frontend and the pure TypeScript packages.** It shares Vite's transform pipeline
with the tooling `apps/web` already uses, starts fast enough to run on every save, and handles TSX
without extra configuration. C1 made `packages/database` its second workspace, which is what moved
the runner-agnostic parts of the configuration into `@devsync/config`; C2 made `packages/shared` the
third, and it spread what was already there rather than adding to it.

**Jest stays in `apps/api`, and now runs two suites there.** `@nestjs/testing` is written against
Jest's API, and `ts-jest` reads `apps/api/tsconfig.json` directly — including
`emitDecoratorMetadata`, which NestJS's dependency injection depends on. Moving the API to Vitest
would mean reintroducing that decorator metadata through SWC or Babel to buy uniformity and nothing
else. The migration is not blocked; it is simply not paid for.

**Playwright owns everything that needs a real process.** It is the only layer that runs
compiled output, binds ports, and drives a browser.

## What the current tests actually prove

### `packages/shared` — the contracts (Vitest, Node, 100 tests)

Five files over the schemas `apps/api` validates every request against and answers every response
with. They run through `parseContract`, which is the function the API calls, so a passing test is a
statement about the API's behaviour rather than about Zod's.

- **`languages.test.ts`** — the five identifiers are exactly the five DevSync offers, each is
  accepted, and the validator is exact: `TypeScript` is not `typescript`, `rust` is refused, a
  number is not coerced, and an empty string does not fall back to a default.
- **`identifiers.test.ts`** — a UUID is accepted and five shapes of malformed identifier are not,
  and the route-parameter schemas name which parameter was wrong.
- **`requests.test.ts`** — names are trimmed before anything stores them and lengths are measured
  **after** trimming, so `'  ' + 100 characters + '  '` is valid and 101 characters is not; content
  is never trimmed; omitted content becomes `''` and explicit `''` stays `''`; unknown properties
  are rejected rather than dropped; a file patch carrying nothing is rejected; and name, language,
  and content can each be changed alone.
- **`resources.test.ts`** — a timestamp must be a UTC instant, not a local time with an offset, a
  date, or a number of milliseconds; a project resource may not carry files; a file **summary** may
  not carry content and a full file resource must; and a listing is a bare array, not an envelope.
- **`errors.test.ts`** — the seven stable codes are exactly those seven, an eighth is refused, an
  issue path may hold numeric segments, an **empty** issue list is invalid because it claims detail
  it does not have, and an error resource may not carry a stack trace.

The strictness is what makes several of these assertions work at all: because the summary schema
refuses unknown keys, parsing a summary that leaked a `content` property _is_ the failing assertion.

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

### `apps/api` — configuration and lifecycle (Jest, 16 tests)

`src/config/api-configuration.spec.ts` covers the validator that decides whether the API starts at
all: the port defaults to 3001 and is rejected when it is not a TCP port, `DATABASE_URL` is
required and rejected when it is blank, unparseable, not PostgreSQL, or names no database — and one
test asserts that a failure message never repeats the connection string, because it carries a
password.

`src/database/database.lifecycle.spec.ts` proves the wiring, with a stand-in for the data layer
typed as the real `Database` so it cannot drift from the interface: Nest connects during
initialisation, disconnects during shutdown, and **a database that cannot be reached fails
startup** rather than leaving a service that accepts requests it cannot serve. What PostgreSQL does
is not tested here — that belongs to `pnpm test:db`, and mocking a database while claiming database
behaviour is the thing that layer exists to avoid.

### `apps/api` — `src/health/health.http.spec.ts` (Jest, 1 test)

An **HTTP-level application test**, not a unit test. It compiles the real `HealthModule`, boots
a Nest application from it, and drives `GET /health` through the framework's routing and
serialisation, asserting status `200` and the exact body `{"status":"ok","service":"devsync-api"}`.
Supertest binds an ephemeral socket, so it depends on no fixed port and no running server.

It deliberately does not prove that `main.ts` bootstraps, that `AppModule` imports
`HealthModule`, or that the compiled output in `dist` serves anything. Those are failure modes
of the built process rather than of the health feature, and they belong to the layer below.

**It boots `HealthModule` directly, so it needs no database** — which is why it stayed a
sub-second test after C1 gave `AppModule` a connection to open. The API integration suite and the
Playwright suite are what prove the real `AppModule` starts, database and all.

### `apps/api` — the error boundary and the mappers (Jest, 29 tests)

Three files C2 added that need no database, and must not have one.

`src/common/api-exception.filter.spec.ts` boots the real controllers, services, filter, and body
parser over a data layer that does nothing but fail in a way the test chose. **That is the only
honest way to see three of the four persistence meanings**: a real PostgreSQL cannot be asked to
become unavailable in the middle of an integration run without taking the rest of that run with it,
and stopping it for real belongs to C4. It proves each meaning becomes its documented status and
code, that an exception nobody anticipated becomes a generic `500`, that the real exception is
**logged** rather than returned, and — with a deliberately leaky cause carrying a Prisma error name,
a code, a SQL fragment, a table name, a host, and a password — that none of it reaches the response.
It also proves a body that is not JSON becomes `400 VALIDATION_FAILED`, and that an unmatched route
is left to the framework rather than given a code the contract does not have.

**It is not a claim that any route works.** The database is a stand-in that only ever fails; a fake
database proving CRUD would prove that a controller calls a stand-in the way the test expects, which
is a different claim.

`src/common/contract.pipe.spec.ts` covers the two pipes directly: what comes out is the trimmed,
defaulted value rather than what went in, a bad body is `VALIDATION_FAILED` and a bad identifier is
`INVALID_IDENTIFIER`, and each names the property it objected to.

`src/common/resources.spec.ts` covers the seam between storage and the wire: both timestamps become
UTC ISO-8601 strings, a summary has no `content` and a full resource does, empty content survives as
a property rather than being dropped, a column the contract does not name is not copied across, and
a stored language the supported list no longer contains fails as an internal error instead of being
coerced.

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

| Command                 | What it runs                                                                  |
| ----------------------- | ----------------------------------------------------------------------------- |
| `pnpm test`             | Every in-process suite: Vitest and Jest. No browsers, no builds, no database. |
| `pnpm test:unit`        | The Vitest layer only — the fast inner loop.                                  |
| `pnpm test:db`          | The two database-backed suites, in sequence, against a running PostgreSQL.    |
| `pnpm test:e2e`         | Playwright. Builds both applications first, then starts them.                 |
| `pnpm test:all`         | `test`, then `test:db`, then `test:e2e`. Sequential, and needs PostgreSQL.    |
| `pnpm test:coverage`    | Coverage for `apps/web` and `apps/api`.                                       |
| `pnpm test:e2e:install` | Downloads the Chromium build Playwright needs. Run once per machine.          |

`pnpm test` is the default because it stays fast: it neither builds anything, launches a browser,
nor needs a database. The other two are separate for the same reason.

**"Builds nothing" is literal, and it is checked from a clean tree.** `test`, `test:unit`, and
`test:coverage` declare no `dependsOn` at all in `turbo.json`, so a dry run of the task graph
schedules nine `#test` tasks and not one `#build` or `#generate`. After `pnpm clean && pnpm test`,
`packages/database/src/generated`, `packages/database/dist`, `packages/shared/dist`,
`apps/api/dist`, and `apps/web/.next` are all still absent. A previously built tree proves nothing
here; the clean tree is the test.

| Command         | Needs PostgreSQL | Runs                                                           |
| --------------- | ---------------- | -------------------------------------------------------------- |
| `pnpm test`     | no               | Vitest in `packages/shared` and `apps/web`, Jest in `apps/api` |
| `pnpm test:db`  | **yes**          | Vitest in `packages/database`, then Jest in `apps/api`         |
| `pnpm test:e2e` | **yes**          | Playwright over both built applications                        |
| `pnpm test:all` | **yes**          | All three above, one after another                             |

**`pnpm test:db` runs its two suites one after the other, and the root script says so:**

```json
"test:db": "turbo run test:db --filter=@devsync/database && turbo run test:db --filter=@devsync/api"
```

Two invocations rather than one, because both suites reset and rewrite the **same** schema in the
same disposable database. Letting Turborepo choose the order would let them run at once, and a suite
that drops a schema while another is reading it is a flaky suite by construction. The `&&` is the
guarantee, and it is the cheapest way to state it — the same reasoning as `pnpm test:all`.

```bash
docker compose up -d database
```

The three that need it read `TEST_DATABASE_URL`; copy `.env.example` to `.env` at the repository
root and it is set.

**`pnpm test:all` is a plain shell sequence, not a Turborepo fan-out.** `test:db` drops and
re-migrates the same disposable database that `test:e2e` migrates before starting the API, so
running the two concurrently would have one pulling the schema out from under the other. Sequence
is the guarantee, and `&&` is the cheapest way to state it.

`pnpm test:e2e:install` is separate on purpose. It writes roughly 300 MB to a machine-level
cache, and a command that mutates a developer's machine should be something they chose to run,
not a side effect of running tests.

The `test:unit` / `test` distinction is a real one rather than an alias: `apps/api`'s suites are
HTTP-level application tests, so it correctly has no `test:unit` script and does not appear in that
command. `packages/shared` does, because schemas in Node are exactly what that layer is.

### Within a workspace

```bash
pnpm --filter @devsync/shared test        # vitest run
pnpm --filter @devsync/web test           # vitest run
pnpm --filter @devsync/web test:watch     # vitest, watching
pnpm --filter @devsync/web test:coverage  # vitest run --coverage

pnpm --filter @devsync/api test           # jest — the fast suite
pnpm --filter @devsync/api test:db        # jest — the PostgreSQL-backed suite
pnpm --filter @devsync/api test:watch     # jest --watch
pnpm --filter @devsync/api test:coverage  # jest --coverage

pnpm --filter @devsync/e2e test:e2e       # playwright test, assuming both apps are already built
```

The last one skips the Turborepo build step, so it fails with a missing `dist/main.js` or
`.next` if the applications have not been built. Use `pnpm test:e2e` from the root unless you
know they have.

### Turborepo tasks

`test`, `test:unit`, `test:db`, `test:coverage`, and `test:e2e` are all declared in `turbo.json`. A
root script that calls a task Turborepo does not know about silently does nothing, so a new test
script must be added in both places.

**`test`, `test:unit`, and `test:coverage` declare no dependencies.** `test:db` declares
`dependsOn: ["^build", "generate"]`, because the API's database-backed suite loads the **compiled**
`@devsync/database` and `@devsync/shared` and the data layer needs its Prisma Client generated; it
is `cache: false`, like `test:e2e`, because the result depends on a live database that is not part
of the input hash. `test:e2e` names both application builds explicitly for the same kind of reason.

That split is the whole point: the suites that exercise real processes and a real database build
what they exercise, and the suite that runs on every save builds nothing.

### How the fast API suite runs with nothing built

`apps/api` depends on two workspace packages that are compiled for production. If its fast suite
loaded them from `dist`, `pnpm test` would have to run `prisma generate` and two `tsc` invocations
before its first assertion — which is exactly the promise this document makes and the reason the
dependency was removed.

So the fast suite reads their TypeScript instead. `apps/api/jest.config.mjs` maps the two package
specifiers:

```js
moduleNameMapper: {
  '^@devsync/shared$':   '<rootDir>/../../packages/shared/src/index.ts',
  '^@devsync/database$': '<rootDir>/../../packages/database/src/contracts.ts',
}
```

and `apps/api/tsconfig.test.json` carries the matching `paths`, so ts-jest **type-checks** against
the same sources it loads. Four properties of that arrangement are deliberate:

- **They are the real modules.** The same Zod schemas the API validates every request against, and
  the same `PersistenceError` class it throws. Nothing is copied, mocked, or re-declared.
- **The bare specifier is mapped, not individual files.** If production code resolved
  `PersistenceError` from `dist` while a test constructed one from source, they would be two
  different classes and every `instanceof` check would quietly stop matching.
- **`@devsync/database` maps to `contracts.ts`, not `index.ts`.** Only `contracts.ts` is free of the
  generated Prisma Client — it holds the records, the operation interfaces, `Database`, and
  `PersistenceError`, and imports nothing from Prisma. A fast test that reached for `createDatabase`
  would fail to resolve, which is the right answer: opening a connection belongs to `pnpm test:db`.
- **Production is untouched.** `pnpm build`, `node apps/api/dist/main.js`, and both container images
  resolve `@devsync/shared` and `@devsync/database` through their `exports` maps to `dist/index.js`,
  exactly as before. `jest.db.config.mjs` carries no mapping at all, because proving the compiled
  packages work is the only thing that suite is for.

`test:coverage` declares `coverage/**` as its output and is cached like any other deterministic
task. `test:e2e` sets `cache: false`: its result depends on live processes binding real ports
and on a browser being installed, none of which is part of the input hash, so a cache hit would
report a pass without having proved anything.

Keep `pnpm test` free of build steps. `test` once declared `dependsOn: ["^build"]`, which was
harmless while no workspace in it depended on a package that builds — and stopped being harmless the
moment `apps/api` took production dependencies on `@devsync/database` and `@devsync/shared`. From a
clean tree the fast command was scheduling `@devsync/database#generate`, `@devsync/database#build`,
and `@devsync/shared#build` before its first test. A cached run hid it. **The clean-tree dry run is
the check that does not lie**, and it is worth repeating whenever a workspace in `pnpm test` gains a
dependency on one that emits:

```bash
pnpm clean
pnpm exec turbo run test --force --dry=json   # no task may end in #build or #generate
```

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

**`pnpm test:coverage` currently measures `apps/web` and `apps/api`** — the first through Vitest's
v8 provider, the second through Jest. **There is no repository-wide coverage figure**, and the
workspaces with no implementation are not counted in either direction.

`packages/database` and `packages/shared` are deliberately not in that command. The data layer's
suite needs a running PostgreSQL, and folding it in would make a command that works today start
failing on a machine with no database — the same reason it is not in `pnpm test`. `packages/shared`
is left out for the opposite reason: it is 100 tests over schemas whose every branch is a schema
rule, and a percentage over it would say less than the list of rules already does. Both are covered;
what is missing is a number, not the testing.

`pnpm test:coverage` builds nothing either: `apps/web` measures its own source, and `apps/api` runs
the same fast Jest configuration, so it reads the two workspace packages from source exactly as
`pnpm test` does.

Numbers from the last measured run of `apps/web` and `apps/api`, taken before C1 added the API's
configuration and lifecycle code and **not re-measured since C2 added its routes** — they describe a
smaller application than the one that exists now, and are kept only because a stated stale figure is
more useful than a deleted one:

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

## The database layer — `packages/database` (Vitest, 57 tests)

**39 integration tests against a real PostgreSQL**, plus **18 over the safety gate** that decides
whether they may run at all. Both are run by `pnpm test:db` and by nothing else.

The 39 use a real database. Not SQLite, and not a mocked Prisma client, because the behaviour worth
testing is precisely what a substitute does not have: cascades, unique constraints, rollback, and
server-generated identifiers and timestamps. A mocked client would prove the code calls the library
the way the test expects, which is a different claim.

**`pnpm test` still starts nothing.** It is the command that runs on every save; the suite that
needs a database has its own command, its own non-cached Turborepo task, and no place in the fast
one.

### Before the first test

`tests/global-setup.ts` drops the test schema and applies the committed migration — the same
migration Compose and CI apply, not a schema pushed straight from `schema.prisma`. So the suite
proves the migration produces a database the code can actually work against.

**It refuses to run against anything it cannot prove is disposable.** `TEST_DATABASE_URL` must be
set, be a valid URL, be PostgreSQL, name `devsync_test`, and address a different database from
`DATABASE_URL`. Any of those failing is a refusal with a message explaining which, and no message
ever contains the connection string, because it carries a password. The gate lives in
`tools/test-database.mjs` because the end-to-end suite prepares the same database and must not
carry a second copy of the rules.

**"A different database" is decided on a canonical form, not on string equality** —
`safety-gate.test.ts` is the 18 tests that hold it. `postgres:` and `postgresql:` are one scheme,
an omitted port is 5432, `localhost` and `127.0.0.1` and `[::1]` are one machine, and credentials
are excluded from a target's identity, so a development URL spelled any of those ways still stops
the suite. A `DATABASE_URL` that is set but unparseable is also a refusal: this tooling drops a
schema, and "I could not tell" is not the same as "they are different". There is deliberately no
DNS lookup — a safety check that behaved differently on a train would be worse than one with a
stated limit, and the `devsync_test` name requirement is what covers two hostnames resolving to
one server.

The suite runs serially — `fileParallelism: false` — because two workers truncating one database is
a flaky suite by construction. Tables are emptied before each test rather than after, so a run that
crashed halfway cannot leave rows that quietly change the next one.

### What the 39 integration tests prove

Project persistence, file persistence, UUIDs the database generated, timestamps generated on
create, empty content round-tripping as an empty string, two projects sharing a name, the same file
name in two projects, deterministic listing order for both resources, rename, delete, and cascade
deletion removing a project's files and leaving another project's alone.

Four groups deserve naming, because each is a claim an assumption could quietly get wrong:

- **Case-sensitive file names.** `README.md` and `readme.md` coexist in one project; a second
  `README.md` is rejected. This is what holds the `C` collation in the migration honest — the
  property is the schema's, so only the real database can demonstrate it.
- **The initial-file transaction, in both directions.** A project and its first file are written
  together; a file insert that fails leaves no project behind; a project insert that fails leaves
  no file. Both failures are forced with a value too long for its column, so the rollback is the
  database's own rather than something the test arranged.
- **`Project.updatedAt` following its files.** Creating, renaming, retyping, and editing a file all
  assert that the project's timestamp **equals the file's exactly** — which is only possible if one
  transaction wrote both. That is deliberate: "is it later than before" would pass for a write that
  happened seconds afterwards, and would depend on two clock readings falling in different
  milliseconds. Deletion can only support the weaker claim, since there is no surviving row to
  compare against, and it is asserted as the weaker one. A failed change asserts the timestamp is
  **exactly** unchanged.
- **The connection lifecycle.** Connect, write, disconnect, reconnect through a second client, and
  read the same data back. Repeated connects and disconnects are safe. An unreachable database —
  a port nothing listens on, so the refusal is immediate rather than a timeout — is classified as
  `unavailable` both at `connect()` and on a query, and the error that comes out carries no SQL, no
  host, and no database name, with the driver's own error kept only as `cause`.

`TEST_DATABASE_URL` belongs to this tooling alone. The API never reads it, and leaving it unset
affects nothing except whether these tests can run.

## The API integration suite — `apps/api` (Jest, 110 tests)

C2's layer, and the one that finally drives persistence through HTTP. It boots the **real**
`AppModule` — configuration, database module, both controllers — through the **same**
`configureHttpApplication` that `main.ts` calls, against the **same** disposable PostgreSQL, with the
**same** committed migration applied by the **same** safety gate. Nothing is mocked. Supertest binds
an ephemeral socket per request, so the suite publishes no port and cannot collide with a running
service.

Three files, run one worker at a time, with every project deleted before each test — before rather
than after, so a run that crashed halfway cannot leave rows that quietly change the next one.
Deleting a project takes its files with it, through the cascade in the schema.

**Every assertion reads a body that has already been parsed through the schema `@devsync/shared`
publishes for it.** Those schemas are strict, so a route that grew a property, dropped a timestamp,
or leaked a file's contents into a summary fails at the parse rather than reaching a client.

- **`application.db-spec.ts`** — `GET /health` still answers exactly what the rest of the system
  waits on, and still says nothing about the database. All eight routes carrying an identifier
  answer `400 INVALID_IDENTIFIER` for a malformed one, a _valid_ identifier that matches nothing
  answers `404` instead, and **every data-layer operation is spied on to prove none of them is
  called** — a malformed identifier never becomes a query. A body that is not JSON, a literal
  `null`, no body at all, and a bare string are each `400 VALIDATION_FAILED`. A file of a million
  characters is accepted; one over the 1 MiB limit is refused with the stable error shape rather
  than the parser's, and nothing from it is stored.
- **`projects.db-spec.ts`** — creation trims the name, creates exactly one file, gives it the name,
  language, and content the **API** owns (asserted by watching what the data layer was handed, so
  the policy cannot quietly move into the package), and answers a summary rather than the starter
  content. Two projects may share a name. Listing is empty when nothing exists, carries no `files`
  property, puts the most recently updated first, **moves a project to the front when a file in it
  is edited**, and answers the same order twice in a row. Detail carries summaries and never
  contents. Rename trims, moves `updatedAt`, leaves `createdAt`, and refuses an empty body, a
  whitespace name, 101 characters, and an unknown property. Delete is `204` with no body, removes
  the files by cascade, leaves other projects alone, and answers `404 PROJECT_NOT_FOUND` the second
  time.
- **`project-files.db-spec.ts`** — creation returns the whole file, defaults omitted content to
  `''`, keeps explicit `''`, does not trim content, trims the name, and moves the project's
  timestamp. The same file name is free in another project, `README.md` and `readme.md` coexist in
  one, and a duplicate is `409 FILE_NAME_TAKEN` with the name in the message and an issue on
  `name` — and the file it refused to rename is unchanged afterwards. Listing is summaries only, in
  creation order, stable across requests. Retrieval carries content and answers `404 FILE_NOT_FOUND`
  for a file that lives in another project. Patching name, language, and content is tested one at a
  time and all at once, each proving the other two are untouched; an empty patch and an
  unknown-only patch are refused; both timestamps move. Deletion is `204`, allows the **last** file
  to go, leaves the project with none, and is permanent.

Every route is covered, and so is every failure the C0 contract names. What is deliberately **not**
here is the three persistence meanings that require the database to misbehave: those are injected in
the fast suite above, and stopping PostgreSQL under a running API is C4's.

## Still planned

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

`pnpm test:db` is a root script with a matching `turbo.json` task, added together the way every
other test task was — a root script calling a task Turborepo does not know about silently does
nothing. It is `cache: false`, for the same reason `test:e2e` is: the result depends on a live
database that is not part of the input hash. It declares `TEST_DATABASE_URL` and `DATABASE_URL` in
its `env`, because Turborepo passes a task only the environment it names, and the safety gate needs
both to be able to compare them.

It is explicit rather than implied by an ordinary test command, never runs against a developer's
normal `DATABASE_URL`, modifies no tracked file, and waits on nothing timed. CI runs that same
command, in a job of its own with its own PostgreSQL service — CI runs what a developer runs, and
this is not the place to start making an exception. **The `database` job therefore covers both
suites** without a fifth job or a CI-only command.

### Why the API's database suite runs Jest through `node --experimental-vm-modules`

```json
"test:db": "node --experimental-vm-modules node_modules/jest/bin/jest.js --config jest.db.config.mjs"
```

Prisma 7 loads its WebAssembly query compiler with a dynamic `import()`, and Jest's sandbox refuses
one without that flag — so the real client cannot open a connection from inside a test at all, and
every test in the suite fails at `app.init()` with `A dynamic import callback was invoked without
--experimental-vm-modules`. The flag changes nothing about the tests, which stay CommonJS, and the
fast suite does not carry it because nothing there opens a connection. Invoking Jest's entry point
through `node` rather than through its shim is what makes the flag work on Windows as well, where
the `NODE_OPTIONS=… command` form is not shell syntax.

`packages/database`'s Vitest suite needs none of this: Vite's runtime supports dynamic import
natively. It is a Jest constraint, not a Prisma defect, and it is recorded here so the next person
to see that error does not go looking for one.

### How the end-to-end suite gets a database

From C1 the API refuses to start without one, so `pnpm test:e2e` would otherwise fail at the
`webServer` step. The `test:e2e` task therefore depends on `@devsync/database#migrate:test`, which
applies the committed migrations to `devsync_test` through the same safety gate, and
`playwright.config.ts` passes that database to the API it starts.

The suite uses the disposable test database and never the development one, and it still destroys
nothing: the browser tests exercise `apps/web`, which makes no request to `apps/api`, so the API
they start writes nothing. `reuseExistingServer` stays `false` for both applications. PostgreSQL is
the one process the suite does not start for itself — Compose runs it, which is a documented
prerequisite rather than a hidden one, and a suite that started its own database could pass while
the Compose file was wrong.

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
- **No browser test touches persistence.** Every route is covered through Supertest, and none of it
  is reached from Chromium, because nothing in the interface reaches it. That is C3's.
- **The `503` and `500` persistence paths are proved by injection, not by a real outage.** The
  mapping is exercised against a data layer told to fail; a database that genuinely goes away under
  a running API is C4's test, and doing it inside the integration run would take the rest of the run
  with it.
- **The database suite needs a PostgreSQL somebody else started.** `docker compose up -d database`
  is a prerequisite rather than something the suite arranges, which is a deliberate trade: a suite
  that starts its own database could pass while the Compose file was wrong.
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
- **`@devsync/test-utils` is still empty.** The helpers C2 added — the schema harness in
  `packages/shared/tests/support` and the application harness in `apps/api/tests/support` — each
  serve one workspace and one runner, and nothing in one is usable from the other. Moving either
  into a shared package would be an abstraction with a single user.
- **The Playwright suite needs one manual step per machine**, `pnpm test:e2e:install`, before it
  can run.

## Current inventory

| Workspace                | Runner     | Real tests | Environment           | In `pnpm test`  |
| ------------------------ | ---------- | ---------- | --------------------- | --------------- |
| `@devsync/shared`        | Vitest     | 100        | node                  | yes             |
| `@devsync/web`           | Vitest     | 36         | jsdom                 | yes             |
| `@devsync/api`           | Jest       | 46         | node                  | yes             |
| `@devsync/api`           | Jest       | 110        | node, real PostgreSQL | no — `test:db`  |
| `@devsync/database`      | Vitest     | 57         | node, real PostgreSQL | no — `test:db`  |
| `@devsync/e2e`           | Playwright | 8          | Chromium and HTTP     | no — `test:e2e` |
| `@devsync/collaboration` | none       | 0          | —                     | —               |
| `@devsync/ui`            | none       | 0          | —                     | —               |
| `@devsync/test-utils`    | none       | 0          | —                     | —               |
| `@devsync/config`        | none       | 0          | —                     | —               |

**Three hundred and fifty-seven real tests in total**, of which **182 run in `pnpm test`**, **167 in
`pnpm test:db`** — 57 in the data layer, 110 in the API — and 8 in `pnpm test:e2e`. Of the 167, 149
genuinely reach PostgreSQL; the other 18 are the safety gate, which connects to nothing and lives
there because it is database tooling.

The four workspaces without a runner print that they have no tests and exit successfully — as does
`@devsync/database` under `pnpm test`, where it says its tests need PostgreSQL and names the command
that runs them. That is the correct behaviour for a workspace with no implementation: a test runner
installed into an empty package, or a test asserting that `true` is `true`, would make the table
above look uniform while proving strictly less than the sentence it prints.
