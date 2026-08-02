# @devsync/test-utils

Test helpers shared between workspaces, so that fixtures and harnesses are
written once rather than copied.

## Future responsibility

- Fixture builders and deterministic test data.
- Harnesses for booting the API and the collaboration layer inside tests.
- Custom assertions used by more than one workspace.

## Current state

Boundary only. `apps/api` owns the repository's only test today and it requires
no shared helper, so adding one now would be a fake abstraction.
