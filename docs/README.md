# DevSync documentation

Each document here lands alongside the work it describes, so that nothing in this directory
describes an intention rather than a system.

## Available now

- **[Testing](testing.md)** — the testing layers, which runner owns each one, what the current
  tests actually prove, and what is deliberately not tested yet.
- **[Docker](docker.md)** — how the two applications are containerised, how to build, run, and
  inspect them, and what the Compose setup deliberately leaves out.
- **[Continuous integration](ci.md)** — what runs on GitHub Actions, what each job proves, and
  how to reproduce any of it locally.

## Planned for later Phase A milestones

- **Architecture** — services, boundaries, and how a change travels through the system.
- **Collaboration protocol** — the messages exchanged between clients and server, and the
  guarantees they carry.
- **Data model** — entities, relationships, and migration practice.
- **Security** — authentication, authorisation, and the isolation model for executing user code.
- **Roadmap** — the milestone sequence and the current position within it.

None of those has a settled enough design to write down yet.

Until they do, [`../README.md`](../README.md) is the accurate description of the repository, and
each `packages/*` directory documents its own intended responsibility.
