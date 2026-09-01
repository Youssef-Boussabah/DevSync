# Architecture

DevSync is two deployable pieces: a Next.js frontend and an Express + Socket.IO
backend. They are separate npm projects under `web/` and `server/`, and they talk over
one Socket.IO connection plus one HTTP endpoint.

## Shape

```
                    ┌──────────────────────────────────────┐
                    │  Browser tab                         │
                    │                                      │
                    │  Next.js app (React client)          │
                    │   ├─ /                 landing       │
                    │   ├─ /collaborate      room access   │
                    │   └─ /room/[id]        workspace     │
                    │                                      │
                    │  sessionStorage: this tab's room     │
                    └───────┬────────────────────┬─────────┘
                            │                    │
        Socket.IO (websocket)│                    │ HTTP POST /api/execute
        rooms, document,     │                    │ { sourceCode, language }
        presence, typing     │                    │
                            ▼                    ▼
                    ┌──────────────────────────────────────┐
                    │  Express + Socket.IO backend         │
                    │                                      │
                    │  rooms[]        roomId -> members    │
                    │  roomCode{}     roomId -> document   │
                    │  cleanupTimers  roomId -> timeout    │
                    │                                      │
                    │  POST /api/execute  (rate limited)   │
                    │  GET  /             health check     │
                    └───────────────────┬──────────────────┘
                                        │
                clientId + clientSecret │ (server-held, sent in the body)
                                        ▼
                    ┌──────────────────────────────────────┐
                    │  JDoodle Compiler API                │
                    │  POST api.jdoodle.com/v1/execute     │
                    └──────────────────────────────────────┘
```

The browser never contacts JDoodle. It knows one address — `NEXT_PUBLIC_BACKEND_URL` —
and uses it for both the socket and the execution request.

## Responsibility boundary

**Frontend (`web/`)**

- Routing and rendering: the landing page, the room-access page, the room workspace.
- Room identity per tab: a `sessionStorage` record saying which room this tab entered
  and under what display name.
- The editor surface: `react-simple-code-editor` with Prism highlighting, the language
  select, the Run button and its `Ctrl+Alt+N` shortcut, the output panel, the
  participant list and the typing indicator.
- Language-aware download. This is entirely client-side — the file is built from the
  editor's current text with `URL.createObjectURL` and never touches the backend.
- Deciding when the editor is writable, based on connection state.

**Backend (`server/`)**

- Room membership and the shared document, both held in process memory.
- The empty-room grace timer.
- Authority over identity: a socket's room and display name are what the server
  recorded at join time, not what a later payload claims.
- The execution proxy: holding the JDoodle credentials, mapping a language name to a
  runtime and version index, enforcing size and rate limits, and normalising the
  upstream answer — including turning a spent daily quota into a plain message.
- A `GET /` health check, used by Render.

## Room state

All room state lives in three module-level structures in `server/src/server.cjs`:

```js
const rooms = {};                     // roomId -> [{ id, name }]
const roomCode = {};                  // roomId -> current document
const roomCleanupTimers = new Map();  // roomId -> pending deletion timer
```

There is no database, no cache and no file on disk. Everything above is ephemeral:

- A backend restart or redeploy drops every room, every document and every timer.
- A room whose last participant leaves is discarded 15 seconds later.
- Nothing a participant types is recoverable once the room is gone.

`roomCode[roomId]` is the whole document as a single string. There is no per-file, per
buffer or per-project structure — a room is one shared text.

## Why the backend is a single instance

Room membership, the document, the cleanup timers and the rate-limiter counters are all
in-process. Two backend instances would each hold a different half of the truth: two
participants in the same room could land on different instances and never see each
other, and a cleanup timer on one instance knows nothing about a rejoin handled by the
other.

Running more than one instance would require moving that state out of the process — a
Socket.IO adapter plus a shared store — which this version does not have. The Render
blueprint therefore describes exactly one service, and `render.yaml` says so.

## Request paths

**Collaboration.** The workspace mounts, `useRoom` opens the socket, and on `connect`
it emits `joinRoom`. The server adds the socket to the room, broadcasts the new roster
as `updateRoom`, and sends that socket the room's current document as `codeUpdate`.
Editing emits `codeChange`; the server stores it and relays `codeUpdate` to everyone
else. See [collaboration.md](collaboration.md).

**Execution.** The Run button (or `Ctrl+Alt+N`) calls `executeCode`, which posts the
editor's text and the selected language name to `POST /api/execute`. The backend checks
the language, the size and the rate limit, posts the source to JDoodle's execute
endpoint with the credentials in the body, and returns a normalised
`{ output, error, status }`. See [execution.md](execution.md).

## Deployment topology

The two halves deploy to different providers: the frontend to Vercel with root
directory `web`, the backend to Render with root directory `server`. The backend allows
exactly one CORS origin, so the two have to be introduced to each other in order.

Both are live: the frontend at <https://dev-sync-beryl.vercel.app> and the backend at
<https://devsync-server-3dko.onrender.com>. See [deployment.md](deployment.md).
