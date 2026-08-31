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

| Toolbar label | Value sent | Prism grammar | Judge0 runtime |
| ------------- | ---------- | ------------- | -------------- |
| JavaScript    | `javascript` | javascript  | 102 |
| TypeScript    | `typescript` | typescript  | 101 |
| Python        | `python`     | python      | 109 |
| C++           | `cpp`        | cpp (and c) | 105 |
| Java          | `java`       | java        | 91  |

The browser sends the **name**. The runtime ids live only in
`EXECUTION_LANGUAGES` in `server/src/server.cjs`; a language the server does not
recognise is rejected with 400 before anything is submitted upstream. Changing which
runtimes DevSync uses is a server-side change, not a client one.

## The request path

```
browser  ──POST /api/execute──▶  DevSync backend  ──POST /submissions──▶  Judge0 CE
         { sourceCode,                             x-rapidapi-key           (RapidAPI)
           language }                              x-rapidapi-host
         ◀── { output, error, status } ──          base64 source
```

`executeCode` posts to `${NEXT_PUBLIC_BACKEND_URL}/api/execute`, stripping any trailing
slash from the configured URL so the path is never doubled. The body carries only the
source and the language name — nothing else about the room, the participant, or the
session.

The backend submits to `/submissions?base64_encoded=true&wait=true`, so one request
covers submit-and-collect rather than polling for a token.

## Why the credential stays on the server

`JUDGE0_API_KEY` is read from the backend's environment and sent as the `x-rapidapi-key`
header on the upstream call. It is never returned to the caller, never logged, and never
present in any response body.

Anything reaching the browser in a Next.js app is public: `NEXT_PUBLIC_` values are
compiled into the bundle, and even a non-prefixed value would be visible if it were sent
to the client. A RapidAPI key in the browser is a key anyone can read from the page and
spend. Proxying the call is the only way to keep a metered third-party credential
private while still letting a browser trigger runs.

The frontend has no configuration for Judge0 at all. Its only execution-related setting
is the backend's address.

## UTF-8 handling

Judge0 takes base64 source. The backend encodes with `Buffer.from(sourceCode, "utf8")`
rather than the browser's `btoa`, which throws on anything outside Latin-1 — accented
identifiers, non-Latin strings and emoji in source all survive. Judge0's `stdout`,
`stderr`, `compile_output` and `message` come back base64-encoded and possibly null, and
are decoded the same way, with a null or empty field treated as an empty string.

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
| CPU time | 5 seconds | sent to Judge0 as `cpu_time_limit` |
| Memory | 256000 KB (~256 MB) | sent to Judge0 as `memory_limit` |
| Upstream timeout | 15 seconds | `AbortController` on the fetch |

The rate limiter and the body parser are mounted on `/api/execute` alone. The health
check, room joins and document sync are never throttled, and Socket.IO's traffic is
untouched. The limiter runs *before* the parser, so a throttled caller is turned away
before its body is read.

Rate-limit state is in-memory counters, which is sufficient precisely because the
backend is a single instance.

Document sync has its own, separate ceiling: 1 MiB of UTF-8 per `codeChange`. The 64 KiB
figure is about what may be *run*, not what may be *typed*.

## User-code errors versus infrastructure errors

This distinction drives the whole response shape.

**The submitted code failing is a normal result.** Judge0 status `3` is "Accepted";
every other status means the code did not run cleanly — a compile error, a runtime
error, a timeout inside the sandbox. Those return **HTTP 200** with the diagnostic in
`error`:

```json
{ "output": "", "error": "SyntaxError: ...", "status": "Compilation Error" }
```

The diagnostic is the first non-empty of `stderr`, `compile_output` and `message`,
falling back to the status description. A failed program is not a failed request.

**Infrastructure problems are HTTP failures**, each with a message written for the
person who pressed Run:

| Status | When |
| ------ | ---- |
| 400 | malformed body, or a language the server does not know |
| 413 | source over 64 KiB, or a body over the parser limit |
| 429 | rate limit exceeded |
| 502 | Judge0 returned a non-2xx, an unrecognisable shape, or the request failed |
| 503 | `JUDGE0_API_KEY` is not configured |
| 504 | Judge0 did not answer within 15 seconds |

The client shows the server's message as-is rather than wrapping it, and falls back to a
generic "Execution service is unavailable. Try again." when a failure carries no usable
JSON, when the request never reaches the server at all, or when
`NEXT_PUBLIC_BACKEND_URL` is not configured.

### Running without a key

If `JUDGE0_API_KEY` is empty, `/api/execute` answers 503 and says execution is
unavailable. It does not fail open and does not attempt an unauthenticated upstream
call. Everything else — rooms, editing, presence, download — works normally, so DevSync
is fully usable for collaboration without any credential.

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
