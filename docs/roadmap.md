# Roadmap

The milestone sequence DevSync is being built in, and the current position within it.

**Phases A, B, and C are complete. Phase D is next.** C0 settled how persistence would be shaped;
C1 built the storage half; C2 put an HTTP surface on it; C3 connected the browser to it; **C4 turned
restart survival into an automated, repeatable proof through the public API**; C5 reconciled the
phase and closed it. PostgreSQL,
Prisma, the schema, the committed migration, the data layer, ten project and file routes, the
contracts in `@devsync/shared`, a web application that creates, opens, edits, saves, and deletes
projects and files through them, and an automated Docker-level validation of restart, outage,
recovery, and migration redeployment all exist. Everything from Phase D onward is a plan. A phase is
described here so that the order and the boundaries are decided in advance, not so that it can be
mistaken for progress.

No dates or durations appear in this document, deliberately. A phase is done when its completion
boundary is met, and estimating that in advance would produce a number that gets quoted long
after it stopped being true.

## Position

| Phase | Name                      | Status       |
| ----- | ------------------------- | ------------ |
| **A** | Project foundation        | **Complete** |
| **B** | Local editor              | **Complete** |
| **C** | Database-backed projects  | **Complete** |
| D     | Rooms and presence        | **Next**     |
| E     | Single-file collaboration | Not started  |
| F     | Multi-file collaboration  | Not started  |
| G     | Persistence and recovery  | Not started  |
| H     | Authentication and RBAC   | Not started  |
| I     | Reliability               | Not started  |
| J     | Collaboration tools       | Not started  |
| K     | Version history           | Not started  |
| L     | Secure code execution     | Not started  |
| M     | Production hardening      | Not started  |
| N     | Portfolio closure         | Not started  |

**The product is a persistent single-user workspace.** Phase B's Monaco editor is still the editing
surface, and C3 put a database-backed project and file model around it: a project list, a project
workspace, an explicit save, and work that survives a reload. **C4 added no product behaviour and
proved what was already there**: the work also survives an API restart, a PostgreSQL restart, and a
redeployment of the committed migration. **C5 added none either** — it audited the phase, corrected
what the audit found, and rewrote the documentation from plan to record. Nothing else in the table
above is built — no accounts, no collaboration, no presence, no history, and no execution.

---

## Phase A — project foundation ✅ Complete

**Goal.** A monorepo that can hold a collaborative editor: strict types, one place for every
rule, real tests at every layer, reproducible container builds, and automated validation — before
any product code is written and therefore before any of it is expensive to change.

**Delivered**

| Milestone | Delivered                                                                               |
| --------- | --------------------------------------------------------------------------------------- |
| A0        | pnpm workspace, Turborepo task graph, nine workspaces, `apps/web` and `apps/api`        |
| A1        | Strict TypeScript and flat ESLint centralised in `@devsync/config`; one Prettier config |
| A2        | Three testing layers — Vitest, Jest, Playwright — and eight real tests                  |
| A3        | A multi-stage production image per application, and a root `compose.yaml`               |
| A4        | One GitHub Actions workflow with independent quality, end-to-end, and Docker jobs       |
| A5        | Architecture, roadmap, development, and decision documentation                          |

**Completion boundary.** `pnpm install --frozen-lockfile`, `format:check`, `lint`, `typecheck`,
`test`, `test:e2e`, and `build` all pass; `docker compose config` validates and both images build,
start, and serve; every document describes the repository as it actually is. Met.

**Deliberately excluded.** Everything product-shaped: no editor, no database, no authentication,
no real-time transport, no execution. Phase A ships two applications serving one route each.

---

## Phase B — local editor ✅ Complete

**Goal.** A real code editor in the browser, with no server involvement at all — the first
product-shaped thing DevSync does.

**Major deliverables**

| Milestone | Deliverable                                                                  | Status        |
| --------- | ---------------------------------------------------------------------------- | ------------- |
| B0        | Monaco integrated into `apps/web`, surviving the App Router, SSR, and Docker | **Delivered** |
| B1        | The in-memory editing workspace the editor's content belongs to              | **Delivered** |
| B2        | A language selection over the open file                                      | **Delivered** |
| B3        | A Playwright test that types into the real Monaco editor                     | **Delivered** |
| B4        | Phase reconciliation, hardening, and closure                                 | **Delivered** |

