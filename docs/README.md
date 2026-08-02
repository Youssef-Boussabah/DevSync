# DevSync documentation

This directory is currently a placeholder for the project's written documentation.

Phase A0 established the repository foundation only, so there is nothing yet whose design is
settled enough to document. Writing an architecture document now would describe intentions
rather than a system, and the repository's documentation is meant to describe what exists.

The following documents are planned for later Phase A milestones, each landing alongside the
work it describes:

- **Architecture** — services, boundaries, and how a change travels through the system.
- **Collaboration protocol** — the messages exchanged between clients and server, and the
  guarantees they carry.
- **Data model** — entities, relationships, and migration practice.
- **Security** — authentication, authorisation, and the isolation model for executing user code.
- **Testing** — the testing strategy and what each layer is responsible for proving.
- **Roadmap** — the milestone sequence and the current position within it.

Until then, [`../README.md`](../README.md) is the accurate description of the repository, and
each `packages/*` directory documents its own intended responsibility.
