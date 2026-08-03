# DevSync documentation

Each document here lands alongside the work it describes, so that nothing in this directory
describes an intention rather than a system. Where a document does describe direction — the
architecture DevSync is being built towards, or the milestones ahead — it says so explicitly and
keeps it separate from what exists.

The repository is at **Phase B, milestone B2 — language selection over the open file**, on the
Phase A foundation. One Monaco editor on the home page, over one file the application holds in
browser memory and reads as one of five languages, is the only product functionality that exists.

## Start here

- **[Architecture](architecture.md)** — what exists today, which package boundaries are reserved
  and empty, the request and process boundaries, the durable architectural principles, and the
  planned architecture that is explicitly not built.
- **[Development](development.md)** — prerequisites, installation, every root command, workspace
  filtering, ports, artifacts, adding a workspace, and the repository's Git conventions.
- **[Roadmap](roadmap.md)** — the milestone sequence from Phase A to Phase N, each with a goal, its
  deliverables, and the boundary that marks it complete.
- **[Decisions](decisions.md)** — the choices already made, why, what they cost today, and what
  would justify revisiting each one.

## Subject documents

- **[Testing](testing.md)** — the three testing layers, which runner owns each, what the current
  tests actually prove, and what is deliberately not tested yet.
- **[Docker](docker.md)** — how the two applications are containerised, how to build, run, and
  inspect them, and what the Compose setup deliberately leaves out.
- **[Continuous integration](ci.md)** — what runs on GitHub Actions, what each job proves, and how
  to reproduce any of it locally.

Each of these owns its subject in full. Other documents link to them rather than restating them,
so there is exactly one place to correct when something changes.

## Not written yet

These need a design that does not exist, because the systems they would describe do not exist:

- **Collaboration protocol** — the messages exchanged between clients and server, and the
  guarantees they carry. Sketched as direction in [`architecture.md`](architecture.md); it becomes
  a document when Phase D defines real messages.
- **Data model** — entities, relationships, and migration practice. A Phase C document.
- **Security** — authentication, authorisation, and the isolation model for executing user code.
  The principles are recorded in [`architecture.md`](architecture.md); the document follows the
  implementation in Phases H and L.

[`../README.md`](../README.md) is the top-level description of the repository, and each
`packages/*` directory documents its own responsibility and current state.
