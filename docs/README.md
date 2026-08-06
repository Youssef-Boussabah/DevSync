# DevSync documentation

Each document here lands alongside the work it describes, so that nothing in this directory
describes an intention rather than a system. Where a document does describe direction — the
architecture DevSync is being built towards, or the milestones ahead — it says so explicitly and
keeps it separate from what exists.

**Phases A, B, and C are complete. Phase D — rooms and presence — is next.**
C0 decided how persistence would be built; C1 built the storage half — PostgreSQL, Prisma, the schema,
one committed migration, the data layer, and an API that connects during startup; C2 put ten
project and file routes over it, with the request and response contracts in `@devsync/shared`; C3
connected the browser to those routes; **C4 proved the data outlives the processes holding it**; C5
audited the phase against the C0 contract, corrected what it found, and closed it.

**A person can now reach it.** The home page lists projects, `/projects/[projectId]` opens one in
Monaco, and pressing Save writes to PostgreSQL — a reload finds the work unchanged. There is no
autosave, no browser storage, no account, and no collaboration.

**Restart survival is now proved automatically rather than checked by hand.** C1 covered the data
layer's connection lifecycle in an automated suite and confirmed the container restarts manually;
C4 made the whole stack repeatable. `pnpm test:restart` brings the production
images up in a Compose project of its own, creates a project and two files through the API, and then
restarts the API, stops PostgreSQL underneath it, brings it back **without** restarting the API, and
redeploys the committed migration over the populated volume — comparing every field of the fixture
after each. A request during the outage answers `503 DATABASE_UNAVAILABLE` and carries nothing about
the machinery behind it. There is still no backup, no restore, no replication, and no failover.

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

- **[Testing](testing.md)** — the testing layers, which runner owns each, what the current tests
  actually prove, and what is deliberately not tested yet.
- **[Docker](docker.md)** — how the applications are containerised, how PostgreSQL and the
  migration service fit together, what survives `docker compose down`, and what the setup
  deliberately leaves out.
- **[Continuous integration](ci.md)** — what runs on GitHub Actions, what each job proves, and how
  to reproduce any of it locally.

Each of these owns its subject in full. Other documents link to them rather than restating them,
so there is exactly one place to correct when something changes.

## Not written yet

These need a design that does not exist, because the systems they would describe do not exist:

- **Collaboration protocol** — the messages exchanged between clients and server, and the
  guarantees they carry. Sketched as direction in [`architecture.md`](architecture.md); it becomes
  a document when Phase D defines real messages.
- **Security** — authentication, authorisation, and the isolation model for executing user code.
  The principles are recorded in [`architecture.md`](architecture.md); the document follows the
  implementation in Phases H and L.

The Phase C data model, its HTTP resources, and the migration practice around them were expected to
need a document of their own. They did not: they are one section of
[`architecture.md`](architecture.md#phase-c--the-persistence-architecture), which already owns the
boundaries they sit between. A separate document earns its place only if that section outgrows the
one it is part of.

[`../README.md`](../README.md) is the top-level description of the repository, and each
`packages/*` directory documents its own responsibility and current state.
