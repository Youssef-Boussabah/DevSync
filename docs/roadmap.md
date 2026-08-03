# Roadmap

The milestone sequence DevSync is being built in, and the current position within it.

**Phase A is complete and Phase B has started.** Everything from Phase C onward is a plan: no
code, no dependency, and no workspace content for any of it is present in this repository. A phase
is described here so that the order and the boundaries are decided in advance, not so that it can
be mistaken for progress.

No dates or durations appear in this document, deliberately. A phase is done when its completion
boundary is met, and estimating that in advance would produce a number that gets quoted long
after it stopped being true.

## Position

| Phase | Name                      | Status       |
| ----- | ------------------------- | ------------ |
| **A** | Project foundation        | **Complete** |
| **B** | Local editor              | **B2 done**  |
| C     | Database-backed projects  | Not started  |
| D     | Rooms and presence        | Not started  |
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

**One piece of product functionality exists**: the Monaco editor on the home page, the single-file
workspace holding its contents, and the language that file is read as — delivered by milestones B0,
B1, and B2. Nothing else in the table above is built.

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

## Phase B — local editor 🚧 In progress

**Goal.** A real code editor in the browser, with no server involvement at all — the first
product-shaped thing DevSync does.

**Major deliverables**

| Milestone | Deliverable                                                                  | Status        |
| --------- | ---------------------------------------------------------------------------- | ------------- |
| B0        | Monaco integrated into `apps/web`, surviving the App Router, SSR, and Docker | **Delivered** |
| B1        | The in-memory editing workspace the editor's content belongs to              | **Delivered** |
| B2        | A language selection over the open file                                      | **Delivered** |
| B3        | A Playwright test that types into the real Monaco editor                     | Not started   |

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

**Completion boundary.** A visitor can open the application, type code, and see it highlighted.
Nothing is saved, nothing is shared, and a refresh discards the content — and the interface says
so. **Not yet met:** B3 remains.

**Exclusions and dependencies.** No persistence, no collaboration, no CRDT, no WebSocket, no
file tree, no account. This phase deliberately writes no server code: it establishes that the
editor works before anything else depends on it.

---

## Phase C — database-backed projects

**Goal.** Projects and files that survive a restart, owned by the API and reached through one
data-access package.

**Major deliverables**

- PostgreSQL added to `compose.yaml` — the first service in it that is not an application.
- Prisma schema, migrations, and generated client in `@devsync/database`.
- Project and file CRUD endpoints in `apps/api`, with request validation.
- The first shared contracts published from `@devsync/shared`, consumed by both applications.
- `apps/web` calling `apps/api` — the first real edge between the two, and the first
  `depends_on` in Compose.

**Completion boundary.** A user can create a project, add files, edit them, reload the page, and
find them unchanged. One user at a time; concurrent editing is undefined at this point.

**Exclusions and dependencies.** Depends on B for something to edit. No collaboration, no
presence, no accounts — ownership is not yet enforced, because there is nobody to enforce it
against. Redis is explicitly not introduced here.

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
