# @devsync/collaboration

Reusable real-time collaboration logic, kept out of both the web app and the API
so that client and server share one implementation of the same rules.

## Future responsibility

- Shared document model and CRDT bindings.
- Awareness state: remote cursors, selections, and presence.
- Room lifecycle and reconnection behaviour.

## Current state

Boundary only. No collaboration library is installed and no synchronisation code
exists anywhere in this repository.
