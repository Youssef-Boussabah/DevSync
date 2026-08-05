# Testing

How DevSync is tested, what each layer is responsible for proving, and — just as
importantly — what is not tested yet.

The testing architecture was introduced in **Phase A2 — testing foundation**. C1 added database
integration tests, in `packages/database`, against a real PostgreSQL. C2 added two more layers:
schema tests in `packages/shared`, which need nothing, and HTTP integration tests in `apps/api`
against the real application over that same real PostgreSQL. **C3 added no layer and closed the
oldest gap in this document**: the Playwright suite now drives `apps/web` calling `apps/api`, so
persistence is tested at the data layer, through every route, _and_ from a real browser. The product
still has no collaboration, no accounts, and no code execution, so none of those things are tested.

## Layers

| Layer                  | Runner         | Lives in                     | Runs against                                  |
| ---------------------- | -------------- | ---------------------------- | --------------------------------------------- |
| Contract               | **Vitest**     | `packages/shared`            | Schemas, in Node, in-process                  |
| Unit / component       | **Vitest**     | `apps/web`                   | React components and the API client, in jsdom |
| HTTP-level application | **Jest**       | `apps/api`                   | A Nest application on an ephemeral socket     |
| Database integration   | **Vitest**     | `packages/database`          | A real PostgreSQL, with migrations applied    |
| API integration        | **Jest**       | `apps/api`                   | The real `AppModule`, over that PostgreSQL    |
| Browser / full-stack   | **Playwright** | `tests/e2e` (`@devsync/e2e`) | Both built applications and a real database   |

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

Renders the real `src/app/page.tsx` with React Testing Library and asserts that the page identifies
the product as DevSync, describes what DevSync is, states which phase the repository is at, gives the
project list a place on the page, says that saved work survives a reload and that nothing is saved
until Save, and does not claim collaboration, presence, version history, or accounts exist. One test
asserts the **absence** of Phase B's copy about a refresh discarding changes, because that sentence
became false the moment C3 made saving real.

The list is stubbed to a bare element here. This file is about what the page says and what it places
on the page; the list and the workspace each have their own file below, and a page test that also
drove data loading would fail for two unrelated reasons at once.

The home page is a Server Component, but a synchronous one that touches no server-only API — it
is an ordinary function returning JSX, so it mounts directly and no test-only wrapper had to be
invented for it. `layout.tsx` is different: it imports `next/font/google`, which only the
Next.js compiler resolves, so Vitest cannot load it. The metadata it declares is therefore
asserted by Playwright against the real document instead of being re-implemented in a mock.

### `apps/web` — the API client (Vitest, jsdom, 38 tests)

`tests/api-url.test.ts` (15) covers the one value `apps/web` reads from its environment: an http or
https origin is accepted, a trailing slash is normalised away, and a missing value, a non-URL, a
non-browser scheme, credentials, a query, a fragment, and a path are each refused with a message
naming what was wrong. One test asserts that `API_BASE_URL` resolves at module scope, which is what
makes a bad value fail the build rather than a request.

`tests/api-client.test.ts` (23) drives every operation against a stubbed `fetch`. It asserts the URL
and method of each route, `cache: 'no-store'` on reads, `Content-Type` only when there is a body, an
abort signal reaching the request, and an abort being rethrown untouched rather than reported as a
failure. On the failure side: the shared error resource becomes a typed failure carrying its stable
code, status, and field-level issue; a success body that does not match its contract, a body that is
not JSON, and a failure body that is not the error resource all become the client's own
`MALFORMED_RESPONSE`; a rejected request becomes `API_UNAVAILABLE`; and a driver-level message such
as `ECONNREFUSED 127.0.0.1:5433` is proved **not** to reach the message a user would see.

**The delete contract is asserted in both directions.** A `204` is proved to be treated as no body by
answering with a `Response` whose `json()` would reject; a `200`, a `201`, and a `202` are each
proved to be **refused** as `MALFORMED_RESPONSE`, because the delete routes answer `204` and nothing
else, and reporting a deletion that may not have happened is the failure worth refusing. A
documented `404 PROJECT_NOT_FOUND` from a delete is still read as that error rather than swept into
the malformed case.

