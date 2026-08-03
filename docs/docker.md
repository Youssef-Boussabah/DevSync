# Docker

How the DevSync applications are containerised, how to build and run them, and what the setup
deliberately does not include.

The container setup was introduced in **Phase A3 — Docker foundation** and is unchanged at
**B3**: the editor, the workspace holding its contents, and the language selection over them all
ship inside the existing web image and needed no change to it, because Monaco and its language
workers are bundled into the client build rather than fetched at runtime, and the workspace state
never leaves the browser. Docker is an additional way to run the
two applications that already exist; it replaces nothing. Every `pnpm` command still works exactly
as before, and the test architecture still runs on the host.

## Prerequisites

- **Docker Engine 25 or newer**, with the Compose plugin. Validated against Docker 29.1.2 and
  Docker Compose v2.40.3.
- On Windows or macOS, Docker Desktop provides both. The daemon must actually be running: if
  `docker version` prints a Client block and then fails to reach the API, it is not.
- Roughly 1.5 GB of free disk for the base image, the two application images, and the build
  cache.
- Network access on first build, to pull `node:24.13.0-alpine` and to install dependencies.

No Docker-specific tooling is installed into the repository, and nothing about the build
depends on the host having Node or pnpm.

## Structure

| File                  | Purpose                                                       |
| --------------------- | ------------------------------------------------------------- |
| `compose.yaml`        | The two services, their ports, environment, and health checks |
| `apps/web/Dockerfile` | Production image for `@devsync/web`                           |
| `apps/api/Dockerfile` | Production image for `@devsync/api`                           |
| `.dockerignore`       | What never enters the build context                           |

**Both images build from the repository root**, not from their own directory:

```bash
docker build -f apps/web/Dockerfile .
docker build -f apps/api/Dockerfile .
```

That is not a stylistic choice. This is a pnpm workspace: `pnpm-lock.yaml`,
`pnpm-workspace.yaml`, `.npmrc`, and every workspace `package.json` live at the root, and
`pnpm install --frozen-lockfile` resolves the whole workspace graph before it can honour a
filter. A context scoped to `apps/web` cannot see any of that, so a frozen install is
impossible from there. Compose sets `context: .` for both services for the same reason.

### Web image

Three stages, plus a shared base.

1. **base** — `node:24.13.0-alpine`, `libc6-compat` (which Next.js recommends on Alpine, because
   its native binaries and `sharp` expect glibc symbols musl provides through that shim), and
   Corepack enabled so pnpm matches the root `packageManager` field exactly.
2. **deps** — copies only the lockfile, the workspace definition, `.npmrc`, and every workspace
   manifest, then runs `pnpm install --frozen-lockfile --filter @devsync/web...`. Manifests
   first means this layer is reused until a dependency genuinely changes. The filter is why no
   NestJS, no Jest, and no Playwright is ever installed — and therefore why no browser is ever
   downloaded into an application image.
3. **builder** — adds `packages/config` (which owns the TypeScript configuration `apps/web`
   extends) and `apps/web`, then runs `next build`.
4. **runner** — a fresh `node:24.13.0-alpine` with no pnpm, no sources, no dev dependencies and
   no build cache. It receives only `.next/standalone` and `.next/static`.

`apps/web/next.config.ts` sets `output: 'standalone'` and, critically for a monorepo,
`outputFileTracingRoot` pointed at the repository root. Next.js traces the modules the
application actually reaches and emits a self-contained tree; left at its default the trace
would start at `apps/web` and miss everything pnpm resolved through the workspace store,
producing a bundle that cannot boot. Static assets are the one thing tracing does not place, so
they are copied in separately. There is no `public/` directory in this application, so none is
copied.

The result is that the runtime image needs no package manager and no `node_modules` install: its
entire `node_modules` is the single traced `next` package. `output: 'standalone'` is an
_additional_ output, so `next dev` and `next start` are unaffected — the Playwright suite still
starts the application with `next start`.

