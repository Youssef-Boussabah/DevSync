# Roadmap

The milestone sequence DevSync is being built in, and the current position within it.

**Phases A and B are complete, and Phase C is under way: C0 and C1 are complete, and C2 is next.**
C0 settled how persistence would be shaped; C1 built it. PostgreSQL, Prisma, the schema, the
committed migration, and the data layer all exist, and the API opens a connection during startup.
**No project or file is reachable over HTTP yet**, and the web application still makes no request
to the API — those are C2 and C3. Everything from C2 onward is a plan. A phase is described here so
that the order and the boundaries are decided in advance, not so that it can be mistaken for
progress.

No dates or durations appear in this document, deliberately. A phase is done when its completion
boundary is met, and estimating that in advance would produce a number that gets quoted long
after it stopped being true.

## Position

| Phase | Name                      | Status          |
| ----- | ------------------------- | --------------- |
| **A** | Project foundation        | **Complete**    |
| **B** | Local editor              | **Complete**    |
| **C** | Database-backed projects  | **C1 complete** |
| D     | Rooms and presence        | Not started     |
| E     | Single-file collaboration | Not started     |
| F     | Multi-file collaboration  | Not started     |
| G     | Persistence and recovery  | Not started     |
| H     | Authentication and RBAC   | Not started     |
| I     | Reliability               | Not started     |
| J     | Collaboration tools       | Not started     |
| K     | Version history           | Not started     |
| L     | Secure code execution     | Not started     |
| M     | Production hardening      | Not started     |
| N     | Portfolio closure         | Not started     |

**One piece of product functionality exists**: the Monaco editor on the home page, the single-file
workspace holding its contents, and the language that file is read as — delivered by milestones B0,
B1, and B2, covered in a real browser by B3, and closed by B4. Nothing else in the table above is
built. Phase C now has a database behind it, but **nothing a user can reach**: projects and files
can be created through `@devsync/database` and survive a restart, and no route, button, or request
in the product does so.

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
compositionally by the component suites — `code-editor.test.tsx` for the callback, and
`local-editor-workspace.test.tsx` for the state it lands in. This is test layering, not missing
product behaviour; the editor works, and [`testing.md`](testing.md) is the full account.

**Exclusions and dependencies.** No persistence, no collaboration, no CRDT, no WebSocket, no
file tree, no account. This phase deliberately writes no server code: it establishes that the
editor works before anything else depends on it.

---

## Phase C — database-backed projects 🚧 In progress

**Goal.** Projects and files that survive a restart, owned by the API and reached through one
data-access package. **Phase C is single-user**: it gives DevSync something worth collaborating on
before any collaboration exists.

**Milestones**

| Milestone | Deliverable                                        | Status        |
| --------- | -------------------------------------------------- | ------------- |
| C0        | Persistence architecture and project data contract | **Delivered** |
| C1        | PostgreSQL and Prisma data layer                   | **Delivered** |
| C2        | Project and file API                               | **Next**      |
| C3        | Persistent web workspace                           | Not started   |
| C4        | Persistence and restart validation                 | Not started   |
| C5        | Phase closure                                      | Not started   |

**What the phase has to add up to.** By C5, one person can create a project, list their projects,
open one, rename it, and delete it; create files in it, list and open them, edit a file's contents,
rename it, change the language it is read as, and delete it; reload the browser and find all of it
unchanged; and restart both the API and PostgreSQL and still find it unchanged.

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
[`architecture.md`](architecture.md#phase-c--planned-persistence-architecture); the choices behind
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

**Excluded, and still absent.** No project or file HTTP route, controller, or DTO — those are C2 —
and no change to `apps/web`. `@devsync/shared` is still empty. The API holds a connection, and
nothing it serves reads or writes a project.

### C2 — project and file API

**Deliverables.** The nested project and file resources in `apps/api`, with request validation, the
starter-file policy applied at creation, and persistence errors mapped to the status codes and error
codes C0 settled. **`@devsync/shared` starts exporting here**: the request schemas, the response
schemas worth pinning, the types inferred from them, the supported language identifiers and their
validator, and the error contract. `apps/api` is their first consumer; `apps/web` becomes the second
in C3. API integration tests against a real Nest application and a real test database.

**Completion boundary.** Every route in the C0 contract behaves as documented, including the
failures: an invalid UUID, an unsupported language, an empty patch, a duplicate file name within a
project, a file addressed through the wrong project, and a project that does not exist. A file
mutation moves its project's `updatedAt`, so the project list orders by real recent work.

**Excluded.** No change to `apps/web`, and no authentication — every request is anonymous, and the
API is published on a local host port, so anything that can reach that port can read and delete
anything in it. That is acceptable only inside Phase C's local single-user development boundary, and
it is why nothing in Phase C may be deployed publicly. Phase H is what makes it safe.

### C3 — persistent web workspace

**Deliverables.** The first call `apps/web` ever makes to `apps/api` — the first web-to-API runtime
dependency there has ever been, and with it the Compose dependency edge from `web` to `api`. The
database and migration ordering edges already exist; C1 added them. `apps/web` becomes the second
application consuming `@devsync/shared`, which C2 published. A project list and a project view;
creating, renaming, and deleting a project; creating, opening, renaming, and deleting a file; and
editing a file's contents against a save path that is explicit about what has reached the server.
The language selection becomes a stored property of a file rather than a reading of one buffer,
which is what retires the derived file name in `apps/web/src/editor/languages.ts` — the labels a
user reads may stay there, but the identifiers and their validator are `@devsync/shared`'s from C2.
Playwright drives the whole flow against a real web application, a real API, and a disposable
database.

**Completion boundary.** A person opens the application, creates a project, edits a file, reloads
the page, and finds their work exactly as they left it.

**Excluded.** No collaboration and no presence — a second browser sees the same data only by
reloading, and two people editing the same file at once is undefined behaviour until Phase E.

### C4 — persistence and restart validation

**Deliverables.** Proof, rather than assertion, that the data survives: a browser reload, an API
restart, a PostgreSQL container restart, closing and reopening a project, applying the committed
migration to an existing database without losing rows, and a database that is temporarily
unavailable producing a controlled failure instead of a stack trace.

**Completion boundary.** Every one of those is covered by a test or a documented, reproducible
procedure, and none of them loses a record.

**Excluded.** No backup and restore tooling, no load testing, and no failover — those are Phase M.

### C5 — phase closure

**Deliverables.** The reconciliation pass. Documentation rewritten from plan to record, the
implementation audited against the C0 contract, any drift between the two resolved in whichever
direction turns out to be right, and the full validation suite rerun.

**Completion boundary.** Every document describes the persistence that exists, the exclusions above
are still absent, and the phase's completion boundary is met and stated as met.

---

## Phase D — rooms and presence

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