Nothing here starts a server. The claim being tested is what the client sends and what it makes of
what comes back — decisions this layer makes on its own. That the routes behave is `pnpm test:db`'s,
and that the two meet is `pnpm test:e2e`'s.

### `apps/web` — `tests/languages.test.ts` and `tests/file-draft.test.ts` (Vitest, 26 tests)

`languages.test.ts` (14) holds the boundary C3 moved. The offered identifiers are asserted to equal
`SUPPORTED_LANGUAGE_IDS` **in its order**, so a second list cannot reappear; the five labels are
written out in the test rather than imported, because a test reading the same metadata the component
renders from would only prove it agrees with itself; and every option is asserted to carry exactly
`id` and `label`, which is what fails if a derived `fileName` ever comes back. The validator is
proved exact — `TypeScript` is not `typescript`, `rust` is refused, an empty string is refused, and
`main.ts` infers nothing.

`file-draft.test.ts` (12) covers what a save sends and what "unsaved changes" means: a draft is the
three editable properties and nothing else, each of them alone marks the file dirty, emptying the
content is a real change, an unchanged draft produces **no** patch, and a patch carries only the
properties that actually differ.

### `apps/web` — `tests/project-list-view.test.tsx` (Vitest, jsdom, 16 tests)

The list, with the four operations it uses replaced and everything else real — the error type, the
code check, and the issue lookup are the actual ones, so a component that read a failure wrongly
fails here.

It covers the loading state, a loaded list in the API's order, the empty state still offering the
create form, and an API-unavailable state whose retry succeeds. Creating navigates to the new
project and refuses to submit twice while a request is in flight; a validation failure is shown
against the name field and does not navigate. Renaming is proved **not** to show the new name until
the server has answered — the request is left pending and the old heading asserted, then resolved —
and a rename or delete that comes back `PROJECT_NOT_FOUND` removes the row, because the list was
stale rather than the request wrong. Deleting asks first, does nothing when refused, and warns that
it is permanent.

Timestamps are asserted through the `datetime` attribute rather than the rendered text, which is
formatted in the reader's own locale.

### `apps/web` — `tests/project-workspace.test.tsx` (Vitest, jsdom, 52 tests)

The state-ownership layer, and the file that replaced `local-editor-workspace.test.tsx`. `CodeEditor`
is replaced by a plain textarea honouring the same controlled contract, typed as the real
`CodeEditorProps` so the stand-in cannot drift from the boundary without the type-check noticing.
That is enough to act as a user typing, without pretending jsdom can run Monaco.

- **Loading a project** — the loading state, the project name and its files, the first file opened
  with its content and its stored language, a `PROJECT_NOT_FOUND` shown as a not-found view with a
  route back rather than a blank editor, a failed load offering a retry that succeeds, and a project
  with no files showing an empty state without requesting a file at all.
- **The save model** — Save is disabled and the status says `Saved` until something differs; a
  keystroke makes it `Unsaved changes`; a save sends **only** the property that changed, proved
  separately for content, name, and language; an emptied file is saved as `''`; a language change
  leaves the name alone and a rename leaves the language alone; a value the selector never offered is
  ignored; the server's answer becomes the new authority, so a name the API trimmed settles instead
  of staying dirty; the file list shows the new name; a failed save keeps the draft and says
  `Save failed`; a duplicate name is shown at the name field with `aria-invalid`; a later success
  clears the earlier failure; and the status is in an `aria-live` region.
- **Switching files** — the other file loads; an unsaved draft is protected by a confirmation that,
  refused, leaves the draft alone and makes **no** second request; accepted, it switches; and with
  nothing unsaved nothing is asked.
- **Creating a file** — created empty with the chosen language, added to the list, opened; a
  duplicate name is shown at the field; and an unsaved draft is protected **before** the request, so
  a refused confirmation creates nothing.
- **Deleting a file** — asks first, does nothing when refused, removes it and opens the next file,
  allows the **last** file to go and shows the empty state without deleting the project, warns that
  an unsaved draft goes with it, and reconciles the list when a file turns out to be gone already.
