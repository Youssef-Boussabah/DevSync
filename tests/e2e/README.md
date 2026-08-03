# @devsync/e2e

Playwright browser and full-stack smoke tests. This is the only layer that runs compiled
output, binds real ports, and drives a browser.

```bash
pnpm test:e2e:install   # once per machine — downloads Chromium
pnpm test:e2e           # from the repository root: builds both apps, then drives them
```

`playwright.config.ts` starts `apps/web` on port 4310 and `apps/api` on port 4311, waits for
each to answer over HTTP, and shuts both down afterwards. It never reuses a server started by
hand.

[`docs/testing.md`](../../docs/testing.md) is the full description: what each layer proves, how
the layers divide, where artifacts go, and what is deliberately not tested yet.
