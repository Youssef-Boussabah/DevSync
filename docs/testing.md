# Testing

72 automated tests: 39 on the frontend, 33 on the backend.

```
cd web    && npm test    # Vitest, jsdom             39 tests, 5 files
cd server && npm test    # node:test, integration    33 tests, 10 suites
```

## Frontend suite

Vitest in a jsdom environment, with React Testing Library where a component is involved.
The suite covers the logic that is easy to get quietly wrong — storage, encoding,
re-entrancy, error paths — rather than asserting on markup.

**`room-session.test.ts`** — the per-tab room session.

- Trims the room ID and name before storing, and reads back what it wrote.
- Rejects a whitespace-only room ID or name without writing anything.
- Returns `null` rather than throwing for: no stored session, malformed JSON, a
  stored object of the wrong shape, and storage blocked outright.
- Reports failure instead of throwing when a write is refused.
- Clearing removes the session, and swallows a storage failure.
- `shortenRoomId` leaves a short ID untouched and renders a long one as
  `FIRST4…LAST4` in upper case.

**`download-code.test.ts`** — the language-aware download.

- Every language the editor offers maps to its conventional filename.
- The file is named after the selected language.
- The source is written exactly as typed, with no added banner and no trailing newline.
- Non-ASCII source survives as UTF-8.
- The anchor is clicked while it is in the document, then removed.
- The object URL is revoked.

jsdom implements neither object-URL method, so the test file captures the Blob and the
clicked anchor instead of performing a real navigation or file write.

**`execution-api.test.ts`** — the execution API client.

- Posts the run to the server's execute endpoint, and does not double the slash when the
  configured backend URL has a trailing one.
- Sends only the source and the language name.
- Returns the output, error and status of a successful run.
- Passes a failed run's diagnostic through unchanged, and shows the server's own message
  for a non-2xx response.
- Falls back to a generic message when a failure carries no JSON, when the request never
  reaches the server, and when no backend URL is configured.

**`use-code-execution.test.tsx`** — the execution hook.

- Runs the code and language the editor is currently showing, including after they
  change — the latest-value behaviour the ref exists for.
- Ignores a second run while one is still in flight.
- Shows the output with a success toast, and the diagnostic with a failure toast.
- `Ctrl+Alt+N` runs the same code, and keystrokes that are not the shortcut are ignored.

**`join-room-gate.test.tsx`** — the room invite gate.

- Shows the room it is guarding without offering to change it.
- Offers back the name the tab last used.
- Stores the trimmed session and joins on form submit and on button click.
- Refuses an empty name and stores nothing.

`next/link` needs an App Router mounted above it, and the gate only uses it for the two
"back home" links, so a plain anchor stands in.

## Backend suite

Node's built-in `node:test` runner, and integration-level throughout. Every case starts
the real server as a child process on a free port and talks to it over real HTTP and
real Socket.IO. Nothing outside the machine is contacted.

**`collaboration`**

- The health check answers with the DevSync banner.
- Two clients land in one roster and edits relay in both directions.
- A joining client is handed the document the room already holds.
- A participant who leaves is dropped from the roster.
- Same-name participants stay distinct.
- A socket joining the same room again adds nobody.
- A `codeChange` from a socket that never joined the room is ignored.
- Typing is labelled with the name the socket joined under, not the one it claims.

**`the empty-room grace window`** — three assertions over one real wait.

- Someone returning inside the window gets the document back.
- The room stays alive past the original expiry once someone has returned — the
  occupancy re-check working.
- A room nobody returns to has its document discarded.

These wait out the real 15-second production value rather than shortening it for CI,
which is why the backend suite takes about 20 seconds. Both rooms are emptied at the same
moment so one wait covers both scenarios.

**`code execution`** — against a fake JDoodle the tests start on localhost.

- UTF-8 source is posted to `/v1/execute` verbatim and its output comes back. The
  request carries exactly `clientId`, `clientSecret`, `script`, `stdin`, `language` and
  `versionIndex` — no per-request CPU or memory limit, which JDoodle does not accept.
- Each of the five languages reaches the JDoodle runtime and version index the server
  chose for it.
- The credentials go upstream and never back to the caller.

**`code that does not run cleanly`**

- `isCompiled: false` comes back as a 200 carrying the compiler output.
- `isExecutionSuccess: false` comes back as a 200 carrying the program's diagnostic,
  not an infrastructure error.

**`execution requests DevSync refuses on its own`** — none of these reach the upstream.

- An unknown language is rejected.
- A malformed request is rejected, both a body of the wrong shape and one that is not
  JSON at all.
- Source above the UTF-8 byte limit is rejected.

**`when JDoodle refuses or misbehaves`**

- A 401 becomes a safe infrastructure failure, and the upstream payload is not echoed.
- A 429 becomes "Daily code-execution limit reached. Try again tomorrow.", and costs
  exactly one upstream call — it is never retried.
- A 5xx becomes a safe message.
- A body that is not JSON becomes a safe message.
- A body of an unrecognisable shape becomes a safe message.

**`an upstream that never answers`** — one request against a server that accepts the
connection and never replies.

- DevSync gives up after its own 15-second timeout and answers 504. Like the grace
  window, this waits out the real production value rather than shortening it for CI.

**`code execution without configured credentials`**

- With neither credential, the feature reports as unavailable instead of failing open.
- With only the Client ID set, it stays unavailable.

**`the execution rate limit`**

- Ten runs pass and the eleventh is turned away.
- A rejected run never reaches JDoodle.
- A caller-supplied `CF-Connecting-IP` is ignored when the server is not on Render.

**`the execution rate limit behind the Render edge`** — its own server process with
`RENDER=true`, because the limiter counts per minute and no other test may share the
counter.

- One Render client's eleventh run is stopped.
- A second Render client gets its own allowance.
- Every allowed run reaches JDoodle and no rejected one does.

Each execution suite gets its own server process, and so its own fresh limiter counter:
the limiter allows ten runs a minute per client, and several of these suites make more
requests than one counter would let through.

### No credentials, no network

The child server is started with `JDOODLE_CLIENT_ID` and `JDOODLE_CLIENT_SECRET` blanked
and its JDoodle address pointed at an unroutable value, so a developer's own credentials
can never leak into a test run and a test that forgets to configure the fake upstream
fails locally rather than reaching a real service. The fake JDoodle is an ordinary HTTP
server the suite starts and stops itself; the credentials the tests do use exist only in
the test file and are seen by nothing but that fake.

## Continuous integration

`.github/workflows/ci.yml` defines two jobs, both on `ubuntu-latest` with Node 24 and
npm caching keyed on the respective lockfile. They run on every push and pull request.

**web** (working directory `web/`)

```
npm ci
npm test
npm run lint
npm run typecheck
npm run build
npm audit --audit-level=high
```

**server** (working directory `server/`)

```
npm ci
npm test
node --check src/server.cjs
npm audit --audit-level=high
```

The audit step fails on new high or critical advisories; lower-severity findings are
reported by `npm audit` locally and reviewed there rather than blocking every build.

Neither job needs a secret. The backend tests supply their own fake JDoodle, and the
frontend build needs no runtime environment.

### CI status

The workflow runs on GitHub for every push and pull request, and its current status is on
the [Actions tab](https://github.com/Youssef-Boussabah/DevSync/actions/workflows/ci.yml) —
the badge at the top of the [root README](../README.md) reports the same thing. The same
commands also pass locally: all 72 tests, lint, typecheck, build, the backend syntax check,
and both audits at zero vulnerabilities.
