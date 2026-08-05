# Docker

How the DevSync applications are containerised, how to build and run them, and what the setup
deliberately does not include.

The container setup was introduced in **Phase A3 — Docker foundation** and grew for the first time
in **C1**, which added PostgreSQL, a named volume, and a one-shot migration service. Phase B needed
no change to it at all. C2 added no service and no dependency edge — only a third workspace to the
API image, `@devsync/shared`.

**C3 added the last edge in the graph and one build argument.** `web` now depends on a healthy
`api`, because the browser the web image serves calls it; the web image builds `@devsync/shared`
alongside the application, because `apps/web` imports it; and `NEXT_PUBLIC_API_URL` is passed as a
**build argument**, because `next build` embeds it into the JavaScript it emits. No new service was
added.

**C4 added no service and no stage.** It made the three published host ports variables with their
existing values as defaults, so a second, disposable copy of this stack can run beside a developer's
own — which is what [`pnpm test:restart`](#the-c4-restart-validation) does. Nothing else about the
file changed: the same four services, the same dependency graph, the same volume, and the same
container-side ports.

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
   downloaded into an application image. From C3 it also installs `@devsync/shared`, which
   `apps/web` now imports the request and response contracts from.
3. **builder** — declares `ARG NEXT_PUBLIC_API_URL` and puts it in the environment, adds
   `packages/config` (which owns the TypeScript configuration both workspaces extend),
   `packages/shared`, and `apps/web`, then builds the shared package and runs `next build`. The
   package is built first because `apps/web` resolves it through its `exports` map to `dist`, which
   does not exist until its own build has run.
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

`@devsync/shared` needs nothing at runtime either: Turbopack bundles it, and the Zod it brings, into
the chunks it emits, so the runtime image carries no copy of the package and resolves no workspace
link. The API image is the opposite — it loads the compiled package through Node's own resolution —
and that difference is a property of the two bundlers rather than of the package.

### What the web image carries, and what it must not

The image holds `.next/standalone` and `.next/static` and nothing else of the repository: no
`package.json` graph to install, no pnpm, no compiler, and no test runner. **It carries no database
configuration of any kind** — no connection string, no `DATABASE_URL`, and no `TEST_DATABASE_URL` —
because none of that is ever given to `apps/web`. The one configuration value baked into it is the
public API origin, which is public by definition.

CI asserts both halves: that `http://127.0.0.1:3001` appears in the emitted client chunks, and that
nothing matching a PostgreSQL connection string or `DATABASE_URL` appears anywhere in `.next`.

### API image

Four stages, plus a shared base.

1. **base** — `node:24.13.0-alpine` with Corepack enabled.
2. **manifests** — the lockfile and every workspace manifest. Shared by both installs below, so
   that layer is fetched once.
3. **build-deps** → **builder** — `pnpm install --frozen-lockfile --filter @devsync/api...`,
   then `packages/config`, `packages/database`, `packages/shared`, and `apps/api`, then the two
   packages' builds and `nest build` to `dist/`.
4. **prod-deps** — the same lockfile with `--prod --no-optional`, so the compiler, the Nest CLI,
   the Prisma CLI, Jest, and Supertest never reach the runtime image. Both flags are needed;
   [why](#why-the-production-install-declines-optional-dependencies) is below.
5. **runner** — a fresh Node image holding `dist/`, `package.json`, and the production
   `node_modules`.

Two details are load-bearing:

- **The prod install names its workspaces explicitly, without the `...` suffix** the build stage
  uses. That suffix pulls in the workspace packages `@devsync/api` depends on regardless of
  whether the edge is a dev dependency, which drags in `@devsync/config` and, through its own
  dependency on `typescript-eslint`, 22 MB of TypeScript that nothing at runtime can even
  resolve. Naming the three packages that genuinely run — `@devsync/api`, `@devsync/database`, and
  `@devsync/shared` — is both smaller and more honest.
- **Every `node_modules` tree is copied, at its original relative path.** pnpm links
  `apps/api/node_modules/*` and `packages/*/node_modules/*` to the content-addressed store under
  `/repo/node_modules/.pnpm` using relative symlinks, which resolve only if that layout is
  preserved.

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

| Service    | Container | Host default | Variable             | URL                                           |
| ---------- | --------- | ------------ | -------------------- | --------------------------------------------- |
| `web`      | 3000      | 3000         | `WEB_HOST_PORT`      | http://127.0.0.1:3000/                        |
| `api`      | 3001      | 3001         | `API_HOST_PORT`      | http://127.0.0.1:3001/health                  |
| `database` | 5432      | 5433         | `POSTGRES_HOST_PORT` | `postgresql://devsync:devsync@127.0.0.1:5433` |
| `migrate`  | —         | —            | —                    | one-shot, publishes nothing                   |

**The container-side ports never move**, and neither does anything Compose passes between services:
`DATABASE_URL` still names `database:5432`, because inside the network there is nothing to collide
with. Only the published side is a variable, and each defaults to the value it has always had, so
`docker compose up` with no environment behaves exactly as it did before C4.

`WEB_ORIGIN` and the `NEXT_PUBLIC_API_URL` build argument are **derived** from those two application
ports rather than restated beside them. That is not tidiness: they are the two halves of one browser
boundary, and a stack published on another port whose API still allowed `http://127.0.0.1:3000` would
fail every request with no allow-origin header. Restating a number in two places is how the two stop
agreeing.

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

**`web` depends on a healthy `api` from C3.** The dependency is real now — the browser the web image
serves calls the API for everything it displays. What the edge does **not** do is make the page fail
without it: the request is the browser's, not the container's, so the page still renders and shows
its error state. What it does is stop `docker compose up --wait` reporting the stack as up while the
only thing a visitor could do is read an error, and it makes the ordering in the file describe the
system rather than understate it.

## Environment variables

| Variable              | Service          | Value in Compose                                     |
| --------------------- | ---------------- | ---------------------------------------------------- |
| `NODE_ENV`            | `web`, `api`     | `production`                                         |
| `PORT`                | `web`            | `3000` — the Next.js standalone server's port        |
| `HOSTNAME`            | `web`            | `0.0.0.0` — the interface it binds to                |
| `NEXT_PUBLIC_API_URL` | `web`            | `http://127.0.0.1:3001` — a **build argument**       |
| `API_PORT`            | `api`            | `3001`                                               |
| `DATABASE_URL`        | `api`, `migrate` | `postgresql://devsync:devsync@database:5432/devsync` |
| `WEB_ORIGIN`          | `api`            | `http://127.0.0.1:3000`                              |
| `POSTGRES_USER`       | `database`       | `devsync`                                            |
| `POSTGRES_PASSWORD`   | `database`       | `devsync`                                            |
| `POSTGRES_DB`         | `database`       | `devsync`                                            |
| `WEB_HOST_PORT`       | Compose itself   | `3000` by default — the published web port           |
| `API_HOST_PORT`       | Compose itself   | `3001` by default — the published API port           |
| `POSTGRES_HOST_PORT`  | Compose itself   | `5433` by default — the published PostgreSQL port    |

The last three are the exception to the rule below and are the only variables `compose.yaml` reads
rather than passes: they are substituted while the file is parsed, no container ever sees one, and
each has its previous literal as its default. `.env.example` documents them commented out, so copying
that file leaves every one at its default.

Every other one is passed **explicitly** in `compose.yaml`. The containers load no `.env` file —
`.dockerignore` excludes every `.env*` from the build context, so none can end up in an image
layer — which means a variable not stated in Compose is not configured at all. Outside containers
`apps/api` reads `.env` and `apps/web` reads it while it builds, and `.env.example` is the documented
inventory.

`DATABASE_URL` uses the Compose service hostname `database`, and the container port 5432 rather
than the 5433 published to the host: inside the network there is no other PostgreSQL to collide
with.

**`NEXT_PUBLIC_API_URL` and `WEB_ORIGIN` are the opposite case, and the reason is worth stating
plainly: the code that uses them runs in the user's browser, which is not on the Compose network.**

- `NEXT_PUBLIC_API_URL` is under `build.args`, not `environment`, because `next build` embeds it into
  the JavaScript it emits — an image built for one API origin cannot be pointed at another by
  restarting it with a different variable. Its value is the **host-published** `http://127.0.0.1:3001`.
  `http://api:3001` would resolve inside the Compose network and nowhere else, and every request the
  page made would fail on a name the browser cannot look up.
- `WEB_ORIGIN` is the address the browser loads DevSync from, `http://127.0.0.1:3000`, and it is
  matched **exactly**. `http://localhost:3000` is a different origin to a browser and gets no
  allow-origin header, so **open the stack at `http://127.0.0.1:3000`**.

Neither is a secret. The API URL is embedded in code every visitor downloads, and the origin is the
address they typed.

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
UI: each would be a service nothing uses, which is the thing this file has avoided since A3. C3 added
an edge and a build argument, and no service; C4 added three port variables, and no service.

## The C4 restart validation

```bash
pnpm test:restart
```

The one command in this repository that stops and starts containers on purpose. It brings **this
Compose file** up in a project of its own — `devsync-c4-validation` — creates a project and two files
through the API, and then restarts the API, stops PostgreSQL underneath it, brings PostgreSQL back
without restarting the API, and redeploys the committed migration over the populated volume,
comparing every field of the fixture after each. [`testing.md`](testing.md) is the full account of
what it asserts.

What matters here is what it does to Docker:

| Belonging to       | The `devsync` project   | The `devsync-c4-validation` project    |
| ------------------ | ----------------------- | -------------------------------------- |
| Containers         | `devsync-*-1`           | `devsync-c4-validation-*-1`            |
| Network            | `devsync_default`       | `devsync-c4-validation_default`        |
| Volume             | `devsync_postgres_data` | `devsync-c4-validation_postgres_data`  |
| Published ports    | 3000, 3001, 5433        | 4321 and 5434 (`web` is never started) |
| Removed by the run | **never**               | always, in a `finally` path            |

- **It builds `api` and `migrate` only.** No C4 scenario opens a page, so building Next.js would be
  minutes spent on an image nothing starts. Under its own project name those images are tagged
  `devsync-c4-validation-api` and `devsync-c4-validation-migrate`; every layer comes from the same
  BuildKit cache as the ordinary build, so a second build after `docker compose build` is a re-tag
  rather than a rebuild.
- **`docker compose down --volumes` is run against the validation project and never the development
  one.** Before the cleanup deletes anything it reads the volumes **Docker** labels as this project's
  and refuses the whole batch if a single name falls outside the `devsync-c4-validation_` prefix, and
  afterwards it proves the `devsync` project's volumes are exactly as it found them. The guard is in
  code, in `tests/restart/lib/`, not in this document.
- **It needs none of your ports free.** 3000, 3001, and 5433 stay yours; the run refuses to start if
  4321 or 5434 is taken, rather than failing partway through an image build.
- **It starts from nothing, and proves it did.** The preflight removes any validation stack a killed
  run left behind and **asserts that removal succeeded** before an image is built. If it could not,
  the previous run's populated volume would still be there and the fixture assertions would be
  counting somebody else's rows, so the run stops with the redacted command failure instead.

### What survives, and what does not

- **`docker compose down` preserves your projects.** It removes the containers and the default
  network; the named `postgres_data` volume is untouched, and starting again finds everything where
  it was.
- **`docker compose down --volumes` is the destructive one.** It deletes the volume, and with it
  every project and file. CI's `docker` job passes `--volumes` in its cleanup step, which is
  correct there and only there: a runner is disposable by definition.
- **Restarting the database and API containers changes nothing**, because the data lives in the
  volume rather than in either container's writable layer. **C4 proves that rather than asserting
  it**: `pnpm test:restart` stops and starts both, redeploys the migration over the rows, and
  compares every field of a fixture it created through the API.

### What the API image carries

The runtime image holds compiled JavaScript for `apps/api`, `packages/database`, and — since C2 —
`packages/shared`, the generated Prisma Client compiled with the data layer, and the production
dependency trees for all three: `@prisma/client`, `@prisma/client-runtime-utils`,
`@prisma/adapter-pg`, `pg`, `zod`, and the Nest runtime. **It contains runtime dependencies only.**

It ships **no `.ts` source file at all** — `find /repo/apps /repo/packages -name '*.ts' ! -name
'*.d.ts'` returns nothing — no Nest CLI, no test runner, **no Prisma CLI, and no TypeScript
compiler**. No file named `tsc`, `prisma`, `nest`, `jest`, `vitest`, or `eslint` exists anywhere in
the image, and `node_modules/.pnpm` holds no `prisma@*` or `typescript@*` directory. No query engine
binary ships either, because the client reaches PostgreSQL through the `pg` driver adapter.

Verified inside the running container:

```bash
docker compose exec api node -e "console.log(require.resolve('@devsync/database'), require.resolve('@devsync/shared'))"
# /repo/packages/database/dist/index.js /repo/packages/shared/dist/index.js
```

Both workspace packages resolve to a `dist/index.js`, never to a `.ts` file. Zod resolves from
`packages/shared`, which is the only workspace that declares it; it is deliberately **not**
resolvable from `apps/api`, because the API depends on the contracts rather than on the validation
library.

### Why the production install declines optional dependencies

`@prisma/client` declares `prisma` and `typescript` as **optional peer dependencies**. Because
`packages/database` legitimately has both as devDependencies — it runs `prisma generate` and `tsc` —
pnpm resolves those peers and records them in the lockfile as `optionalDependencies` of the
`@prisma/client` snapshot:

```yaml
'@prisma/client@7.9.1(prisma@7.9.1(…)(typescript@5.9.3))(typescript@5.9.3)':
  dependencies:
    '@prisma/client-runtime-utils': 7.9.1
  optionalDependencies:
    prisma: 7.9.1(…)
    typescript: 5.9.3
```

`@prisma/client` is a **production** dependency, so `--prod` on its own installs that snapshot and
its optional edges with it. `--prod --no-optional` declines them, which is why the `prod-deps` stage
passes both flags.

It removes about 140 packages: the Prisma CLI and its schema engine, Prisma Studio and the React,
Radix, d3, and visx tree behind it, and the `mysql2`, `postgres`, and `pglite` drivers this project
does not use. The one other thing it drops is `pg-cloudflare`, a Cloudflare Workers socket shim that
`pg` loads inside a `try`/`catch` and never needs on Node — the container smoke test writes and
reads through Prisma without it.

The flag is scoped to the production install and to nothing else. `autoInstallPeers: false`
repository-wide was tested and changes nothing: the peers are _declared_ rather than missing, so
pnpm resolves them either way, and the recorded version key stays
`@prisma/client@7.9.1(prisma@…)(typescript@…)`. The development install must keep both packages,
because that is where they are used; the migration image must keep the CLI, because that is what it
runs. Neither is touched.

One existing detail became load-bearing in C1 and grew in C2. The `prod-deps` stage installs with
`--filter @devsync/api --filter @devsync/database --filter @devsync/shared`, naming all three
packages rather than using pnpm's `...` suffix. The suffix would pull in every workspace package on
a dependency edge of any kind, including the dev-only one to `@devsync/config`, and with it tens of
megabytes of TypeScript that nothing at runtime can resolve.

pnpm links `apps/api/node_modules/@devsync/database` and `…/@devsync/shared` to their packages, so
the runtime image copies each one's `dist`, its manifest, and its `node_modules` at their original
relative paths — the same reason the other `node_modules` trees keep theirs. `packages/shared`'s own
tree is where Zod is linked.

**The migration image is unchanged.** It carries the Prisma CLI, the schema, and the migrations, and
has no use for the request contracts.

## Current limitations

- **No cache, queue, message broker, or database administration UI exists**, in Compose or
  anywhere else. PostgreSQL is there because the API genuinely needs it; nothing else has earned
  a place yet, and an unused service would be scaffolding pretending to be architecture.
- **The API in a container is anonymous and published on a host port.** Anything that can reach
  3001 can read, rename, and permanently delete every project in the volume. CORS does not change
  that — it constrains browsers, not clients. That is acceptable on a developer's own machine and
  nowhere else; **do not expose these containers.**
- **The two application containers still do not talk to each other.** The browser talks to both:
  `web` serves the pages, and the JavaScript in them calls `api` directly. That is why the API URL is
  a host address rather than a service name, and it is why there is no proxy in the stack.
- **The stack must be opened at `http://127.0.0.1:3000`.** `localhost` is a different origin and the
  API allows exactly one.
- **No development-mode Compose setup.** There is no watch mode, no bind-mounted source, and no
  hot reload in Docker. `pnpm dev` remains the development loop; these images run production
  builds only.
- **Ports 3000 and 3001 are shared with local development**, so Docker and `pnpm dev` cannot
  run simultaneously. `WEB_HOST_PORT` and `API_HOST_PORT` can move the published side if you need
  them to, but the web image embeds the API address, so changing `API_HOST_PORT` means rebuilding it.
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
  `pnpm test:restart` drives containers **from outside**, as a Node script talking to the Docker
  CLI; nothing about it is installed into an image.
- **No backup, restore, replication, failover, or high availability exists.** One PostgreSQL, one
  volume, one API instance. C4 proves the volume outlives its containers and that a temporary
  outage is a controlled failure; it does not make the stack redundant, and nothing here is
  production-ready or safe to expose.

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
