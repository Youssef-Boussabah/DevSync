# Deployment

The frontend on Vercel, the backend on Render, one instance of each.

## Current production deployment

DevSync is deployed and live. These are the running services:

| Component | Platform | Plan | URL |
| --------- | -------- | ---- | --- |
| Frontend | Vercel | Hobby | <https://dev-sync-beryl.vercel.app> |
| Backend | Render | Free | <https://devsync-server-3dko.onrender.com> |
| Execution | JDoodle Compiler API | Free | — |

Two public values wire the halves together:

| Set on | Variable | Value |
| ------ | -------- | ----- |
| Vercel | `NEXT_PUBLIC_BACKEND_URL` | `https://devsync-server-3dko.onrender.com` |
| Render | `FRONTEND_URL` | `https://dev-sync-beryl.vercel.app` |

Both are public by nature. The first is compiled into the browser bundle — it is the
Socket.IO endpoint and the execution endpoint, and the browser genuinely needs it. The
second is the origin the backend names in its CORS headers, which any client can read.

The JDoodle Client ID and Client Secret are set in the Render dashboard. They are not
public, they are not in this repository, and they are never given a `NEXT_PUBLIC_` name.

The rest of this document describes how to deploy another instance of DevSync, and the
constraints that apply to any deployment of it.

## Deploying another instance

### Frontend — Vercel

| Setting | Value |
| ------- | ----- |
| Root directory | `web` |
| Framework | Next.js (detected automatically) |
| Node | 24.x |
| Build / install | Vercel's defaults for Next.js |

No extra configuration file is needed; there is no `vercel.json`.

One environment variable:

| Variable | Value |
| -------- | ----- |
| `NEXT_PUBLIC_BACKEND_URL` | the Render backend's public URL |

It is `NEXT_PUBLIC_` because the browser genuinely needs it — it is the Socket.IO
endpoint and the execution endpoint. It is compiled into the client bundle and is public
by design. Nothing secret may be given a `NEXT_PUBLIC_` name.

### Backend — Render

`render.yaml` at the repository root describes the service:

| Setting | Value |
| ------- | ----- |
| Root directory | `server` |
| Runtime | Node |
| Build command | `npm ci --omit=dev` |
| Start command | `npm start` |
| Health check path | `/` |
| Plan | free |

The blueprint sets `NODE_VERSION` to `24`, pinning the deployment runtime to the same
major version the project targets everywhere else — `>=24 <25` in both packages'
`engines`, `24` in `.nvmrc`, and `24` in both CI jobs. The pin is explicit so the
deployed runtime cannot drift away from the version the code is built and tested
against.

`PORT` is supplied by Render and read straight from the environment.

#### Environment variables

Set in the Render dashboard, not in the blueprint:

| Variable | Purpose |
| -------- | ------- |
| `FRONTEND_URL` | The exact Vercel production origin. The only origin CORS and Socket.IO accept. |
| `JDOODLE_CLIENT_ID` | The JDoodle Compiler API Client ID. Server-side only. |
| `JDOODLE_CLIENT_SECRET` | The matching Client Secret. Server-side only. |

Declared in the blueprint with its fixed value:

| Variable | Purpose |
| -------- | ------- |
| `JDOODLE_API_URL` | The JDoodle execute endpoint, `https://api.jdoodle.com/v1/execute`. Not a secret. |

`FRONTEND_URL`, `JDOODLE_CLIENT_ID` and `JDOODLE_CLIENT_SECRET` are marked `sync: false`,
so the blueprint carries the names and Render prompts for all three values when the
blueprint is first created. No credential is in the repository — both `.env.example`
files are templates, and real `.env` files are ignored.

Both JDoodle credentials are required: with either missing, `/api/execute` answers 503
and the rest of DevSync works normally. Neither may ever be given a `NEXT_PUBLIC_` name
or copied into the Vercel environment. See [execution.md](execution.md).

### Order of deployment

The backend allows exactly one origin, and the frontend needs the backend's address.
Neither URL exists before its service is created, so the two have to be introduced to
each other in order:

1. **Create the Render blueprint.** Because all three are `sync: false`, Render prompts
   for three values during creation:
   - `JDOODLE_CLIENT_ID` and `JDOODLE_CLIENT_SECRET` — the real JDoodle Compiler API
     credentials, typed into Render directly. Neither is ever written into the repository
     or into any file.
   - `FRONTEND_URL` — a temporary `http://localhost:3000`. The Vercel origin does not
     exist yet, and this placeholder lets the service start and pass its health check.
2. **Deploy the backend** and note the Render service's actual public URL.
3. **Deploy the frontend on Vercel** with `NEXT_PUBLIC_BACKEND_URL` set to the Render
   URL from step 2.
4. **Replace `FRONTEND_URL` on Render** with the exact Vercel production origin, once
   that URL exists.
5. **Redeploy or restart the backend** so it picks up the new origin.

Until step 5, the browser cannot connect: the backend is still allowing
`http://localhost:3000` and rejects the Vercel origin.

## CORS is exact-origin

```js
const corsOptions = {
  origin: process.env.FRONTEND_URL || "http://localhost:3000",
  methods: ["GET", "POST"],
  credentials: true
};
```

The same options are given to Express and to the Socket.IO server. One origin string —
not a list, not a pattern, not `*`.

`credentials: true` and a wildcard origin are mutually exclusive in the CORS spec
anyway, but the deeper reason is that this backend is a credentialed proxy in front of a
metered third-party API. A permissive origin would let any page on the internet spend
the JDoodle quota through it — and on the free plan that is 20 API credits a day.

### Vercel preview deployments will not work

Every Vercel preview gets its own generated hostname. Since only one origin is allowed,
previews cannot reach the backend: the socket fails to connect and runs are refused.

This is accepted rather than worked around. Supporting previews would mean allowing a
wildcard over a Vercel subdomain pattern, which would grant every project on that
subdomain access to the execution proxy. Preview builds still build, and the frontend
can be exercised locally against a local backend.

## Free-tier cold starts

Render's free tier spins a service down when idle. The next request or WebSocket
connection wakes it, and that first connection can take noticeably longer than a normal
one.

While it happens, the UI shows its connecting and reconnecting states — the same states
used for a network drop, so the behaviour is already handled rather than being a special
case. Once awake, the service responds normally.

The health check at `/` is what Render polls to decide the service is up.

## One instance, and why

The backend must run as a **single instance**. Room membership, the shared document, the
cleanup timers and the rate-limiter counters are all in process memory.

With two instances behind a load balancer:

- Two people in the same room could be connected to different instances and never see
  each other, because neither instance holds the other's roster.
- A document written on one instance would not exist on the other.
- A grace-window timer on one instance knows nothing about a rejoin handled by the other.
- Rate-limit counters would be per-instance, so the effective limit would multiply.

Scaling horizontally would require moving all of that out of the process:

- a **Socket.IO adapter** (Redis or similar) so a broadcast on one instance reaches
  sockets on every other;
- **shared room state** — roster and document — in that same store, which also means
  deciding what happens when two instances write the same document concurrently;
- a **shared rate-limit store**, so the ten-per-minute allowance is global;
- **shared or distributed cleanup timers**, so exactly one instance discards a room.

That is a different architecture, not a configuration change. This version deliberately
does not have it. See [decisions.md](decisions.md).

## What is lost on a restart

Every redeploy, restart and cold-start recycle drops all room state. Rooms are
ephemeral; there is no database and nothing is written to disk. Participants see the
reconnect state and rejoin into a room that no longer holds their document.