- **The project itself** — renaming shows the name the server answered with, deleting asks and then
  returns to the list, a refused confirmation deletes nothing, and leaving for the list with an
  unsaved draft asks first.
- **A write that finds the resource gone** — a save answering `FILE_NOT_FOUND` removes the file and
  opens the next one, or shows the empty state when it was the only one; a save answering
  `PROJECT_NOT_FOUND` shows the project-not-found view; and a delete answering either does the same.
  **Neither is shown as a retryable error**, because a retry could never succeed. Reverting either
  path to the code it replaced fails exactly the three assertions that cover what was broken, which
  is how the fix was confirmed to be real rather than reasoned about.
- **One write at a time** — using deferred promises so a request genuinely stays open: a delete
  cannot start while a save is in flight (the button is disabled, the API is not called, and the
  confirmation is not even asked), and a save cannot start while a delete is, **including through a
  form submit**, which is the path pressing Enter in the name field takes and therefore the one that
  reaches the handler past a disabled button. A failed save and a failed delete each return both
  controls to a usable state with no pending indicator left behind, and a delete refused during a
  save is proved to go through once that save completes.
- **Retrying a file that failed to load** — a temporary failure offers a retry and leaves the file
  selected and in the list; the retry makes a second request for the same file and opens it; the
  loading state is shown while it is in flight; a second failure stays retryable; and a file that is
  genuinely gone reconciles instead of offering a retry.

The controls are queried by accessible name rather than by test id, so a test fails if a label stops
being associated with its control.

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

### `apps/api` — configuration and lifecycle (Jest, 28 tests)

`src/config/api-configuration.spec.ts` covers the validator that decides whether the API starts at
all: the port defaults to 3001 and is rejected when it is not a TCP port, `DATABASE_URL` is
required and rejected when it is blank, unparseable, not PostgreSQL, or names no database — and one
test asserts that a failure message never repeats the connection string, because it carries a
password.

**C3 added `WEB_ORIGIN` to the same file.** It is required and refused when blank; an https origin is
accepted; a trailing slash is normalised away, because a browser never sends one; and a value that
is not a URL, a non-browser scheme, credentials, a query, a fragment, or a path is each refused —
the path case asserting that the message names the origin that was meant.

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

### `apps/api` — `src/http-application.spec.ts` (Jest, 17 tests)

C3's layer, and the one that proves the cross-origin boundary without a database. It boots a real
Nest application through the **same** `configureHttpApplication` that `main.ts` calls, so the
settings under test are the ones that run. `HealthModule` is the module it uses, because CORS is
middleware in front of the router: what it does to a request has nothing to do with which route the
request was going to reach, and a preflight never reaches one at all.

- the configured origin is allowed, and the header is never a wildcard;
- `Vary: Origin` is sent, so one origin cannot be served a cached answer meant for another;
- another origin — including one crafted to look like a prefix of the allowed one — gets **no**
  allow-origin header, while the request itself still succeeds, because CORS is enforced by the
  browser rather than by refusing to answer;
- no `Access-Control-Allow-Credentials` header is ever sent;
- a request with no `Origin` at all is answered exactly as before, which is what keeps non-browser
  clients working;
- a preflight from the web origin is answered for each of the five methods, names exactly those five
  and not `PUT`, allows exactly `Content-Type`, and exposes no additional response header;
- a preflight from another origin gets nothing to work with.

It is not a claim that any route works. That is `pnpm test:db`'s, and those routes run with this same
configuration — `api-exception.filter.spec.ts` and the PostgreSQL-backed suite both call
`configureHttpApplication`, so the body limit and the error boundary are proved **behind** the CORS
middleware rather than beside it.

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

### `tests/e2e` — Playwright, 14 tests

**This is the layer C3 changed most.** Before it, the browser wrote nothing and the suite proved that
each application served correctly without proving they talked to each other, because they did not.
Now every test below runs against a real production web build, a real compiled API, and a real
disposable PostgreSQL, with nothing mocked at any layer.

