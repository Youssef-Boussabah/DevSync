# @devsync/e2e

Playwright browser and full-stack tests. This is the only layer that runs compiled output, binds
real ports, drives a browser, and — from C3 — writes to a database through the real interface.

```bash
pnpm test:e2e:install   # once per machine — downloads Chromium
pnpm test:e2e           # from the repository root: resets the test database, builds both apps,
                        # then drives them in Chromium
```

**Run it from the repository root.** `pnpm test:e2e` goes through `tools/run-e2e.mjs`, which does two
things Turborepo and Playwright cannot: it resets the disposable `devsync_test` database through
`@devsync/database/test-database`, and it sets `NEXT_PUBLIC_API_URL` to the port this suite starts the
API on **before** the web application is built, because `next build` embeds that value.
`playwright.config.ts` refuses to run if the web build points anywhere else, so
`pnpm --filter @devsync/e2e test:e2e` fails immediately rather than testing the wrong build.

`playwright.config.ts` starts `apps/web` on port 4310 and `apps/api` on port 4311, waits for each to
answer over HTTP, and shuts both down afterwards. It never reuses a server started by hand. The suite
runs **serially**, on one worker: the browser tests create projects and files against one schema, and
a shared project list is not something to race against.

[`docs/testing.md`](../../docs/testing.md) is the full description: what each layer proves, how the
layers divide, where artifacts go, and what is deliberately not tested yet.
