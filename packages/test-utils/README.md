# @devsync/test-utils

Test helpers shared between workspaces, so that fixtures and harnesses are
written once rather than copied.

## Future responsibility

- Fixture builders and deterministic test data.
- Harnesses for booting the API and the collaboration layer inside tests.
- Custom assertions used by more than one workspace.

## Current state

Boundary only, still. Phase A2 gave the repository three testing layers — Vitest in
`apps/web`, Jest in `apps/api`, Playwright in `tests/e2e` — and none of them needs a
shared helper: they run on three different runners, and each assertion is a handful
of lines against a page or an endpoint. A helper published from here today would have
no caller, and a fixture factory with no fixture to build is an abstraction pretending
to be infrastructure.

The realistic trigger is a harness that boots the API for tests in more than one
workspace, or shared fixture data once `@devsync/database` and `@devsync/shared` carry
real types. See [`docs/testing.md`](../../docs/testing.md) for the current layout.
