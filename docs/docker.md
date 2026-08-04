# Docker

How the DevSync applications are containerised, how to build and run them, and what the setup
deliberately does not include.

The container setup was introduced in **Phase A3 — Docker foundation** and grew for the first time
in **C1**, which added PostgreSQL, a named volume, and a one-shot migration service. Phase B needed
no change to it at all: Monaco and its language workers are bundled into the client build rather
than fetched at runtime, and the workspace state never leaves the browser.

Docker is an additional way to run DevSync; it replaces nothing. Every `pnpm` command still works
exactly as before, and the test architecture still runs on the host — though `pnpm test:db` and
`pnpm test:e2e` now expect the `database` service to be up, because the API will not start without
one.

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

| File                      | Purpose                                                           |
| ------------------------- | ----------------------------------------------------------------- |
| `compose.yaml`            | Four services, their ports, environment, health checks, and order |
| `apps/web/Dockerfile`     | Production image for `@devsync/web`                               |
| `apps/api/Dockerfile`     | Production image for `@devsync/api`, and the `migrate` stage      |
| `docker/postgres/initdb/` | Creates the disposable test database on first initialisation      |
| `.dockerignore`           | What never enters the build context                               |

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
docker compose up -d            # start everything, detached
docker compose up -d --build    # rebuild first, then start
docker compose up -d database   # just PostgreSQL, for host development and tests
docker compose ps --all         # state and health, including the exited migration
docker compose logs migrate     # what the migration did
docker compose down             # stop and remove containers; keeps the database volume
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
docker compose logs              # every service, from the beginning
docker compose logs -f api       # follow one service
docker compose logs --tail 50 web
```

Both applications log to stdout, so this is the whole story — nothing is written to a log file
inside a container.

## Ports

| Service    | Container | Host | URL                                           |
| ---------- | --------- | ---- | --------------------------------------------- |
| `web`      | 3000      | 3000 | http://127.0.0.1:3000/                        |
| `api`      | 3001      | 3001 | http://127.0.0.1:3001/health                  |
| `database` | 5432      | 5433 | `postgresql://devsync:devsync@127.0.0.1:5433` |
| `migrate`  | —         | —    | one-shot, publishes nothing                   |

The two applications use the same ports as local development, deliberately: a developer should not
have to learn a second set. The consequence is that `docker compose up` and `pnpm dev` cannot both
run at once — whichever starts second fails to bind. The Playwright suite is unaffected; it uses
4310 and 4311.

**PostgreSQL is the exception, on 5433**, so that Compose's database and a PostgreSQL a developer
already has installed can coexist. That also means `docker compose up -d database` and `pnpm dev`
work together, which is the ordinary development arrangement: the database in a container, the
applications on the host.

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

| Service    | Probe                              | Interval | Timeout | Retries | Start period |
| ---------- | ---------------------------------- | -------- | ------- | ------- | ------------ |
| `web`      | `GET http://127.0.0.1:3000/`       | 15s      | 5s      | 5       | 20s          |
| `api`      | `GET http://127.0.0.1:3001/health` | 15s      | 5s      | 5       | 10s          |
| `database` | `pg_isready` as `devsync`          | 5s       | 5s      | 12      | 10s          |

Each probe is `node -e` using Node's built-in `fetch`, which means the images need neither
`curl` nor `wget`. Both prove that the HTTP application answers, not merely that a process is
alive — a Next.js server that booted but cannot render, or a Nest application whose routes never
mapped, both fail these.

```bash
docker inspect --format '{{.State.Health.Status}}' devsync-web-1 devsync-api-1
```

The `migrate` service declares none: it is expected to exit, and what matters about it is its exit
code, which the API's `service_completed_successfully` condition already waits on.

There is still **no `depends_on` between `web` and `api`**. `apps/web` does not call `apps/api`, so
an ordering constraint would describe a dependency that does not exist, and would quietly become
wrong the moment a real one appears.

## Environment variables

| Variable            | Service          | Value in Compose                                     |
| ------------------- | ---------------- | ---------------------------------------------------- |
| `NODE_ENV`          | `web`, `api`     | `production`                                         |
| `PORT`              | `web`            | `3000` — the Next.js standalone server's port        |
| `HOSTNAME`          | `web`            | `0.0.0.0` — the interface it binds to                |
| `API_PORT`          | `api`            | `3001`                                               |
| `DATABASE_URL`      | `api`, `migrate` | `postgresql://devsync:devsync@database:5432/devsync` |
| `POSTGRES_USER`     | `database`       | `devsync`                                            |
| `POSTGRES_PASSWORD` | `database`       | `devsync`                                            |
| `POSTGRES_DB`       | `database`       | `devsync`                                            |

Every one is passed **explicitly** in `compose.yaml`. The containers load no `.env` file —
`.dockerignore` excludes every `.env*` from the build context, so none can end up in an image
layer — which means a variable not stated in Compose is not configured at all. Outside containers
`apps/api` does read `.env`, and `.env.example` is the documented inventory.