**B0, delivered.** The home page renders one Monaco editor, with syntax highlighting and Monaco's
language services running in web workers. Monaco is bundled from the `monaco-editor` package rather
than fetched from a CDN, so the production image depends on no external host. The wrapper is
covered by component tests against a mocked Monaco boundary, and the Playwright suite asserts the
editor region reaches a real browser.

**B1, delivered.** A client workspace component owns the open file's contents in React state and
hands them to the editor, which is now controlled rather than left to manage a model nothing else
can read. Edits flow back through a callback; a change Monaco reports without a value is dropped
rather than allowed to blank the file, while an emptied file is kept, because empty is valid
content. The workspace names its one file `main.ts` — a fixed identity, not a file system. State is
browser memory only: **nothing is stored, sent, or synchronised**, and remounting or reloading
starts again from the sample. There is still no persistence, no file tree, no tabs, no save action,
and no server involvement.

**B2, delivered.** The workspace also owns the language its one file is read as, and a labelled
native `<select>` beside the file name changes it. Five languages are offered — TypeScript,
JavaScript, Python, JSON, and Markdown — each with the name the file is shown under while it is
being read that way: `main.ts`, `main.js`, `main.py`, `data.json`, `README.md`. **That is one file
under five readings, not five files.** Changing the language re-interprets the text that is already
in the buffer: the content is untouched, so nothing is reset, translated, or replaced, and no
starter template exists for any of them. The language is never inferred from a file name and never
detected from the content. Like the content, it is browser memory only — a reload starts again from
TypeScript and the sample.

**B3, delivered.** A Playwright test drives the real Monaco editor in Chromium against the
production build: it clicks the rendered code surface, selects the buffer, types a single unique
line, and asserts the line appears. It then changes the language and asserts the typed line is
still there rather than replaced by the sample — which catches a workspace that hands the editor
stale content on a rerender — and finally reloads and asserts the sample is back and the typed line
is gone. One line and no `Enter`, because Monaco's suggestion widget captures it. What the test
cannot see is recorded below.

**B4, delivered.** The closure pass. It reconciled what the tests claim with what they prove —
B3's browser test was renamed and its comments corrected, because mutation testing had shown it
cannot observe Monaco's `onChange` reaching React state and it had said otherwise. It audited the
implementation and the architecture boundaries: no API edge, no persistence, reserved packages
still empty, two runtime dependencies added across the whole phase. It corrected the stale
milestone number in the home page's own copy. It confirmed every document against the code, reran
the full validation suite including a Docker runtime verification, and closed the phase.

**Completion boundary.** A visitor can open the application, type code, and see it highlighted.
Nothing is saved, nothing is shared, and a refresh discards the content — and the interface says
so. **Met.**

**A testing boundary, recorded rather than left implied.** The browser test proves a real keystroke
reaches the real Monaco editor, survives a language change, and is discarded by a reload. It does
not independently prove that Monaco's change callback reaches React state: `@monaco-editor/react`
pushes the controlled value into the model only when that value changes, so an integration whose
callback never fired would still pass every browser assertion. That direction is proved
compositionally by the component suites — `code-editor.test.tsx` for the callback, and the workspace
suite for the state it lands in. (`local-editor-workspace.test.tsx` was that suite until C3 replaced
the local workspace; `project-workspace.test.tsx` is now.) This is test layering, not missing
product behaviour; the editor works, and [`testing.md`](testing.md) is the full account.

**Exclusions and dependencies.** No persistence, no collaboration, no CRDT, no WebSocket, no
file tree, no account. This phase deliberately writes no server code: it establishes that the
editor works before anything else depends on it.

---

## Phase C — database-backed projects ✅ Complete

**Goal.** Projects and files that survive a restart, owned by the API and reached through one
data-access package. **Phase C is single-user**: it gives DevSync something worth collaborating on
before any collaboration exists.

**Milestones**

| Milestone | Deliverable                                        | Status        |
| --------- | -------------------------------------------------- | ------------- |
| C0        | Persistence architecture and project data contract | **Delivered** |
| C1        | PostgreSQL and Prisma data layer                   | **Delivered** |
| C2        | Project and file API                               | **Delivered** |
| C3        | Persistent web workspace                           | **Delivered** |
| C4        | Persistence and restart validation                 | **Delivered** |
| C5        | Phase closure                                      | **Delivered** |

