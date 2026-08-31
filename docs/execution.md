# Code execution

Running the shared document, and downloading it.

## Triggering a run

Two entry points, one code path:

- The **Run** button in the editor toolbar.
- **`Ctrl+Alt+N`**, listened for on `document` and shown next to the button on wider
  screens.

Both call `runCode` from `useCodeExecution`. The hook registers the keyboard listener
once and reads the current code and language through a ref, so it does not re-bind on
every keystroke. A second run is ignored while one is still in flight, and the button
shows `Running…` and is disabled meanwhile.

## Languages

The toolbar offers exactly five:

| Toolbar label | Value sent | Prism grammar | JDoodle runtime | `versionIndex` |
| ------------- | ---------- | ------------- | --------------- | -------------- |
| JavaScript    | `javascript` | javascript  | `nodejs` — Node.js 20.9.0    | `5` |
| TypeScript    | `typescript` | typescript  | `typescript` — TypeScript 5.9.3 | `1` |
| Python        | `python`     | python      | `python3` — Python 3.14.3    | `6` |
| C++           | `cpp`        | cpp (and c) | `cpp17` — GCC 15.2.1         | `3` |
| Java          | `java`       | java        | `java` — JDK 21.0.0          | `5` |

The browser sends the **name**. The JDoodle language code and version index live only in
`EXECUTION_LANGUAGES` in `server/src/server.cjs`; a language the server does not
recognise is rejected with 400 before anything is submitted upstream. A client cannot
name a JDoodle runtime or pin a version index of its own — changing which runtimes
DevSync uses is a server-side change, not a client one.

## The request path

```
browser  ──POST /api/execute──▶  DevSync backend  ──POST /v1/execute──▶  JDoodle
         { sourceCode,                             { clientId,           Compiler API
           language }                                clientSecret,
         ◀── { output, error, status } ──            script, stdin,
                                                     language,
                                                     versionIndex }
```

`executeCode` posts to `${NEXT_PUBLIC_BACKEND_URL}/api/execute`, stripping any trailing
slash from the configured URL so the path is never doubled. The body carries only the
source and the language name — nothing else about the room, the participant, or the
session.

The backend posts once to `https://api.jdoodle.com/v1/execute` and gets the finished
result back in that same response; there is no token to poll for. `JDOODLE_API_URL`
overrides the endpoint, which is what lets the test suite point the proxy at a fake
upstream.

## Why the credentials stay on the server

`JDOODLE_CLIENT_ID` and `JDOODLE_CLIENT_SECRET` are read from the backend's environment
and sent in the upstream request **body**, which is where JDoodle expects them. Neither
is returned to the caller, logged, or present in any response body — and the upstream
payload is never forwarded verbatim, so an error JDoodle attributes to a bad credential
reaches the browser as a generic infrastructure failure.

Anything reaching the browser in a Next.js app is public: `NEXT_PUBLIC_` values are
compiled into the bundle, and even a non-prefixed value would be visible if it were sent
to the client. A JDoodle client secret in the browser is a credential anyone can read
from the page and spend. Proxying the call is the only way to keep a metered
third-party credential private while still letting a browser trigger runs.

The frontend has no configuration for JDoodle at all. Its only execution-related setting
is the backend's address.

## UTF-8 handling

JDoodle takes the source as plain text in `script`, so there is no base64 hop in either
direction: accented identifiers, non-Latin strings and emoji travel as themselves.

The size limit is measured the same way it is enforced: `Buffer.byteLength(source, "utf8")`,
so the limit is in bytes, not characters. Source that fits under 64 K *characters* can
still be rejected if its UTF-8 encoding exceeds 64 KiB — which is exactly what the
backend test suite checks.

## Limits

| Limit | Value | Where |
| ----- | ----- | ----- |
| Execution source | 64 KiB of UTF-8 | rejected with 413 before any upstream call |
| Request body | 256 kb | `express.json` on this route only |
| Rate limit | 10 requests / minute / client | `express-rate-limit`, this route only |
| Upstream timeout | 15 seconds | `AbortController` on the fetch |
| Provider daily quota | 20 API credits / day | JDoodle's free Compiler API plan |

Everything in that table except the last row is DevSync's own. DevSync sends JDoodle no
per-request CPU or memory limit — the JDoodle execute call does not accept one — so the
sandbox's own ceilings are whatever JDoodle applies, and this project makes no promise
about them.

The rate limiter and the body parser are mounted on `/api/execute` alone. The health
check, room joins and document sync are never throttled, and Socket.IO's traffic is
untouched. The limiter runs *before* the parser, so a throttled caller is turned away
before its body is read.

Rate-limit state is in-memory counters, which is sufficient precisely because the
backend is a single instance.

Document sync has its own, separate ceiling: 1 MiB of UTF-8 per `codeChange`. The 64 KiB
figure is about what may be *run*, not what may be *typed*.

## The daily provider quota

JDoodle's free Compiler API plan allows **20 API credits per day**, and every
`/api/execute` call that reaches JDoodle spends one — including a run whose code fails
to compile. When the day's credits are gone JDoodle answers **429**, and DevSync turns
that into:

