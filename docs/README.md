# DevSync documentation

Deeper technical documentation for DevSync. The [root README](../README.md) is the short
version — what the project is, how to run it, and the commands. These documents explain
how it works and why.

| Document | Covers |
| -------- | ------ |
| [architecture.md](architecture.md) | The two halves of the system and the boundary between them: the Next.js frontend, the Express + Socket.IO backend, where room state lives, how a request travels, and why the backend runs as a single instance. |
| [collaboration.md](collaboration.md) | The real-time model in detail: room IDs and URLs, the per-tab session, participant identity, the join and leave flows, the document events, typing indicators, reconnect behaviour, and the empty-room grace window. Also states plainly what whole-document sync cannot do. |
| [execution.md](execution.md) | Running code: the Run button and its shortcut, the five languages, the path from browser to backend to JDoodle, why the credentials stay server-side, every limit and what enforces it, the daily provider quota, how user-code errors differ from infrastructure errors, and the language-aware download. |
| [testing.md](testing.md) | What the 72 tests actually assert, case by case, on both sides; how the backend integration suite runs against a fake JDoodle with no credentials and no network; and what CI runs. |
| [deployment.md](deployment.md) | The intended production model — Vercel for the frontend, Render for the backend — the environment variables by name, the order the two must be deployed in, exact-origin CORS, free-tier cold starts, and what horizontal scaling would require. |
| [decisions.md](decisions.md) | The engineering decisions and their costs: why a separate backend, why Socket.IO, why `sessionStorage`, why identity is the socket, why no database, why no CRDT, why the proxy, and what would have to change for production scale. |

## Where to start

- **Understanding the system** — read [architecture.md](architecture.md) first, then
  [collaboration.md](collaboration.md).
- **Working on the editor or the socket** — [collaboration.md](collaboration.md).
- **Working on runs or the proxy** — [execution.md](execution.md).
- **Deploying it** — [deployment.md](deployment.md).
- **Wondering why something is the way it is** — [decisions.md](decisions.md).

## Conventions

These documents describe the software as it exists. Where a limitation is deliberate it
is named as a deliberate limitation, not softened: rooms are ephemeral, simultaneous
edits overwrite each other, the backend does not scale horizontally, and Vercel preview
deployments cannot reach the backend. Those are all true of this version.