**What the phase had to add up to.** By C5, one person can create a project, list their projects,
open one, rename it, and delete it; create files in it, list and open them, edit a file's contents,
rename it, change the language it is read as, and delete it; reload the browser and find all of it
unchanged; and restart both the API and PostgreSQL and still find it unchanged. **All of that
holds** — C3 delivered the browser half, C4 proved the restart half, and C5 audited both.

**Excluded from the whole phase**, and not to be prepared for with a spare column or a placeholder
contract: users, owners, authentication, memberships, invitations, roles, authorization, slugs,
project visibility, archival, soft deletion, folders, paths, file trees, collaboration, presence,
WebSockets, Yjs, CRDT behaviour, remote cursors, version history, chat, code execution, Redis, and
horizontal scaling. Editor tabs are excluded too, unless C3 finds it cannot open a second file
without them.

**Dependencies.** Depends on B for something worth persisting. Ownership is not enforced because
there is nobody to enforce it against — that is Phase H, and it is the phase that adds the columns
this one leaves out.

The design C0 settled is in
[`architecture.md`](architecture.md#phase-c--the-persistence-architecture); the choices behind
it, and what would justify revisiting each, are in [`decisions.md`](decisions.md).

### C0 — persistence architecture and project data contract ✅ Delivered

**Delivered.** Documentation only, and deliberately so: the shape of the data, the HTTP surface,
the error boundary, and the package ownership are cheaper to argue about before a migration exists
than after one has run. C0 fixed the `Project` and `ProjectFile` models and their validation rules,
the nested REST resources and their status codes, the one error shape every route answers with, the
dependency direction between `apps/web`, `apps/api`, `@devsync/shared`, and `@devsync/database`, the
Prisma and migration policy, the planned environment variables, the planned Compose topology, and
the database-testing ladder. It also fixed the Phase C exclusions above, so that later milestones
have something to be measured against.

**Completion boundary.** The architecture, decision, testing, Docker, and development documents
describe Phase C's design as planned, agree with one another, and add no runtime artefact:
dependencies, lockfile, application source, package source, tests, CI, Compose, and both
Dockerfiles are untouched, and every existing check still passes. **Met.**

**Excluded.** Everything that runs. No Prisma, no PostgreSQL, no Zod, no schema, no migration, no
`DATABASE_URL`, no configuration module, no controller, no repository, no DTO, and no call from
`apps/web` to `apps/api`.

### C1 — PostgreSQL and Prisma data layer ✅ Delivered

**Delivered.** PostgreSQL 18 is in `compose.yaml` — the first service there that is not an
application — with a named volume, a `pg_isready` health check, and a one-shot `migrate` service
the API waits on. Prisma 7 lives in `@devsync/database`: the schema, one committed migration, the
generated client, the pool, and every query. The package exposes named operations over projects and
files, creates a project and its first file in one transaction, moves a project's `updatedAt` when
one of its files changes, and classifies persistence failures into four meanings so that no Prisma
error can escape it.

**`apps/api` took its first dependency on `@devsync/database`.** The API owns configuration —
`DATABASE_URL` is required and validated before the application exists — and asks the package to
connect during startup and disconnect during shutdown through Nest's lifecycle hooks. An unreachable
database is a failed startup, not a service that accepts requests it cannot serve. The production
image carries the compiled package and its generated client, and none of the Prisma CLI.

Two decisions were forced by the repository rather than chosen freely, and both are recorded in
[`decisions.md`](decisions.md): `@devsync/database` emits **CommonJS**, because the Nest service and
its ts-jest suite cannot load an ES module; and Compose publishes PostgreSQL on **5433**, because
5432 belongs to whatever a developer already has installed.

**Completion boundary.** The API process starts, connects, serves, and shuts down cleanly; a record
written through the package survives a disconnect and reconnect, an API restart, and a PostgreSQL
restart; the committed migration applies to an empty database; and the integration suite refuses to
run against a database it has not been told is disposable. **Met.**

**What that restart evidence was, and what it was not.** C1's boundary is about the data layer's
connection lifecycle, and that is the layer it was met at: `packages/database`'s automated lifecycle
suite keeps a record across a client disconnect and reconnect, classifies a query against an
unreachable database as unavailable, and lets no raw driver error out of the package — and the API
and PostgreSQL restarts were checked by hand, against the development stack, by a developer watching
the result. That evidence is real and it still stands. What it is not is repeatable: nothing recorded
a fixture, nothing compared it field by field, and nothing ran in CI. **C4 is the layer above it** —
an automated Docker-level run through the public HTTP routes, described in its own section below.

**Excluded at C1 closure.** When C1 finished there was no project or file HTTP route, controller, or
DTO, `@devsync/shared` exported nothing, and the API held a connection that nothing it served read
or wrote a project through. **C2 delivered all of that**, and the section below records it.
`apps/web` was left unchanged by C1 and remained unchanged through C2; the browser reaches none of
this until C3.

### C2 — project and file API ✅ Delivered

**Delivered.** Ten routes in `apps/api` — five over projects, five over the files nested inside
them — with the starter-file policy applied at creation, request validation at every entry point,
and persistence failures mapped to the status codes and error codes C0 settled. A project created
through `POST /projects` comes back with its `main.ts` already in it, written in the same
transaction. Editing a file moves its project to the front of the listing, because the data layer
moves the project's `updatedAt` in the transaction that changed the file.

**`@devsync/shared` started exporting.** Zod 4 lives there, and with it the five supported language
identifiers and their validator, the four request schemas, the resource and listing schemas, the
identifier schemas, the error contract, and the TypeScript type inferred from each. It became a
built CommonJS package for the same reason `@devsync/database` did in C1: `apps/api` runs it in a
container with no compiler and loads it through a CommonJS registry. **`apps/api` is its only
consumer**; `apps/web` becomes the second in C3.

**One error shape, from every route.** An API-owned error type carries the status, the stable code,
the message, and optional field-level issues; one global exception filter writes it. A malformed
identifier is `400 INVALID_IDENTIFIER` rather than a lookup that happens to miss, an unreadable or
oversized body is `400 VALIDATION_FAILED` rather than Express's `413`, and nothing in a response
contains SQL, a Prisma code, a table name, a connection string, or a stack. The JSON body limit is
**1 MiB** — the number C0 deliberately left for the milestone that could test it.

**Completion boundary.** Every route in the C0 contract behaves as documented, including the
failures: an invalid UUID, an unsupported language, an empty patch, a duplicate file name within a
project, a file addressed through the wrong project, and a project that does not exist. A file
mutation moves its project's `updatedAt`, so the project list orders by real recent work. **Met**,
and held at closure by 110 integration tests against a real Nest application and a real PostgreSQL,
plus 100 schema tests and the 46 fast API tests that existed then. (C3 added CORS coverage to that
fast suite; [`testing.md`](testing.md) carries the current counts.)

**Excluded at C2 closure, and delivered by C3.** When C2 finished, `apps/web` consumed nothing from
`@devsync/shared`, made no request to `apps/api`, and could not save or load anything, and no CORS
configuration existed. **C3 delivered all of that**, and the section below records it. What C2's
exclusions still hold is authentication: every request is anonymous, and the API is published on a
local host port, so anything that can reach that port can read and delete everything in it. That is
acceptable only inside Phase C's local single-user development boundary, and it is why **nothing in
Phase C may be deployed publicly**. Phase H is what makes it safe.

### C3 — persistent web workspace ✅ Delivered

**Delivered.** The first call `apps/web` has ever made to `apps/api`, and with it the first
web-to-API runtime dependency, the Compose `depends_on` edge from `web` to `api`, and the first
reason for CORS to exist. Two routes: `/` lists projects and creates, opens, renames, and deletes
them; `/projects/[projectId]` opens one project, its files, and one file in Monaco. Files are
created, opened, renamed, retyped, edited, and deleted, and deleting the last one is allowed.
Phase B's `LocalEditorWorkspace` is gone — there are not two competing workspaces.

**`apps/web` became the second consumer of `@devsync/shared`.** It reads the resource and request
contracts, the error contract and its stable codes, the language identifiers, and `parseContract`,
and it declares no Zod dependency of its own. The duplicated identifier list in
`apps/web/src/editor/languages.ts` is gone: the file now builds its options from
`SUPPORTED_LANGUAGE_IDS` and adds only the labels a user reads. **The derived file name is gone
too** — a file has a stored name, and renaming it and changing its language are independent.

**Saving is explicit, and the interface says what has reached the server.** A persisted snapshot and
a browser draft are kept apart; Save is disabled until they differ, sends only the properties that
changed, and takes the server's answer as the new authority. Saved, unsaved changes, saving, and
failed are shown in a live region, a failed save keeps the draft, and nothing is discarded — by
switching file, deleting, or leaving — without a deliberate confirmation. **There is no autosave and
no browser storage.**

**Two configuration values arrived**, one per side of the boundary. `NEXT_PUBLIC_API_URL` is
validated once in `apps/web` and embedded by `next build`; `WEB_ORIGIN` is validated in `apps/api`'s
configuration and is the one origin CORS allows — no wildcard, no credentials, and no allow-origin
header for anything else. Both are recorded in [`decisions.md`](decisions.md) as
[D28](decisions.md#d28--the-browser-api-url-is-a-build-time-public-variable) and
[D29](decisions.md#d29--cors-allows-exactly-one-configured-origin).

**Completion boundary.** A person opens the application, creates a project, edits a file, reloads
the page, and finds their work exactly as they left it. **Met**, and held by 14 Playwright tests
against a real web build, a real API, and a disposable PostgreSQL, plus 151 component and client
tests in `apps/web` and 17 CORS tests in the API's fast suite.

**Excluded, and still absent at C3's close.** No collaboration and no presence — a second browser
sees the same data only by reloading, and two people editing the same file at once is undefined
behaviour until Phase E. No tabs, no file tree, no autosave, no browser storage, no pagination, and
no search. And, at the time C3 closed, **no automated full-stack restart proof** — none through the
public API, in the production Compose topology, comparing a recorded fixture. C1 had already met its
own, narrower boundary at the data-access layer, and had it by hand for the containers; what C3
itself proves is a browser reload. The repeatable API restart, PostgreSQL outage and recovery, and
migration over existing rows were C4's, and the section below records that they now hold.

### C4 — persistence and restart validation ✅ Delivered

**Delivered.** One command, `pnpm test:restart`, and a workspace behind it — `tests/restart`
(`@devsync/restart`). It brings the real production images up in a Compose project of its own,
creates a project and two files **through the public HTTP routes**, records every field of every
resource, and then puts that fixture through four failures, comparing it exactly after each:

- **An API restart.** The container is stopped, confirmed stopped, and started again; the container's
  PID is asserted to have changed, so the scenario cannot pass against a process that never went away.
- **A PostgreSQL outage, with the API left running.** `GET /projects/:projectId` answers
  `503 DATABASE_UNAVAILABLE` within a bounded timeout, twice, with a body carrying exactly
  `statusCode`, `code`, and `message` — no stack, no SQL, no ORM name, no driver error code, no table
  name, no connection string. `GET /health` still answers, and the API's PID is unchanged.
- **PostgreSQL coming back, without restarting the API.** The persistence route is polled until it
  succeeds, and the PID is asserted to be the same one throughout: what recovers is the same process
  and the same connection pool.
- **The committed migration, redeployed over populated rows** through `docker compose run --rm
migrate` — the real one-shot service, against the same volume. It exits 0 and the fixture is
  identical afterwards, timestamps included.

**What this adds to C1, which had a restart boundary of its own.** C1 proved the data layer's
connection lifecycle — a record kept across a client disconnect and reconnect, an unreachable
database classified rather than leaked — with an automated suite, and it confirmed the container
restarts by hand. C4 raises every part of that by a level and makes it repeatable. It goes through
the **public HTTP routes** rather than the package's API, in the **production Compose topology**
rather than against a host PostgreSQL, restarting **real containers** rather than reconnecting a
client. It records a fixture and compares **every field of every resource** after each failure
instead of asserting that a lookup still finds something. It adds two cases C1 never had — the
controlled outage contract, and the committed migration redeployed over populated rows — and it runs
in CI, so the property is checked on every change rather than the day somebody looked. Neither
supersedes the other: C1's suite still runs under `pnpm test:db`, and it is what catches a
regression inside `@devsync/database` that a container-level run would only see as a failed request.

**No production code needed correcting.** The scenarios were run against the C3 implementation as it
stood, and every one of them already held. C4 is validation infrastructure and documentation; the
only non-documentation change outside `tests/restart` is that `compose.yaml`'s three published host
ports became variables with their existing values as defaults, so a second copy of the stack can run
beside a developer's own.

**Isolation is enforced in code.** Everything happens in the `devsync-c4-validation` Compose project,
on ports 4321, 5434, and 4320, with its own network and its own disposable volume. The runner refuses
to issue a Compose command against any other project, refuses to delete a volume Docker does not
label as this project's, and proves afterwards that the `devsync` project's volumes are exactly as it
found them. Every wait is a named condition with a deadline; there is no fixed sleep anywhere in it.

**Completion boundary.** Every one of the four cases is covered by an automated, repeatable run, and
none of them loses a record. **Met**, and held by that run plus 58 Vitest tests over the harness's own
guards, redaction, bounded waiting, and comparison.

**Excluded.** No backup and restore tooling, no load testing, and no failover — those are Phase M.
C4 adds no retry, no circuit breaker, no queue, no schema change, and no second migration.

### C5 — phase closure ✅ Delivered

**Delivered.** The reconciliation pass: the implementation audited against the C0 contract, the
drift the audit found corrected, the documentation rewritten from plan to record, and the full
validation ladder rerun from a clean tree.

**The C0 contract holds.** Every field, rule, route, status code, error code, ownership boundary,
and exclusion C0 settled is implemented as C0 described it. No row of that contract turned out to
be missing or contradicted, so **no schema change and no second migration was needed** — the one
committed migration is still the only one. `Project` and `ProjectFile` carry exactly the columns
C0 named; identifiers are database-generated UUIDs; file names are unique per project under the
`C` collation; `Project.updatedAt` moves in the transaction that changes a file; a project is
created with its `main.ts` atomically and may later hold none; deletion is permanent and cascades.

**Four defects were found and corrected, none of them in product behaviour.**

- **The two Dockerfiles had not been told about C4's workspace.** Both enumerate every workspace
  manifest before a frozen install, but neither copied `tests/restart/package.json`, added in C4.
  The install had been quietly resolving 10 workspace projects where the host has 11. Both now copy
  it, and both images report the same count as the repository — and copying a manifest installs
  nothing, so neither image gained anything from that workspace.

  **The comments in both files had also been wrong about why it mattered**, and correcting them was
  half the fix: each claimed a missing manifest fails the install. It does not. The images had built
  cleanly for the whole of C4 with the workspace absent and said nothing about it, which is exactly
  what made the omission survive four milestones. Both now record that the rule is kept by hand.

- **[`ci.md`](ci.md) described action pins that do not exist.** It said every official action was
  pinned to one and the same major, the one `actions/upload-artifact` is on — but neither
  `actions/checkout` nor `actions/setup-node` has ever published a major that high, and `main`'s
  workflow asked each of them for it anyway. Phase C had already corrected the workflow to each
  action's real current major and left the document behind. **The workflow was right and the prose
  was wrong**, so the prose was corrected to the actual inventory — `actions/checkout` and
  `actions/setup-node` at `@v6`, `actions/upload-artifact` at `@v7` — with a note that the three
  repositories release independently and are not meant to match. No workflow line changed.
- **`// @ts-check` was decorative on four runtime `.mjs` files.** `tests/restart` had solved this
  for its own harness in C4 and recorded exactly why; the same shape existed in four earlier files
  and none of them was in the TypeScript program. `packages/database/tools/test-database.mjs` — the
  gate that decides whether a schema may be dropped — and `packages/config/vitest/base.mjs` were
  each shadowed by the `.d.mts` beside them, and `apps/api/tests/global-setup.mjs` and
  `tests/e2e/tools/run-e2e.mjs` sat in workspaces whose compiler never reads JavaScript at all. All
  four are now in `pnpm typecheck`, and all four pass. The emitted output of both builds is
  byte-for-byte what it was.
- **A Vitest workspace was disappearing from `pnpm test:unit`.** `packages/database` runs Vitest but
  declared no `test:unit`, so Turborepo resolved the task to nothing and said nothing — the precise
  failure the rule in [`testing.md`](testing.md) exists to prevent. It now declares one, and since
  the fix below it runs a real suite rather than printing a notice.

**One defect was first exposed after closure by the pull-request CI run, and it took two attempts to
fix.** C4's container-level outage scenario failed on a GitHub Actions rerun: the first request
during the outage answered `500` where the contract says `503`. It was a genuine
persistence-classification gap, not a flaky harness, and **that scenario is the layer that caught
it**; what no lower-level suite had was a deterministic regression for how a driver failure is
classified.

The first fix handled a real shape — PostgreSQL reporting SQLSTATE `57P01` under a live pool, which
`@prisma/adapter-pg` publishes under `meta.driverAdapterError.cause` — and CI failed again, because
that was not the shape it was hitting. The adapter converts only four socket codes and rethrows
every other system error untouched; Prisma turns any error carrying a string `code` into a known
request error **whose code is that operating-system code and whose metadata holds nothing but the
model name**. On a Linux runner, resolving a stopped container's service name fails with
`EAI_AGAIN`, so there was no metadata anywhere to search. Both shapes were captured from the
production image and the CI one reproduced deterministically, and the classifier now reads the
**whole exception** over four closed allowlists — Prisma codes, SQLSTATEs, adapter kinds, and
transport codes — with `packages/database` holding 83 pure tests that run in `pnpm test`.
`PersistenceError` also gained a logged-only `diagnostic` naming which rule decided, because the
defect was invisible from a log. **No route, response schema, schema, migration, or retry behaviour
changed.**

**Completion boundary.** Every document describes the persistence that exists, every exclusion above
is still absent, and the phase's completion boundary is met. **Met.**

**Excluded.** C5 added no product behaviour, no route, no column, no migration, no dependency, and
nothing from Phase D or later. It removed nothing that worked.

---

## Phase D — rooms and presence ⬅ Next

**Goal.** A real-time transport and the ability to see who else is in a project, without yet
sharing document content.

**Major deliverables**

- A WebSocket gateway in `apps/api`, with a documented connection lifecycle.
- Room join and leave semantics keyed on a project.
- Ephemeral presence state — who is connected, to what — held in memory, never persisted.
- The protocol's message types defined in `@devsync/shared`.
- Playwright tests using two browser contexts to prove one session sees the other.

**Completion boundary.** Two browsers open the same project and each sees that the other is
there. Editing remains local and unsynchronised.

**Exclusions and dependencies.** Depends on C for projects to form rooms around. No document
synchronisation, no CRDT, no cursor positions inside a file. Presence is deliberately
process-local: a second API instance is a Phase M concern, and Redis is not the answer until
there is one.

---

## Phase E — single-file Yjs collaboration

**Goal.** Two people editing the same file and converging — the core technical claim of the
product, proved on the smallest possible surface.

**Major deliverables**

- Yjs, with the shared document model and bindings living in `@devsync/collaboration`.
- A provider over the Phase D transport carrying CRDT updates rather than file contents.
- A Monaco binding, so editor changes become document updates and vice versa.
- Awareness wired to cursors within the shared file.
- Convergence tests: concurrent edits from two contexts, asserted to reach the same state.

**Completion boundary.** Two clients edit one file simultaneously and both arrive at identical
content, with no lost characters and no last-write-wins overwrite.

**Exclusions and dependencies.** Depends on D for the transport and B for the editor. One file
only. Nothing is persisted — closing every client loses the document, which is exactly what
Phase G fixes.

---

## Phase F — multi-file collaboration

**Goal.** A whole project edited collaboratively, not a single file.

**Major deliverables**

- One Yjs document per project, with each file a named shared type inside it.
- A file tree: create, rename, move, delete, propagated as document operations.
- Multiple editor panes or tabs bound to the same project document.
- Awareness extended to say which file each collaborator is looking at.

**Completion boundary.** Several people edit different files in one project at once, see each
other's file positions, and a rename made by one appears for everyone.

**Exclusions and dependencies.** Depends on E. The one-document-per-project model is the starting
choice recorded in [`architecture.md`](architecture.md); if a real project size makes it
untenable, this is the phase where per-file documents get reconsidered.

---

## Phase G — persistence and recovery

**Goal.** Collaborative state that outlives the processes holding it.

**Major deliverables**

- Yjs updates and periodic snapshots persisted through `@devsync/database`.
- Room hydration: opening a project loads the stored state before the first client edits it.
- Recovery after an API restart, with clients resynchronising rather than reloading.
- A compaction strategy so the update log does not grow without bound.

**Completion boundary.** Every client disconnects, the API restarts, a client reconnects, and the
project is exactly as it was left.

**Exclusions and dependencies.** Depends on C for the store and F for the document model. Version
history is deliberately not in scope — this phase persists the current state, not its past.

---

## Phase H — authentication and RBAC

**Goal.** Identity, membership, and server-enforced access control across every entry point.

**Major deliverables**

- Accounts and sessions.
- Project membership with roles — owner, editor, viewer.
- Authorization enforced in the API on HTTP requests **and** on collaboration messages, including
  the room join and every document update.
- Authorization tests written from the attacker's side: a non-member must not read, join, or edit.

**Completion boundary.** A user who is not a member of a project cannot read it, join its room,
or apply an update to it, and the client cannot grant itself any of those.

**Exclusions and dependencies.** Depends on C, D, and E, because each is an entry point that has
to be covered. Read-only enforcement in the editor is a client convenience; the guarantee lives
on the server.

---

## Phase I — reliability and reconnection

**Goal.** Collaboration that survives a bad network rather than only a good one.

**Major deliverables**

- Automatic reconnection with state resynchronisation after a dropped socket.
- Offline edit buffering, replayed and merged on reconnect.
- Heartbeats, timeouts, and backpressure on the transport.
- Honest connection status in the interface — connected, reconnecting, offline.
- Tests that sever and restore the connection mid-edit.

**Completion boundary.** A client loses its connection while typing, keeps typing, reconnects,
and no edit is lost on either side.

**Exclusions and dependencies.** Depends on E and G.

---

## Phase J — collaboration tools

**Goal.** The interface that makes multi-user editing legible rather than merely functional.

**Major deliverables**

- Remote cursors and selections, labelled and coloured per user.
- A participant list with follow mode.
- In-project communication — comments anchored to a location, or a project chat.
- Shared UI primitives extracted into `@devsync/ui` once a second consumer exists.

**Completion boundary.** A collaborator can see where everyone is working, follow someone, and
leave a note without changing the code.

**Exclusions and dependencies.** Depends on F for multi-file awareness and H for the identities
being labelled.

---

## Phase K — version history

**Goal.** The ability to look at, and return to, a previous state of a project.

**Major deliverables**

- Named snapshots and an automatic snapshot cadence.
- A timeline view of a project's history.
- Diffs between two points in time.
- Restore, as a new state rather than a destructive rewrite.

**Completion boundary.** A user can find yesterday's version of a file, see what changed, and
restore it without losing what came after.

**Exclusions and dependencies.** Depends on G. This is not Git integration, and it is not a
branching model.

---

## Phase L — secure code execution

**Goal.** Running user code without giving it anything worth stealing.

**Major deliverables**

- An execution runner as its own service, isolated from `apps/web` and `apps/api`.
- Hard limits: CPU, memory, wall-clock, filesystem, and network — denied by default.
- A job submission and result protocol, with output streamed back to the client.
- An adversarial test suite: escape attempts, resource exhaustion, and network egress, each
  asserted to be contained.

**Completion boundary.** A user runs code in the browser, sees its output, and a deliberately
hostile program cannot reach the API, the database, the host, or the network.

**Exclusions and dependencies.** Depends on H, because untrusted execution without identity has
no accountable subject. **Execution never runs inside the web or API process** — that boundary is
the phase, not a detail of it.

---

## Phase M — production hardening

**Goal.** Everything that separates a working system from an operable one.

**Major deliverables**

- Structured logging, metrics, tracing, and real health and readiness probes.
- Rate limiting, security headers, and input hardening across every entry point.
- Backup and restore, exercised rather than assumed.
- Load and soak testing of the collaboration transport.
- Deployment configuration, and whatever shared state horizontal scaling actually turns out to
  need — the first point at which Redis is even a candidate.

**Completion boundary.** The system can be deployed, observed, and recovered by someone who did
not write it.

**Exclusions and dependencies.** Depends on everything before it.

---

## Phase N — portfolio closure

**Goal.** Leave the repository legible to someone encountering it cold.

**Major deliverables**

- Documentation reconciled end to end against the finished system.
- An architecture write-up covering the decisions and their trade-offs in retrospect.
- A demonstration of the collaborative flow.
- A final consistency pass: no stale phase markers, no aspirational claims, no dead commands.

**Completion boundary.** Every document describes the system that exists, and the README's first
screen tells the truth about it.

---

## How this roadmap is maintained

A phase is marked complete only when its completion boundary is met and the repository's checks
pass against it — not when its code is written. When a phase completes, this document, the
README, and `CLAUDE.md` are updated in the same change, and each phase's entry is rewritten from
plan to record.

Later phases are described at the level of intent. The detail is expected to change as earlier
phases teach the project something; a roadmap that had to be right about Phase L before Phase B
existed would only be a more confident guess.