### API image

Four stages, plus a shared base.

1. **base** — `node:24.13.0-alpine` with Corepack enabled.
2. **manifests** — the lockfile and every workspace manifest. Shared by both installs below, so
   that layer is fetched once.
3. **build-deps** → **builder** — `pnpm install --frozen-lockfile --filter @devsync/api...`,
   then `packages/config` and `apps/api`, then `nest build` to `dist/`.
4. **prod-deps** — the same lockfile with `--prod`, so the compiler, the Nest CLI, Jest, and
   Supertest never reach the runtime image.
5. **runner** — a fresh Node image holding `dist/`, `package.json`, and the production
   `node_modules`.

Two details are load-bearing:

- **The prod install uses `--filter @devsync/api`, without the `...` suffix** the build stage
  uses. That suffix pulls in the workspace packages `@devsync/api` depends on regardless of
  whether the edge is a dev dependency, which drags in `@devsync/config` and, through its own
  dependency on `typescript-eslint`, 22 MB of TypeScript that nothing at runtime can even
  resolve. `@devsync/api` has no workspace dependency it needs in production, so the plain
  filter is both smaller and more honest.
- **Both `node_modules` trees are copied, at their original relative paths.** pnpm links
  `apps/api/node_modules/*` to the content-addressed store under `/repo/node_modules/.pnpm`
  using relative symlinks, which resolve only if that layout is preserved.

## Commands

### Build

```bash
docker compose build            # both images
docker compose build web        # one service
docker compose build --no-cache # ignore every cached layer
```

### Start and stop

```bash
docker compose up -d            # start both, detached
docker compose up -d --build    # rebuild first, then start
docker compose ps               # state and health of both services
docker compose down             # stop and remove containers and the default network
```

### Rebuild cleanly

From most to least surgical:

```bash
docker compose build --no-cache          # rebuild ignoring the layer cache
docker compose down --rmi local          # also drop the two built images
docker builder prune                     # reclaim the BuildKit cache
```

A clean rebuild is rarely needed: the manifests-then-source layer ordering means a source change
rebuilds only the build and runtime stages, and a dependency change is what invalidates the
install layer.

### Logs

```bash
docker compose logs              # both services, from the beginning
docker compose logs -f api       # follow one service
docker compose logs --tail 50 web
```

Both applications log to stdout, so this is the whole story — nothing is written to a log file
inside a container.

## Ports

| Service | Container | Host | URL                          |
| ------- | --------- | ---- | ---------------------------- |
| `web`   | 3000      | 3000 | http://127.0.0.1:3000/       |
| `api`   | 3001      | 3001 | http://127.0.0.1:3001/health |

These are the same ports the applications use in local development, deliberately: a developer
should not have to learn a second set. The consequence is that `docker compose up` and
`pnpm dev` cannot both run at once — whichever starts second fails to bind. The Playwright
suite is unaffected; it uses 4310 and 4311.

### Binding inside the container

The web container sets `HOSTNAME=0.0.0.0`, which is what the Next.js standalone server reads;
without it the server would listen on loopback and be unreachable however the port is published.
Its startup log line `- Network: http://0.0.0.0:3000` confirms this.

`apps/api` is different, and the difference is intentional. `main.ts` calls `app.listen(port)`
with no host argument, which makes Node listen on **all** interfaces — the unspecified address,
dual-stack, accepting both IPv4 and IPv6 — so it is already reachable from outside the
container. Forcing `app.listen(port, '0.0.0.0')` would narrow that to IPv4 only and break
`curl http://localhost:3001/health` on any machine where `localhost` resolves to `::1` first,
which includes Windows. The container is reachable either way; only the local developer
experience differs, so the code is left alone.

## Health checks

Both services declare a health check in `compose.yaml` rather than in their Dockerfiles, so
there is one place to read and change them.