`specs/web/home.spec.ts` (4 tests) loads `/` and asserts the response status is `200`, the document
title is `DevSync` — the assertion that covers `layout.tsx` — and the level-1 heading names the
product. One test asserts that the **project list loaded**: the heading, the create form, no loading
message left over, and no API-unavailable message. That is a stronger claim than it looks, because
the list is fetched by the browser from another origin: a page that never got past `loading`, or one
whose request was refused by CORS, fails there. The last asserts that Phase B's "refreshing discards
your changes" copy is gone and the replacement is present.

`specs/web/persistence.spec.ts` (4 tests) is the milestone's claim.

- **Create, edit, save, reload.** It opens `/`, creates a uniquely named project, arrives at
  `/projects/:projectId`, and asserts the generated `main.ts` — its name, its TypeScript language,
  and the starter content. It clicks the **real Monaco** code surface, replaces the buffer with a
  unique marker, asserts the status became `Unsaved changes`, presses Save, asserts it became
  `Saved`, and reloads. After the reload the marker is present, the starter content is not, and the
  name and language are unchanged. Nothing in the browser could have supplied that: it came back from
  PostgreSQL.
- **No autosave.** A second test types into the editor, never saves, navigates away and back, and
  asserts the starter content is what the server still has.
- **Project operations.** Rename in the workspace, return to the list, find the new name there —
  which is the rename having reached the database rather than a heading that changed — reopen it,
  delete it, and assert it is gone from the list **and** still gone after a reload.
- **A project that is not there** is shown as a not-found view with a route back, and no editor.

`specs/web/files.spec.ts` (3 tests) covers the file half: a second file created with its own name and
a chosen language, content saved into it, switching to the starter file and back with each keeping
its own name, language, and content, a rename that leaves the language alone, a language change that
leaves the name alone, a reload proving all three were stored, and finally deleting it. A second test
deletes the **last** file, asserts the empty state survives a reload, asserts the project itself is
untouched, and adds a new file to it. A third covers the browser-visible conflict: creating a file
named `main.ts` in a project that already has one shows the API's `409 FILE_NAME_TAKEN` as a
field-level message with `aria-invalid` on the input, and a reload proves nothing was created.

`specs/api/cors.spec.ts` (2 tests) asks the **running** service for `/projects` with the browser's
origin and with another one, asserting the allow-origin header is present and exact for the first and
absent for the second, with no credential allowance. The fast Jest suite proves the same settings
against an application it configures itself; this proves the deployed process read `WEB_ORIGIN` from
its environment and is answering the origin the browser in this suite actually loads from.

`specs/api/health.spec.ts` (1 test) requests `/health` from the compiled `dist/main.js` running on a
real port and asserts status `200` and the exact expected payload. The overlap with the Jest test is
intentional and is not duplication: the Playwright test is the only thing that proves the service
bootstraps, that `AppModule` really imports `HealthModule`, that the build produced working output,
and that the process binds the port it was given. The Jest test is the only thing that catches a
regression in the health feature in under two seconds, without a build or a browser.

#### Driving the real Monaco editor

`specs/web/support/workspace.ts` holds the one helper that reaches into Monaco, and three properties
of it are deliberate — inherited from the Phase B test it replaced, for the same reasons:

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

**What the browser now proves that it could not before.** In Phase B, `@monaco-editor/react` only
pushes the controlled value into the model when that value changes, so a `CodeEditor` that never
forwarded a change would have left Monaco behaving as an uncontrolled editor and every browser
assertion would still have passed. **C3 closed that gap without a test hook**: the save status is
application state rendered outside the editor and derived from the draft, so a keystroke that never
reached React would leave the status on `Saved`, and the assertion that it became `Unsaved changes`
would fail. The save-and-reload assertion closes it a second time, from the database's side.

That is a real gain rather than a rewording, and it is why the mutation-tested caveat that used to
sit here has been removed: the direction is now observable in a real browser, and the component
suites cover it as well.

#### Serial, and why

`fullyParallel` is off and `workers` is `1`. The browser tests write — they create projects and files
through the real interface, against one schema in one database — so running them concurrently would
make the project list a shared mutable fixture, and a suite whose assertions depend on what another
test happened to have created is flaky by construction. Per-worker isolation is not worth building
for a suite this size; when it is, that is the setting that changes.

