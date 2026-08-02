# @devsync/shared

Cross-cutting contracts shared by the web client and the API.

## Future responsibility

- Shared TypeScript types and runtime schemas.
- Application-wide constants.
- The collaboration wire-protocol definitions exchanged between client and server.

## Current state

Boundary only. `src/index.ts` exports nothing, because no contract is shared yet.
Adding types here before a second consumer exists would be speculation, not design.