| Service | Probe                              | Interval | Timeout | Retries | Start period |
| ------- | ---------------------------------- | -------- | ------- | ------- | ------------ |
| `web`   | `GET http://127.0.0.1:3000/`       | 15s      | 5s      | 5       | 20s          |
| `api`   | `GET http://127.0.0.1:3001/health` | 15s      | 5s      | 5       | 10s          |

Each probe is `node -e` using Node's built-in `fetch`, which means the images need neither
`curl` nor `wget`. Both prove that the HTTP application answers, not merely that a process is
alive — a Next.js server that booted but cannot render, or a Nest application whose routes never
mapped, both fail these.

```bash
docker inspect --format '{{.State.Health.Status}}' devsync-web-1 devsync-api-1
```

There is **no `depends_on` between the two services**. `apps/web` does not call `apps/api`, so
an ordering constraint would describe a dependency that does not exist, and would quietly become
wrong the moment a real one appears.

## Environment variables

| Variable   | Service | Value in Compose | Meaning                                                |
| ---------- | ------- | ---------------- | ------------------------------------------------------ |
| `NODE_ENV` | both    | `production`     | Standard production switch                             |
| `PORT`     | `web`   | `3000`           | Port the Next.js standalone server listens on          |
| `HOSTNAME` | `web`   | `0.0.0.0`        | Interface the standalone server binds to               |
| `API_PORT` | `api`   | `3001`           | The existing contract: read by `main.ts`, default 3001 |

`API_PORT` is passed **explicitly** in `compose.yaml`. DevSync still has no configuration
module and loads no `.env` file, so a variable that is not stated in Compose is not configured
at all — it is not silently picked up from `.env.example` or anywhere else. `.env.example`
remains the documented inventory of what the applications understand, and `.dockerignore`
excludes every `.env*` file from the build context so none of them can end up in an image
layer.

**No secrets exist in this repository**, and none are baked into either image. There is no
registry credential, no API key, and no database URL, because there is nothing yet to
authenticate against.

## Current limitations

- **No database, cache, queue, message broker, or any other external service exists**, in
  Compose or anywhere else in this repository. DevSync stores nothing and talks to nothing.
  There is no PostgreSQL container, no Redis, no volume, and no named network beyond the
  default one Compose creates for the project. Adding an empty database container now would be
  scaffolding pretending to be architecture.
- **The two services do not talk to each other.** `web` and `api` are containerised
  independently because that is what they are.
- **No development-mode Compose setup.** There is no watch mode, no bind-mounted source, and no
  hot reload in Docker. `pnpm dev` remains the development loop; these images run production
  builds only.
- **Ports 3000 and 3001 are shared with local development**, so Docker and `pnpm dev` cannot
  run simultaneously.
- **`linux/amd64` and `linux/arm64` are whatever the host provides.** The images build for the
  local platform; no multi-platform build or registry push is configured.
- **No image is published anywhere.** There is no registry, no tagging scheme beyond Compose's
  `devsync-web:latest` / `devsync-api:latest`, and no deployment configuration. Kubernetes and
  cloud deployment belong to a later milestone. CI builds and exercises both images but pushes
  nothing — see [`ci.md`](ci.md).
- **No test suite runs inside a container.** CI's `docker` job builds both images, starts them,
  waits for their health checks, and verifies both endpoints — but the Playwright suite itself
  runs against host processes on ports 4310 and 4311 and is deliberately not moved into Docker.
  No browser is installed in an application image, and no container-specific test was invented.

## Shutdown

```bash
docker compose down --volumes --remove-orphans
```

Both services run with `init: true`, which puts Docker's init process at PID 1 and forwards
`SIGTERM` to the application. Without it, the Node process would itself be PID 1, where the
kernel drops signals that have no explicit handler — so `docker compose down` would wait out the
full grace period and then kill the container. With it, both stop promptly and cleanly.

`--volumes` is harmless here since no volume is declared; it is in the command so that the habit
is right when one eventually is. Running plain `docker run` outside Compose should pass `--init`
for the same reason.
