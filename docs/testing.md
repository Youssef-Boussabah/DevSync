# Testing

How DevSync is tested, what each layer is responsible for proving, and — just as
importantly — what is not tested yet.

The testing architecture was introduced in **Phase A2 — testing foundation** and is unchanged at
**Phase A complete**. The product has no collaborative editor, no persistence, no accounts, and
no code execution, so
none of those things are tested. What exists is the architecture that will hold those tests
when they are written, plus real coverage of everything the two applications currently do.

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

### `apps/web` — `tests/home-page.test.tsx` (Vitest, jsdom, 4 tests)

Renders the real `src/app/page.tsx` with React Testing Library and asserts that the page
identifies the product as DevSync, describes what DevSync is, states which phase the repository
is at, and does not claim that collaboration, persistence, or execution work yet.

The home page is a Server Component, but a synchronous one that touches no server-only API — it
is an ordinary function returning JSX, so it mounts directly and no test-only wrapper had to be
invented for it. `layout.tsx` is different: it imports `next/font/google`, which only the
Next.js compiler resolves, so Vitest cannot load it. The metadata it declares is therefore
asserted by Playwright against the real document instead of being re-implemented in a mock.

### `apps/api` — `src/health/health.http.spec.ts` (Jest, 1 test)

An **HTTP-level application test**, not a unit test. It compiles the real `HealthModule`, boots
a Nest application from it, and drives `GET /health` through the framework's routing and
serialisation, asserting status `200` and the exact body `{"status":"ok","service":"devsync-api"}`.
Supertest binds an ephemeral socket, so it depends on no fixed port and no running server.

It deliberately does not prove that `main.ts` bootstraps, that `AppModule` imports
`HealthModule`, or that the compiled output in `dist` serves anything. Those are failure modes
of the built process rather than of the health feature, and they belong to the layer below.

### `tests/e2e` — Playwright, 3 tests

`specs/web/home.spec.ts` (2 tests) loads `/` from the production build served by `next start`
and asserts the response status is `200`, that the document title is `DevSync`, and that the
level-1 heading names the product. The title assertion is what covers `layout.tsx`.

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
apps/web                  20%  statements  (page.tsx 100%, layout.tsx 0%)
apps/api               68.75%  statements  (health.controller.ts and health.module.ts 100%,
                                            app.module.ts 0%)
```

Both numbers are reported as measured, including the parts that look bad:

- `apps/web/src/app/layout.tsx` is at 0% because Vitest cannot import it at all — `next/font/google`
  only resolves inside the Next.js compiler. It is covered in substance by the Playwright title
  assertion, which no coverage tool attributes back to it.
- `apps/api/src/app.module.ts` is at 0% because the Jest test boots `HealthModule` directly. The
  Playwright suite boots the real `AppModule`, again without being attributed.
- `apps/api/src/main.ts` is excluded from measurement rather than reported at 0%. It calls
  `app.listen`, so importing it from an in-process test would bind a port as a side effect of
  measuring it. Playwright runs it for real instead.

**No coverage thresholds are configured, deliberately.** Two files and five tests is too small a
base for a percentage to mean anything, and a threshold on a foundation this size mostly invites
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
| `@devsync/web`           | Vitest     | 4          | jsdom             | yes      |
| `@devsync/api`           | Jest       | 1          | node              | yes      |
| `@devsync/e2e`           | Playwright | 3          | Chromium and HTTP | no       |
| `@devsync/collaboration` | none       | 0          | —                 | no       |
| `@devsync/database`      | none       | 0          | —                 | no       |
| `@devsync/shared`        | none       | 0          | —                 | no       |
| `@devsync/ui`            | none       | 0          | —                 | no       |
| `@devsync/test-utils`    | none       | 0          | —                 | no       |
| `@devsync/config`        | none       | 0          | —                 | no       |

**Eight real tests in total.** The six workspaces without a runner print that they have no tests
and exit successfully. That is the correct behaviour for a workspace with no implementation: a
test runner installed into an empty package, or a test asserting that `true` is `true`, would
make the table above look uniform while proving strictly less than the sentence it prints.