`DATABASE_URL` uses the Compose service hostname `database`, and the container port 5432 rather
than the 5433 published to the host: inside the network there is no other PostgreSQL to collide
with.

**No secrets exist in this repository.** The PostgreSQL credentials above are development values
for a database that only ever runs on a developer's own machine, stated openly rather than hidden
in a way that would imply they protect something. There is no registry credential and no API key.

## PostgreSQL

`compose.yaml` runs **one PostgreSQL service**, `database`, on `postgres:18.3-alpine3.23` — pinned
to a patch release the way the Node base image is, rather than tracking `latest`. Its database
name, user, and password are stated in Compose as `devsync`/`devsync`/`devsync`. Those are
development values, not secrets, and the rule that has always applied here still does: **what is
not stated in Compose is not configured.**

Two details are worth knowing before changing it.

- **The volume is mounted at `/var/lib/postgresql`, not `/var/lib/postgresql/data`.** PostgreSQL 18
  moved the data directory; the older path is correct up to 17 and wrong here, and getting it wrong
  produces a container that starts cleanly and loses everything on restart.
- **The published host port is 5433, not 5432.** A developer with PostgreSQL already installed is
  listening on 5432, and the collision is silent in the worst way. Inside the Compose network it is
  the ordinary 5432, so only host-side URLs carry the offset. See
  [D23](decisions.md#d23--postgresql-is-published-on-port-5433).

`docker/postgres/initdb/` holds one script, which the official entrypoint runs the first time it
initialises an empty data directory. It creates `devsync_test`, the disposable database `pnpm
test:db` and `pnpm test:e2e` use. **The application never creates a database**; that script is the
only place one appears outside a migration.

The health check is `pg_isready` against the configured user and database, so readiness means the
server accepts connections rather than that a container started.

### The migration service

`migrate` is a one-shot service built from the `migrate` stage of `apps/api/Dockerfile`. It waits
for the database to be healthy, runs `prisma migrate deploy`, and exits. The API then waits for
**that exit**, through `service_completed_successfully`:

```yaml
depends_on:
  database:
    condition: service_healthy
  migrate:
    condition: service_completed_successfully
```

That ordering is the point. Migrations never run from application startup, so however many API
instances start at once, none of them races another through the schema — and a failed migration
stops the API from starting at all rather than letting it serve against a schema that is not there.

The migration image carries the Prisma CLI, the schema, and the committed migrations. **The API
runtime image carries none of them**, which is why the two are separate stages rather than one
image with two commands.

Nothing else joins Compose. No Redis, no queue, no message broker, and no database administration
UI: each would be a service nothing uses, which is the thing this file has avoided since A3.

**The `web` → `api` edge still does not exist**, because `apps/web` still makes no request to
`apps/api`. It arrives in C3, and it will be the first web-to-API runtime dependency rather than
the first `depends_on` in the file.

### What survives, and what does not

- **`docker compose down` preserves your projects.** It removes the containers and the default
  network; the named `postgres_data` volume is untouched, and starting again finds everything where
  it was.
- **`docker compose down --volumes` is the destructive one.** It deletes the volume, and with it
  every project and file. CI's `docker` job passes `--volumes` in its cleanup step, which is
  correct there and only there: a runner is disposable by definition.
- **Restarting the database and API containers changes nothing**, because the data lives in the
  volume rather than in either container's writable layer.

### What the API image carries

The runtime image holds compiled JavaScript for `apps/api` and `packages/database`, the generated
Prisma Client compiled with it, and the production dependency trees for both — `@prisma/client`,
`@prisma/adapter-pg`, and `pg` among them. It holds **no** TypeScript source, no compiler, no Nest
CLI, no test runner, and no Prisma CLI. Because the client reaches PostgreSQL through the `pg`
driver adapter, no query engine binary ships either.

One existing detail became load-bearing in C1. The `prod-deps` stage installs with
`--filter @devsync/api --filter @devsync/database`, naming both packages rather than using pnpm's
`...` suffix. The suffix would pull in every workspace package on a dependency edge of any kind,
including the dev-only one to `@devsync/config`, and with it tens of megabytes of TypeScript that
nothing at runtime can resolve.

pnpm links `apps/api/node_modules/@devsync/database` to `packages/database`, so the runtime image
copies that package's `dist`, its manifest, and its `node_modules` at their original relative
paths — the same reason the other `node_modules` trees keep theirs.

## Current limitations

- **No cache, queue, message broker, or database administration UI exists**, in Compose or
  anywhere else. PostgreSQL is there because the API genuinely needs it; nothing else has earned
  a place yet, and an unused service would be scaffolding pretending to be architecture.
- **Nothing a user can reach touches the database.** The API connects to it during startup and
  serves no route that reads or writes a project. That arrives in C2.
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

**`--volumes` deletes the database.** Since C1 there is a volume to delete, and this is the command
that empties it: every project, every file, gone. Use it when you want a clean database and not
otherwise:

```bash
docker compose down                        # keeps your projects
docker compose down --volumes              # deletes them, deliberately
```

Running plain `docker run` outside Compose should pass `--init` for the same reason the services
set it.
