# Continuous integration

What runs on GitHub Actions, what each job proves, and how to reproduce any of it locally.

The workflow was introduced in **Phase A4 — CI foundation**. Phase B needed no new job, step, or
secret; **C1 added one job and a PostgreSQL service to another**, because there is now a data layer
to exercise and an API that will not start without a database. C2 added no job. **C3 added no job
either**: it added one workflow-level environment variable, because `apps/web` no longer builds
without knowing where its API is, and two read-only verification steps to the `docker` job. There are
still four jobs, and still no CI-only script. **C4 added no job either**: `pnpm test:restart` runs as
one step of the existing `docker` job, which is where a command that needs a Docker daemon belongs.
**C5 added no job, step, or command, and changed nothing in the workflow.** What it corrected was
this document: it had claimed every official action was pinned to `@v7`, which is not a version
`actions/checkout` or `actions/setup-node` publishes. The workflow already referenced each action's
real current major; only the description of it was wrong. The inventory is
[below](#node-and-pnpm). **The one workflow change since is in the `docker` job's CORS step**, which
compared a header line as text and so failed on capitalisation the first time this workflow ever ran
— see [that step](#docker) and the limitation at the end.
CI adds no capability to DevSync; it runs the checks that already existed, on someone else's machine,
on every change. Every command in the workflow is one you can run yourself, which is the point — a
red run should never require reading CI internals to reproduce.

The single workflow lives in [`.github/workflows/ci.yml`](../.github/workflows/ci.yml).

## Triggers

| Trigger             | When                                   |
| ------------------- | -------------------------------------- |
| `pull_request`      | Every pull request, against any branch |
| `push`              | Pushes to `main` only                  |
| `workflow_dispatch` | Manually, from the Actions tab         |

Feature branches are validated through their pull request rather than on every push, so an
ordinary work-in-progress push does not burn a runner. `workflow_dispatch` exists so a run can
be triggered without inventing a commit.

### Permissions

```yaml
permissions:
  contents: read
```

Declared once at the workflow level, so every job inherits it. Nothing here comments on a pull
request, pushes a tag, publishes a package, or updates a branch, so no job is given a token that
could. There are **no secrets** in this workflow: nothing it does requires authenticating to
anything.

### Concurrency

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: true
```

One run at a time per pull request or branch. Pushing again cancels the older run instead of
queueing behind it, so the result you are shown always describes the newest commit.

## Jobs

Four jobs, running in parallel. **None of them depends on another**, and that is deliberate:
sharing a build between jobs would make the end-to-end and Docker jobs prove less than they
appear to, because each would then be exercising an artifact assembled elsewhere rather than the
workflow a developer or a production image actually follows. The cost is that dependencies are
installed more than once; the benefit is that each job is a complete, honest reproduction.

| Job        | Timeout | What it proves                                                                           |
| ---------- | ------- | ---------------------------------------------------------------------------------------- |
| `quality`  | 20 min  | The tree is formatted, lints, type-checks, passes its in-process tests, and builds       |
| `database` | 20 min  | The data layer **and** the API's routes against a real PostgreSQL, migration applied     |
| `e2e`      | 20 min  | Both applications start from a real build and answer in a real browser                   |
| `docker`   | 25 min  | Every image builds and becomes healthy, **and the data survives restarts and an outage** |

**`database` and `e2e` each run their own PostgreSQL** as a service container, on the same image
Compose pins and published on the same port, so `TEST_DATABASE_URL` is character-for-character the
value in `.env.example`. Nothing has to be translated between a local run and a CI run — which is
the same reason there is no CI-only script. Neither job sets `DATABASE_URL`: nothing in CI should
be able to reach a database that is not the disposable one it just started.

**`WEB_ORIGIN` is not set by any job**, and that is deliberate rather than an omission. The API's
PostgreSQL-backed suite sets it in `apps/api/tests/global-setup.mjs`, beside the database URL and for
the same reason — a run's configuration should not depend on what a developer's `.env` happens to
say — and the end-to-end suite passes it to the API process it starts. A runner has no `.env` at all,
so anything a job did not state is genuinely unset.

### `quality`

```text
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Each is a **separate workflow step**, so a red run names the gate that failed in the job summary
instead of making someone read a log to find out. Any non-zero exit fails the job immediately.

**`pnpm build` needs `NEXT_PUBLIC_API_URL` from C3**, because `apps/web` refuses to build without
knowing where its API is and a runner has no `.env`. It is set once at the workflow level, to the
same development value `.env.example` carries. The `e2e` job does not use it: `pnpm test:e2e` sets
the port that suite builds for, overriding whatever it inherits. **`pnpm test` still needs nothing** —
`apps/web`'s Vitest configuration supplies the value itself, which is what keeps the fast command
runnable on a machine with no environment at all.

`format:check` and `lint` are used, never `format` or `lint:fix`. CI reports on the tree; it
never rewrites it. A formatting violation is a failure to be fixed in a commit, not something
for a robot to paper over.

### `database`

Starts a PostgreSQL service container, installs dependencies, and runs `pnpm test:db` — the same
command a developer runs, against a database the job created and will throw away.

**That one command covers both persistence layers from C2**: the data layer's 57 database-backed
tests first, then the API's 110 HTTP tests against the real `AppModule` and the same database. They
run one after the other because they reset and rewrite the same schema, and the root script says so
with `&&` rather than leaving the order to Turborepo. No fifth job was added, and no CI-only command
exists — the step is still `pnpm test:db`.

**`packages/database`'s other 83 tests are not here.** They classify driver failures, need no
database and no generated client, and run in the `quality` job as part of `pnpm test`. Nothing runs
in both jobs.

Each suite drops the test schema and applies the committed migration before it runs, so a migration
that does not apply cleanly fails here rather than later, in the `docker` job. Both refuse to run at
all unless `TEST_DATABASE_URL` names `devsync_test` and differs from `DATABASE_URL`. In CI the
second condition is trivially met, because `DATABASE_URL` is never set — the API's suite sets it
itself, to the validated test target, after the gate has run.

### `e2e`

Starts the same PostgreSQL service container, installs dependencies, installs Chromium, then runs
`pnpm test:e2e` — the same command a developer runs, unchanged by C3. That command resets the
disposable database, builds both applications with `NEXT_PUBLIC_API_URL` pointing at port 4311,
starts them on 4310 and 4311, waits on HTTP readiness checks, and runs the five Playwright specs
serially.

**C3 is what makes this job worth the runner time.** Before it, the browser tests proved that each
application served correctly; now they create projects and files through the real interface, save
them, reload, and read them back — the only place in CI where the whole path from a keystroke to a
row and back is exercised. See [`testing.md`](testing.md) for what each spec asserts.

### `docker`

**No image build in this job uses the host toolchain.** Both images install and build everything they
need internally, and that self-containment is precisely the property under test. C4 added Node and
Corepack to the job — but only to _drive_ Docker: `pnpm test:restart` is a Node script with no
dependencies of its own, there is no `pnpm install` and no store cache in this job, and nothing that
builds an image reads anything from the host. The property is unchanged; what is new is a client for
the Docker API written in JavaScript.

```text
corepack enable, setup-node            # only to run `pnpm test:restart` below
docker compose config --quiet          # the Compose file is valid
docker compose build                   # every image builds from the repository root
docker compose up --detach --wait      # PostgreSQL, the migration, the API, then the web app
<verify database>                      # the health status is `healthy`
<verify migrate>                       # the one-shot service exited 0, with its log printed
<verify web>                           # HTTP 200, and the page identifies DevSync
<verify api>                           # the exact health payload
<verify projects>                      # GET /projects is 200 and a JSON array
<verify CORS>                          # the web origin is allowed and no other is
<verify web image>                     # the API URL is embedded, and no database value is
pnpm test:restart                      # C4, in its own Compose project — see below
```

The ordering in the third line is C3's: `web` waits for a healthy `api`, which waits for a healthy
database and a migration that exited 0.

`--wait` blocks until every service reports healthy and exits non-zero if one does not, so the
health checks already declared in `compose.yaml` are the gate. There is no fixed sleep anywhere.
`--wait-timeout 240` bounds it, so a service that never comes up fails promptly instead of
consuming the job timeout.

The two verification steps are ordinary `curl`:

```bash
status="$(curl --silent --show-error --max-time 10 --output /tmp/web.html --write-out '%{http_code}' http://127.0.0.1:3000/)"
[ "$status" = "200" ]
grep -q '<title>DevSync</title>' /tmp/web.html
grep -qE '<h1[^>]*>DevSync</h1>' /tmp/web.html

body="$(curl --fail --silent --show-error --max-time 10 http://127.0.0.1:3001/health)"
[ "$body" = '{"status":"ok","service":"devsync-api"}' ]
```

The API check is an **exact string comparison**, not a substring or a JSON subset match, so a
changed or extra field fails it.

C2 added one more, and deliberately kept it read-only:

```bash
status="$(curl --silent --show-error --max-time 10 --output /tmp/projects.json --write-out '%{http_code}' http://127.0.0.1:3001/projects)"
[ "$status" = "200" ]
grep -q '^\[' /tmp/projects.json
```

That reaches through the whole stack — the route exists, the API is talking to PostgreSQL, and the
migration created a table it can list — while **writing nothing**, so the job leaves no data behind
to clean up. Creating a project here to exercise more of the API would mean either deleting it in
the same step or letting the containers carry state between assertions, and neither buys anything
the `database` job has not already proved against a real database.

C3 added two more, on the same terms — both read-only, and neither needing a browser:

```bash
# the configured origin is allowed, exactly, and any other gets no header at all
curl -s -D - -o /dev/null -H 'Origin: http://127.0.0.1:3000' http://127.0.0.1:3001/projects
curl -s -D - -o /dev/null -H 'Origin: http://evil.example'   http://127.0.0.1:3001/projects

# the browser half of the same configuration, read out of the running web container
docker compose exec -T web sh -c "grep -rlF 'http://127.0.0.1:3001' /repo/apps/web/.next/static"
! docker compose exec -T web sh -c "grep -rqE 'postgres(ql)?://|DATABASE_URL' /repo/apps/web/.next"
```

**The header name is matched case-insensitively and only its value is compared.** HTTP header names
are case-insensitive and a server capitalises them however it likes; the step therefore parses the
value out with `awk` — using `tolower()`, which is POSIX and needs no gawk — instead of comparing the
header line as text. It also asserts that both requests were answered at all, so a `curl` that never
reached the API cannot satisfy the "no allow-origin header" half by returning nothing.

The first pair proves the running API read `WEB_ORIGIN` and enforces it — the fast Jest suite proves
the same policy against an application it configures itself, which is a different claim. The second
proves the API origin really was embedded at build time, and that **no database value reached the
image**. A **browser** flow is deliberately not run here: it would mean installing Chromium in the
Docker job, and the `e2e` job already drives one against the same code.

#### The C4 restart validation, in this job

```bash
pnpm test:restart
```

The same command a developer runs, and the only place in CI where a record is written, a process is
restarted, and a database is taken away underneath it. It belongs here rather than in a fifth job
because it needs a Docker daemon and nothing else — no Node build, no browser, no service container —
and this is the job that already has one.

Four properties keep it understandable:

- **It cannot see the stack running above it.** It brings its own up in the Compose project
  `devsync-c4-validation`, on ports 4321 and 5434, and refuses in code to issue a Compose command
  against any other project. The `devsync` containers, network, and volume that the steps above
  created are untouched, and the two stacks share no port.
- **It builds the `api` and `migrate` images a second time, and that costs almost nothing.**
  `docker compose build` has already put every layer in the BuildKit cache, so the rebuild under a
  different project name is a re-tag. The `web` image is not built at all, because no C4 scenario
  opens a page. Building twice under two names is the price of the isolation being real rather than
  arranged; the alternative — reusing the running stack — would mean stopping the containers the
  earlier steps just verified.
- **It reports its own failures.** The runner prints the scenario, the named invariant that did not
  hold, `docker compose ps --all` for its project, and the last 120 log lines, all redacted, before
  it exits non-zero. The job's own `if: failure()` step covers the `devsync` stack, which is a
  different subject.
- **It writes nothing to the repository**, exactly like every other step here. It creates rows in a
  database it created and deletes both.

On failure, a step guarded by `if: failure()` prints `docker compose ps --all` and
`docker compose logs --no-color` for the development project. It sits **before** the cleanup steps,
so the containers still exist to be read from.

Cleanup runs under `if: always()`, twice, once per project:

```bash
docker compose down --volumes --remove-orphans
docker compose --project-name devsync-c4-validation down --volumes --remove-orphans
```

Both therefore execute whether the job passed, failed at any verification step, or failed during
the build — a leaked container, network, or volume on a shared runner is a problem for the next job,
not just this one. The second is belt and braces: the restart runner removes its own project in a
`finally` path, and this covers the case where the runner itself was killed. A Compose command is
scoped to the project it names, so neither line can reach the other's stack.

**No image is pushed anywhere.** There is no registry, no login step, and no credential. The
images are built, exercised, and discarded.

## Node and pnpm

```yaml
env:
  NODE_VERSION: '24'
  COREPACK_ENABLE_DOWNLOAD_PROMPT: '0'
  TEST_DATABASE_URL: postgresql://devsync:devsync@127.0.0.1:5433/devsync_test
  NEXT_PUBLIC_API_URL: http://127.0.0.1:3001
```

Node 24 matches the `node:24.13.0-alpine` the production images pin and satisfies the
`>=20.9.0` floor in the root `package.json`. It is set once at the workflow level so the two
Node jobs cannot drift apart.

pnpm comes from **Corepack**, which reads the `packageManager` field in the root `package.json`
and installs exactly `pnpm@11.18.0`. No pnpm version is written into the workflow, so the
lockfile and CI can never disagree about which pnpm produced it, and bumping pnpm is a
one-line change to `package.json` rather than a two-place edit.

Step order matters here:

```yaml
- uses: actions/checkout@v6
- name: Enable Corepack
  run: corepack enable
- uses: actions/setup-node@v6
  with:
    node-version: ${{ env.NODE_VERSION }}
    cache: pnpm
```

`corepack enable` comes **before** `setup-node`, because `setup-node`'s pnpm cache resolves the
store by running `pnpm store path` — which needs the shim to already exist. Reversing these two
steps produces a "pnpm: command not found" failure inside the caching step.

`COREPACK_ENABLE_DOWNLOAD_PROMPT: '0'` stops Corepack asking for confirmation before it
downloads the pinned pnpm.

Only official `actions/*` actions are used, each pinned to a major version so patch and minor
fixes arrive without a workflow edit. **Each pin is that action's own current major, and they are
not all the same number** — the three repositories release independently, so a single version for
all of them would be a reference to something that does not exist:

| Action                    | Pin   | Used by                         |
| ------------------------- | ----- | ------------------------------- |
| `actions/checkout`        | `@v6` | all four jobs                   |
| `actions/setup-node`      | `@v6` | all four jobs                   |
| `actions/upload-artifact` | `@v7` | `e2e` only, and only on failure |

No floating tag and no branch reference is used, and nothing is pinned to a commit SHA — a major
is the level at which these actions promise compatibility. No third-party action is used anywhere;
where an official action does not exist, the workflow runs the command directly.

## Dependency caching

`actions/setup-node` with `cache: pnpm` caches the **pnpm content-addressable store**, keyed on
the hash of `pnpm-lock.yaml`. A run whose lockfile is unchanged restores the store instead of
re-downloading every package.

The cache holds the store, not `node_modules`. `pnpm install --frozen-lockfile` still runs on
every job and still fails if the lockfile disagrees with any manifest — caching makes it faster,
never optional.

**Playwright browsers are not cached.** Chromium is downloaded on every `e2e` run. Caching it
would need a key derived from the resolved Playwright version, and `--with-deps` installs system
packages through `apt` that a cache cannot restore anyway. This is a known cost, recorded under
limitations rather than optimised away with something fragile.

## Playwright browser installation

```bash
pnpm --filter @devsync/e2e exec playwright install --with-deps chromium
```

**Chromium only.** Firefox and WebKit are neither installed nor run, because no test uses them.

This differs from the local `pnpm test:e2e:install` in exactly one way: `--with-deps`. A GitHub
runner is a bare Ubuntu image without the shared libraries Chromium links against, and
`--with-deps` installs them through `apt`. A developer machine already has them, which is why
the local script omits a flag that would need root.

## Failure artifacts

When — and only when — the `e2e` job fails:

| Uploaded                       | Contents                                |
| ------------------------------ | --------------------------------------- |
| `tests/e2e/playwright-report/` | The HTML report                         |
| `tests/e2e/test-results/`      | Traces and screenshots for failed tests |

Retained for **7 days**, under the artifact name `playwright-report`, with
`if-no-files-found: ignore` so a job that failed before producing any output does not fail again
on the upload.

Nothing else is uploaded. `node_modules`, `.next`, `dist`, and the Docker build cache are large,
reproducible, and explain nothing about a failure. Both uploaded directories are git-ignored, so
no CI run can put a generated report into a commit.

Download them from the run's summary page, then open the report locally:

```bash
pnpm --filter @devsync/e2e exec playwright show-report path/to/downloaded/playwright-report
```

## Local equivalents

Every CI step maps to a command you already have. There is no CI-only script to learn.

| CI step                   | Locally                                                               |
| ------------------------- | --------------------------------------------------------------------- |
| Install dependencies      | `pnpm install --frozen-lockfile`                                      |
| Check formatting          | `pnpm format:check`                                                   |
| Lint                      | `pnpm lint`                                                           |
| Type-check                | `pnpm typecheck`                                                      |
| Test                      | `pnpm test`                                                           |
| Build                     | `pnpm build`                                                          |
| Start PostgreSQL          | `docker compose up -d database` (CI uses a service container)         |
| Run database tests        | `pnpm test:db`                                                        |
| Install Chromium          | `pnpm test:e2e:install` (CI adds `--with-deps`, see above)            |
| Run end-to-end tests      | `pnpm test:e2e`                                                       |
| Validate the Compose file | `docker compose config`                                               |
| Build images              | `docker compose build`                                                |
| Start and wait for health | `docker compose up --detach --wait`                                   |
| Verify the endpoints      | `curl http://127.0.0.1:3000/`, `…:3001/health`, and `…:3001/projects` |
| Verify CORS               | `curl -D - -H 'Origin: http://127.0.0.1:3000' …:3001/projects`        |
| Verify the web image      | `docker compose exec web sh -c "grep -rl … /repo/apps/web/.next"`     |
| Restart validation        | `pnpm test:restart`                                                   |
| Clean up                  | `docker compose down --volumes --remove-orphans`                      |

To reproduce a whole job in one go:

```bash
pnpm install --frozen-lockfile && pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

## Current limitations

- **Local validation does not replace a run of this workflow, and a pull request does not merge
  until all four jobs pass.** Running every command locally proves the commands; it does not prove
  the runner-specific part — service containers, their published ports, the health options attached
  to them, the `actions/*` majors resolving, and the Docker job under a Linux daemon rather than
  Docker Desktop. Phase C's pull-request runs demonstrated it three times: every failure was exposed
  by the workflow because neither the exact shell assertion nor the way a Linux daemon resolves a
  stopped container's name had been exercised locally before the pull request. Once each was isolated, both **were** reproduced
  locally — the CORS comparison directly, and each outage shape through a deterministic probe run
  inside the production image. What CI proved was not that the failures were unreachable from a
  developer's machine; it proved that nothing a developer had actually run would have reached them
  first.

  The **first** run: `quality`, `database`, and `e2e` passed, and `docker` reached the CORS step and
  failed on the **assertion** rather than on the behaviour — `grep -i` matched
  `Access-Control-Allow-Origin` and printed it unchanged, and the shell compared that, case
  sensitively, against a lower-cased literal. The API had sent exactly the right header. That step
  now compares the header **value** and matches the **name** case-insensitively.

  The **second** run got past that and failed inside C4's restart validation, on the
  database-outage scenario, on a **real defect**: the first persistence request after PostgreSQL
  stopped answered `500 INTERNAL_ERROR` where the contract says `503 DATABASE_UNAVAILABLE`. **C4's
  container-level scenario is the layer that caught it** — earlier local runs of it had passed
  because Docker Desktop resolves a stopped service differently from a Linux runner.

  The **third** run failed the same way, which is the part worth recording. The first fix addressed
  a real shape — PostgreSQL reporting `57P01` under a live pool, published by the adapter under
  `meta.driverAdapterError.cause` — but not the shape CI was hitting. `@prisma/adapter-pg` converts
  only four socket codes and rethrows every other system error untouched, and Prisma turns any error
  carrying a string `code` into a known request error **whose code is that operating-system code and
  whose metadata holds nothing but the model name**. On a Linux runner, resolving a stopped
  container's service name fails with `EAI_AGAIN`, so there was no metadata to search. Both shapes
  were then captured from the production image, the CI one reproduced deterministically against a
  black-holed resolver, and the classifier rewritten to read the **whole exception** rather than one
  property of it. 83 pure tests hold it in `pnpm test` so the rule no longer depends on a container
  to be checked. **Do not describe a Phase C workflow run as green until the corrected commit has
  actually completed one.**

- **No branch protection is configured**, so a failing run does not yet block a merge. That is a
  repository setting rather than a file, and it is not something this milestone can add.
- **Playwright browsers are downloaded on every `e2e` run** — roughly 300 MB and a minute or so.
  See the caching section for why it is not cached yet.
- **Dependencies are installed three times**, in `quality`, `database`, and `e2e`, because the jobs
  are independent by design. The pnpm store cache absorbs most of the cost. The `docker` job installs
  none: `pnpm test:restart` has no dependencies of its own.
- **The `api` and `migrate` images are built twice in the `docker` job**, once under each Compose
  project name. Every layer is cached from the first build, so what the second costs is a re-tag —
  the alternative would be running the restart validation against the stack the earlier steps
  verified, which would mean stopping those containers and would make the two sets of assertions
  interfere.
- **Ubuntu only.** Nothing validates that the repository works on Windows or macOS, even though
  it is developed on Windows. A build matrix is deliberately not added for two applications with
  no platform-specific code.
- **Chromium only**, matching the test suite. No cross-browser coverage exists to run.
- **No coverage is reported or uploaded.** `pnpm test:coverage` exists and works locally, but
  there is no coverage service, badge, or threshold — and, as `testing.md` explains, no body of
  application logic yet worth holding to one.
- **No release automation, no dependency bot, no deployment.** No publishing, tagging,
  changelog, Dependabot, Renovate, or environment of any kind. CI validates; it does not ship.
- **No caching of Docker layers between runs.** Each `docker` job builds both images from
  scratch, which is slower but removes any question of a stale layer masking a broken build.
