// @ts-check

// The end-to-end suite's entry point: a known database, and the environment its
// production web build needs.
//
// Two things have to happen before Turborepo is invoked, and neither can happen
// inside `playwright.config.ts`.
//
// **The disposable database is reset first.** Playwright starts its `webServer`
// processes before it runs a `globalSetup`, so a reset written there would drop
// the schema out from under an API that had already connected to it. Doing it
// here puts it before the build, before the servers, and before the first test.
// The safety gate is `@devsync/database`'s, used unchanged: it refuses anything
// that is not `devsync_test`, and anything that turns out to address the same
// database as `DATABASE_URL`.
//
// **`NEXT_PUBLIC_API_URL` is embedded into the JavaScript `next build` emits**, so
// it has to be in the environment before Turborepo builds `apps/web` — not when
// Playwright starts, by which point the bundle already exists. Setting it here is
// also what makes it visible to Turborepo's environment hash, so a build made for
// port 3001 cannot be replayed from the cache for a suite running on 4311.
//
// This is a Node process rather than a `VAR=value command` prefix in
// `package.json` because pnpm runs scripts through `cmd.exe` on Windows, where
// that is not syntax, and this repository is developed on Windows.
//
// The port is restated here rather than imported, because `playwright.config.ts`
// is loaded by Playwright's own transpiler and this file is plain ESM run by
// Node. **`playwright.config.ts` refuses to start if the two disagree**, so a
// mistake is a loud failure at the first line of the run rather than a suite
// quietly driving a build that points somewhere else.

import { spawn } from 'node:child_process';
import { prepareTestDatabase } from '@devsync/database/test-database';

const API_BASE_URL = 'http://127.0.0.1:4311';

await prepareTestDatabase({ reset: true });
console.log('End-to-end database reset and migrated.');

// `shell: true` because `turbo` is resolved from `node_modules/.bin`, which pnpm
// has already put on PATH for this script. The command is a constant; nothing
// from outside is interpolated into it.
const child = spawn('turbo run test:e2e', {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, NEXT_PUBLIC_API_URL: API_BASE_URL },
});

child.on('exit', (code, signal) => {
  process.exitCode = signal === null ? (code ?? 1) : 1;
});

child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