Every test still names its project uniquely and deletes it in a `finally`, through the API rather
than the interface — a cleanup step that drove the UI would fail for the same reason the test did.
The suite therefore leaves the disposable database as it found it, and `tools/run-e2e.mjs` resets it
before the next run regardless.

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

**C3 was the change most likely to break that**, because it made `apps/web` depend on a package that
builds. What kept it true is one alias, described in
[the section below](#how-the-fast-suites-run-with-nothing-built).

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

### How the fast suites run with nothing built

`apps/api` depends on two workspace packages that are compiled for production, and **from C3
`apps/web` depends on one of them**. If either fast suite loaded them from `dist`, `pnpm test` would
have to run `prisma generate` and two `tsc` invocations before its first assertion — which is exactly
the promise this document makes and the reason the dependency was removed.

So both fast suites read the TypeScript instead. `apps/api/jest.config.mjs` maps the two package
specifiers:

```js
moduleNameMapper: {
  '^@devsync/shared$':   '<rootDir>/../../packages/shared/src/index.ts',
  '^@devsync/database$': '<rootDir>/../../packages/database/src/contracts.ts',
}
```

and `apps/api/tsconfig.test.json` carries the matching `paths`, so ts-jest **type-checks** against
the same sources it loads. `apps/web/vitest.config.mts` does the same thing for the one package it
consumes, beside the `@/` alias it already restated:

```ts
'@devsync/shared': fileURLToPath(new URL('../../packages/shared/src/index.ts', import.meta.url)),
```

Four properties of that arrangement are deliberate:

- **They are the real modules.** The same Zod schemas the API validates every request against, and
  the same `PersistenceError` class it throws. Nothing is copied, mocked, or re-declared.
- **The bare specifier is mapped, not individual files.** If production code resolved
  `PersistenceError` from `dist` while a test constructed one from source, they would be two
  different classes and every `instanceof` check would quietly stop matching.
- **`@devsync/database` maps to `contracts.ts`, not `index.ts`.** Only `contracts.ts` is free of the
  generated Prisma Client — it holds the records, the operation interfaces, `Database`, and
  `PersistenceError`, and imports nothing from Prisma. A fast test that reached for `createDatabase`
  would fail to resolve, which is the right answer: opening a connection belongs to `pnpm test:db`.
- **Production is untouched.** `pnpm build`, `node apps/api/dist/main.js`, `next build`, `next start`,
  and both container images resolve `@devsync/shared` and `@devsync/database` through their `exports`
  maps to `dist/index.js`, exactly as before — the aliases exist only in the two test configurations.
  `jest.db.config.mjs` carries no mapping at all, because proving the compiled packages work is the
  only thing that suite is for.

`apps/web`'s Vitest configuration also sets `NEXT_PUBLIC_API_URL` in `test.env`, so the component
suites configure the value the application refuses to start without rather than inheriting whatever a
developer's `.env` happens to say — which is what lets `pnpm test` pass on a machine with no `.env`
at all.

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

`pnpm test:e2e` runs `tests/e2e/tools/run-e2e.mjs`, which does two things before Turborepo is
invoked at all, and then hands over.

- **It resets the disposable database** through `@devsync/database/test-database`, the same safety
  gate the database suites use. It has to happen here rather than in a Playwright `globalSetup`,
  because Playwright starts its `webServer` processes **before** a global setup runs — a reset there
  would drop the schema out from under an API that had already connected to it.
- **It sets `NEXT_PUBLIC_API_URL=http://127.0.0.1:4311`.** That value is embedded by `next build`, so
  it has to be in the environment before Turborepo builds `apps/web`, not when Playwright starts.
  Setting it there is also what makes it part of the `build` task's environment hash, so a build made
  for port 3001 cannot be replayed from the cache for a suite running on 4311. It is a Node process
  rather than a `VAR=value command` prefix because pnpm runs scripts through `cmd.exe` on Windows,
  where that is not syntax.

`playwright.config.ts` then declares two `webServer` entries, and Playwright starts both before the
first test and shuts both down afterwards.

```text
apps/web   pnpm exec next start --port 4310    ready when GET http://127.0.0.1:4310/ answers
apps/api   node dist/main.js  (API_PORT=4311)  ready when GET http://127.0.0.1:4311/health answers
           DATABASE_URL=<the disposable database>, WEB_ORIGIN=http://127.0.0.1:4310
```

**The config refuses to run when the web build points somewhere else.** It compares
`NEXT_PUBLIC_API_URL` with the API base URL it is about to start and throws with an instruction to
use `pnpm test:e2e` — so a build made for another port is a loud failure at the first line of the
run rather than a suite quietly driving a client that calls a server nobody started. That is also
what makes `pnpm --filter @devsync/e2e test:e2e` safe to leave documented: it fails immediately
rather than misleading.

Five properties of that setup are load-bearing:

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
  50 ms between keystrokes in the Monaco helper, which paces input like a person rather than
  waiting for anything.
- **`reuseExistingServer` is off.** A server already listening on a test port is an error, not
  an accidental test subject. The suite can never pass by talking to something a developer
  started by hand.
- **The API under test is configured explicitly, not inherited.** `API_PORT`, `DATABASE_URL`, and
  `WEB_ORIGIN` are passed through the `webServer` environment and the web port through a command-line
  argument. `apps/api` does load `.env`, and that is exactly why: inheriting it would point the API
  under test at the development database and have it answer a browser on port 3000, neither of which
  is what this suite is.
- **One worker, in order.** See [Serial, and why](#serial-and-why) above.

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

**No coverage figure is currently published here.** The last measured numbers described a repository
before C1's configuration code, C2's routes, and C3's entire client existed, so they were deleted at
C3 rather than left to be read as current. Re-measuring is a one-command exercise —
`pnpm test:coverage` — and a number quoted in a document is stale the moment the next milestone
lands, which is what the previous entry demonstrated.

What has not changed is which files a coverage report cannot speak for, and each is worth knowing
before reading one:

- `apps/web/src/app/layout.tsx` is at 0% because Vitest cannot import it at all — `next/font/google`
  only resolves inside the Next.js compiler. It is covered in substance by the Playwright title
  assertion, which no coverage tool attributes back to it.
- `apps/web/src/editor/code-editor.tsx` is short of 100% by exactly the worker factories, and the
  entry points in `src/editor/workers/` are at 0% for the same reason: jsdom has no web workers, so
  the functions that construct them are never called and the modules they point at are never loaded.
  They run in Chromium, under Playwright, where nothing attributes them back either.
- `apps/api/src/app.module.ts` is at 0% because the Jest tests boot individual modules directly. The
  PostgreSQL-backed suite and the Playwright suite boot the real `AppModule`, again without being
  attributed.
- `apps/api/src/main.ts` is excluded from measurement rather than reported at 0%. It calls
  `app.listen`, so importing it from an in-process test would bind a port as a side effect of
  measuring it. Playwright runs it for real instead.

**No coverage thresholds are configured, deliberately.** A threshold invites tests written to satisfy
a number, and the useful version of it is set from what real application logic actually achieves.
C3 is the first milestone with a body of client logic worth measuring; introducing a threshold is a
decision for the phase closure, not something to bolt on with the code.

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
`tools/test-database.mjs` because the API's integration suite and the end-to-end runner prepare the
same database and must not carry a second copy of the rules.

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

### C4 — restarts

The milestone that proves persistence against the failures C3 did not exercise: an API restart, a
PostgreSQL container restart, the committed migration applying to a database that already holds rows
without losing any, and a database that is temporarily unavailable producing a controlled `503`
instead of a stack trace. **The browser reload, and closing and reopening a project, are C3's** and
are covered above.

### The task the database suites run under

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
`webServer` step. **C3 changed how that database is prepared**, because from C3 the browser writes to
it: `tools/run-e2e.mjs` calls `prepareTestDatabase({ reset: true })` — the same helper and the same
safety gate the database suites use — before Turborepo builds anything, so every run starts from an
empty schema with the committed migration applied. `playwright.config.ts` then passes that database
to the API it starts.

That replaced the `@devsync/database#migrate:test` dependency the `test:e2e` task used to carry. The
task is still defined so a developer can migrate the disposable database by hand, but nothing depends
on it: a migration that did not also reset would leave the previous run's projects in the list this
suite now reads.

The suite uses the disposable test database and never the development one. `reuseExistingServer`
stays `false` for both applications. PostgreSQL is the one process the suite does not start for
itself — Compose runs it, which is a documented prerequisite rather than a hidden one, and a suite
that started its own database could pass while the Compose file was wrong.

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

- **Nothing proves the data survives a restart.** The browser suite proves a reload, which is a new
  page against the same running processes. An API restart, a PostgreSQL restart, and the committed
  migration applied over existing rows are **C4's**, and no document may describe them as proved.
- **The `503` and `500` persistence paths are proved by injection, not by a real outage.** The
  mapping is exercised against a data layer told to fail; a database that genuinely goes away under
  a running API is C4's test, and doing it inside the integration run would take the rest of the run
  with it.
- **The database suite needs a PostgreSQL somebody else started.** `docker compose up -d database`
  is a prerequisite rather than something the suite arranges, which is a deliberate trade: a suite
  that starts its own database could pass while the Compose file was wrong.
- **Machine-speed edits lose characters.** The controlled value is rewritten into the model whenever
  it disagrees with it, so edits arriving faster than React commits are overwritten by a stale
  value. Human-paced typing and paste were both verified unaffected at Phase B closure, so no user
  interaction today is exposed — but Phase E applies remote CRDT operations programmatically, and
  that is where the model-ownership design has to be answered.
- **No test asserts how Monaco highlights a language.** The suites prove that the selected language
  reaches Monaco and that the content survives the change; tokenisation is Monaco's, and asserting
  it here would test Microsoft's code through DevSync's.
- **Monaco's own behaviour is not tested and should not be.** Undo, selection, multi-cursor,
  suggestions, search, copy-paste, tokenisation, the language service, and the worker protocol are
  Microsoft's to cover. The browser suite asserts one line typed through one integration boundary,
  which is the part DevSync owns.
- **Concurrent editing, authentication, reconnection, and code execution are untested**, because
  none of them are implemented. Two browsers editing the same project is undefined behaviour, and
  no test asserts anything about it.
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
| `@devsync/web`           | Vitest     | 151        | jsdom                 | yes             |
| `@devsync/api`           | Jest       | 75         | node                  | yes             |
| `@devsync/api`           | Jest       | 110        | node, real PostgreSQL | no — `test:db`  |
| `@devsync/database`      | Vitest     | 57         | node, real PostgreSQL | no — `test:db`  |
| `@devsync/e2e`           | Playwright | 14         | Chromium and HTTP     | no — `test:e2e` |
| `@devsync/collaboration` | none       | 0          | —                     | —               |
| `@devsync/ui`            | none       | 0          | —                     | —               |
| `@devsync/test-utils`    | none       | 0          | —                     | —               |
| `@devsync/config`        | none       | 0          | —                     | —               |

**Five hundred and seven real tests in total**, of which **326 run in `pnpm test`**, **167 in
`pnpm test:db`** — 57 in the data layer, 110 in the API — and 14 in `pnpm test:e2e`. Of the 167, 149
genuinely reach PostgreSQL; the other 18 are the safety gate, which connects to nothing and lives
there because it is database tooling.

`apps/web`'s 151 break down as 8 for the home page, 38 for the API client and its configuration, 26
for the language metadata and the draft model, 16 for the project list, 52 for the workspace, and 11
for the Monaco wrapper. `apps/api`'s 75 are 28 for configuration and lifecycle, 17 for the HTTP
application and its CORS policy, 13 for the error boundary, 8 for the pipes, 8 for the mappers, and 1
for health.

The four workspaces without a runner print that they have no tests and exit successfully — as does
`@devsync/database` under `pnpm test`, where it says its tests need PostgreSQL and names the command
that runs them. That is the correct behaviour for a workspace with no implementation: a test runner
installed into an empty package, or a test asserting that `true` is `true`, would make the table
above look uniform while proving strictly less than the sentence it prints.
