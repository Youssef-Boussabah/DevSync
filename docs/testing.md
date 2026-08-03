# Testing

How DevSync is tested, what each layer is responsible for proving, and — just as
importantly — what is not tested yet.

The testing architecture was introduced in **Phase A2 — testing foundation** and its shape is
unchanged at **B2**, which added tests to it rather than layers. The product has no collaboration,
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

### `tests/e2e` — Playwright, 7 tests

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

**Typing into the real editor is still not covered**, and that is the distinction to keep in mind
when reading everything above. The selector tests drive a real control in Chromium; the component
tests prove DevSync's state ownership against a stand-in for Monaco. Neither proves that a keystroke
in Chromium travels through Monaco's model, into React state, and back into the editor without the
two fighting each other. Only a real browser typing into the real editor can, and that test is B3 —
the milestone that closes Phase B.

Two things found while checking that by hand are worth recording for whoever writes it. Monaco's
accessible textbox is real but rendered off-view at zero size, so it can be found by role and never
clicked — the click has to land on the rendered code surface. And Monaco's suggestion widget
captures `Enter`, so a test that types a newline mid-identifier will silently accept a completion
instead and assert against mangled text.

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
  60 s for the API). There are no fixed delays anywhere in the suite.
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
- **No test types into the real editor.** The Playwright suite proves the editor region reaches a
  browser and that the language selector works there, and the component tests prove that DevSync
  owns the content and the language and wires both correctly against a stand-in, but nothing yet
  asserts that a keystroke in a real browser lands in Monaco, reaches React state, and comes back
  without the two overwriting each other. That test is B3, the milestone that finishes Phase B.
- **No test asserts how Monaco highlights a language.** The suites prove that the selected language
  reaches Monaco and that the content survives the change; tokenisation is Monaco's, and asserting
  it here would test Microsoft's code through DevSync's.
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
| `@devsync/e2e`           | Playwright | 7          | Chromium and HTTP | no       |
| `@devsync/collaboration` | none       | 0          | —                 | no       |
| `@devsync/database`      | none       | 0          | —                 | no       |
| `@devsync/shared`        | none       | 0          | —                 | no       |
| `@devsync/ui`            | none       | 0          | —                 | no       |
| `@devsync/test-utils`    | none       | 0          | —                 | no       |
| `@devsync/config`        | none       | 0          | —                 | no       |

**Forty-four real tests in total.** The six workspaces without a runner print that they have no
tests and exit successfully. That is the correct behaviour for a workspace with no implementation: a
test runner installed into an empty package, or a test asserting that `true` is `true`, would
make the table above look uniform while proving strictly less than the sentence it prints.