```json
{ "error": "Daily code-execution limit reached. Try again tomorrow." }
```

also as a 429. It is not retried: a retry would spend another credit against the same
exhausted quota and fail the same way. Nothing is charged — the free plan refuses rather
than bills — and DevSync's own 10-per-minute limiter stays in force independently, since
one caller should not be able to burn the whole day's credits in a few seconds.

Collaboration is unaffected. A spent quota makes runs temporarily unavailable until the
next day; rooms, editing, presence and download keep working.

## User-code errors versus infrastructure errors

This distinction drives the whole response shape.

**The submitted code failing is a normal result.** JDoodle folds compiler diagnostics
and program output into one `output` field and reports the kind of result in two
booleans: `isCompiled` and `isExecutionSuccess`. Either being `false` means the code did
not run cleanly, and both return **HTTP 200** with the diagnostic in `error`:

```json
{ "output": "", "error": "jdoodle.cpp:3:5: error: ...", "status": "Compilation Error" }
```

| Upstream | DevSync `status` | DevSync `error` |
| -------- | ---------------- | --------------- |
| `isCompiled: false` | `Compilation Error` | `output`, or `compilationStatus` if `output` is empty |
| `isExecutionSuccess: false` | `Runtime Error` | `output` |
| neither false | `Success` | empty; `output` carries the program's output |

Only a flag that is explicitly `false` counts as a failure, so an interpreted language
that omits `isCompiled` is not mistaken for a compile error. A failed program is not a
failed request.

**Infrastructure problems are HTTP failures**, each with a message written for the
person who pressed Run:

| Status | When |
| ------ | ---- |
| 400 | malformed body, or a language the server does not know |
| 413 | source over 64 KiB, or a body over the parser limit |
| 429 | DevSync's rate limit exceeded, **or** JDoodle's daily credit limit reached |
| 502 | JDoodle returned a non-2xx (a rejected credential included), a body that is not JSON, an unrecognisable shape, or the request failed |
| 503 | `JDOODLE_CLIENT_ID` or `JDOODLE_CLIENT_SECRET` is not configured |
| 504 | JDoodle did not answer within 15 seconds |

The two 429s are told apart by their message, not their status: "Too many runs. Try
again in a minute." is DevSync's own limiter, "Daily code-execution limit reached. Try
again tomorrow." is the provider quota.

The client shows the server's message as-is rather than wrapping it, and falls back to a
generic "Execution service is unavailable. Try again." when a failure carries no usable
JSON, when the request never reaches the server at all, or when
`NEXT_PUBLIC_BACKEND_URL` is not configured.

### Running without credentials

If either `JDOODLE_CLIENT_ID` or `JDOODLE_CLIENT_SECRET` is empty, `/api/execute` answers
503 and says execution is unavailable. It does not fail open and does not attempt an
unauthenticated upstream call. Everything else — rooms, editing, presence, download —
works normally, so DevSync is fully usable for collaboration without any credential.

## Client identity behind Render's edge

The rate limiter needs to tell callers apart. On Render, every request arrives through
Cloudflare and Render's own router, so `req.ip` is the edge's address and every caller
in the world would share one bucket.

Render sets `RENDER=true` in its own environment, and Cloudflare overwrites
`CF-Connecting-IP` with the real client address on the way in. So:

```js
const ON_RENDER = process.env.RENDER === "true";

function executionClientKey(req) {
  const edgeClient = req.headers["cf-connecting-ip"];
  const trusted = ON_RENDER && typeof edgeClient === "string" && net.isIP(edgeClient);
  return ipKeyGenerator(trusted ? edgeClient : req.ip);
}
```

- The header is believed **only** when the process is on Render **and** the value parses
  as a real IP. Anywhere else it is whatever a caller chose to type, so it is ignored
  outright.
- `ipKeyGenerator` is the rate limiter library's own normaliser: it unwraps IPv4-mapped
  addresses and collapses IPv6 to a /56, so one caller cannot walk a subnet for a fresh
  allowance.

There is deliberately **no** `app.set("trust proxy", ...)`. That would make Express
honour a forwarded-for chain on every deployment, local ones included, which is exactly
the header a caller can forge.

Both branches are covered by tests: one asserts a caller-supplied `CF-Connecting-IP` is
ignored off Render, another runs a server with `RENDER=true` and asserts two edge clients
get separate allowances.

## Download

Downloading is entirely client-side. `downloadCode` builds a `Blob` from the editor's
current text, creates an object URL, clicks a temporary anchor and revokes the URL. The
backend is not involved and the source never leaves the browser.

The file is the document exactly as typed — no banner, no added trailing newline, no
transformation — written as UTF-8.

| Language | Filename |
| -------- | -------- |
| JavaScript | `main.js` |
| TypeScript | `main.ts` |
| Python | `main.py` |
| C++ | `main.cpp` |
| Java | `Main.java` |

`Main.java` is capitalised because Java requires the file to match the public class.

The download button is disabled while the document is empty.
