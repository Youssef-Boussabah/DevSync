# Continuous integration

What runs on GitHub Actions, what each job proves, and how to reproduce any of it locally.

The workflow was introduced in **Phase A4 — CI foundation** and is unchanged at **Phase B
complete**: the local editor needed no new job, step, or secret. CI adds no capability to DevSync;
it runs the checks that already existed, on someone else's machine, on every change. Every
command in the workflow is one you can run yourself, which is the point — a red run should never
require reading CI internals to reproduce.

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

Three jobs, running in parallel. **None of them depends on another**, and that is deliberate:
sharing a build between jobs would make the end-to-end and Docker jobs prove less than they
appear to, because each would then be exercising an artifact assembled elsewhere rather than the
workflow a developer or a production image actually follows. The cost is that dependencies are
installed more than once; the benefit is that each job is a complete, honest reproduction.

| Job       | Timeout | What it proves                                                                     |
| --------- | ------- | ---------------------------------------------------------------------------------- |
| `quality` | 20 min  | The tree is formatted, lints, type-checks, passes its in-process tests, and builds |
| `e2e`     | 20 min  | Both applications start from a real build and answer in a real browser             |
| `docker`  | 25 min  | Both production images build, start, become healthy, and serve correctly           |

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

`format:check` and `lint` are used, never `format` or `lint:fix`. CI reports on the tree; it
never rewrites it. A formatting violation is a failure to be fixed in a commit, not something
for a robot to paper over.

### `e2e`

Installs dependencies, installs Chromium, then runs `pnpm test:e2e`. That Turborepo task builds
both applications first, starts them on ports 4310 and 4311, waits on HTTP readiness checks, and
runs the three Playwright specs. See [`testing.md`](testing.md) for what those specs assert.

### `docker`

Uses **no Node and no pnpm setup at all**. Both images install and build everything they need
internally, and that self-containment is precisely the property under test — a Docker job that
depended on a host toolchain would not be testing the images.

```text
docker compose config --quiet          # the Compose file is valid
docker compose build                   # both images build from the repository root
docker compose up --detach --wait      # both start and report healthy
<verify web>                           # HTTP 200, and the page identifies DevSync
<verify api>                           # the exact health payload
```

`--wait` blocks until every service reports healthy and exits non-zero if one does not, so the
health checks already declared in `compose.yaml` are the gate. There is no fixed sleep anywhere.
`--wait-timeout 180` bounds it, so a service that never comes up fails promptly instead of
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

On failure, a step guarded by `if: failure()` prints `docker compose ps --all` and
`docker compose logs --no-color`. It sits **before** the cleanup step, so the containers still
exist to be read from.

Cleanup runs under `if: always()`:

```bash
docker compose down --volumes --remove-orphans
```

It therefore executes whether the job passed, failed at any verification step, or failed during
the build — a leaked container or network on a shared runner is a problem for the next job, not
just this one.

**No image is pushed anywhere.** There is no registry, no login step, and no credential. The
images are built, exercised, and discarded.

## Node and pnpm

```yaml
env:
  NODE_VERSION: '24'
  COREPACK_ENABLE_DOWNLOAD_PROMPT: '0'
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
- uses: actions/checkout@v7
- name: Enable Corepack
  run: corepack enable
- uses: actions/setup-node@v7
  with:
    node-version: ${{ env.NODE_VERSION }}
    cache: pnpm
```

`corepack enable` comes **before** `setup-node`, because `setup-node`'s pnpm cache resolves the
store by running `pnpm store path` — which needs the shim to already exist. Reversing these two
steps produces a "pnpm: command not found" failure inside the caching step.

`COREPACK_ENABLE_DOWNLOAD_PROMPT: '0'` stops Corepack asking for confirmation before it
downloads the pinned pnpm.

Only official `actions/*` actions are used — `checkout`, `setup-node`, and `upload-artifact` —
each pinned to a major version (`@v7`) so patch and minor fixes arrive without a workflow edit.
No third-party action is used anywhere; where an official action does not exist, the workflow
runs the command directly.

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
| Install Chromium          | `pnpm test:e2e:install` (CI adds `--with-deps`, see above)            |
| Run end-to-end tests      | `pnpm test:e2e`                                                       |
| Validate the Compose file | `docker compose config`                                               |
| Build images              | `docker compose build`                                                |
| Start and wait for health | `docker compose up --detach --wait`                                   |
| Verify the endpoints      | `curl http://127.0.0.1:3000/` and `curl http://127.0.0.1:3001/health` |
| Clean up                  | `docker compose down --volumes --remove-orphans`                      |

To reproduce a whole job in one go:

```bash
pnpm install --frozen-lockfile && pnpm format:check && pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

## Current limitations

- **This workflow has not yet been observed running on GitHub.** It was validated with
  `actionlint` (0 errors, including the shell in every `run:` block) and every command in it has
  been run locally against the current commit. The first run against a real pull request is the
  first genuine proof.
- **No branch protection is configured**, so a failing run does not yet block a merge. That is a
  repository setting rather than a file, and it is not something this milestone can add.
- **Playwright browsers are downloaded on every `e2e` run** — roughly 300 MB and a minute or so.
  See the caching section for why it is not cached yet.
- **Dependencies are installed twice**, once in `quality` and once in `e2e`, because the jobs are
  independent by design. The pnpm store cache absorbs most of the cost.
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
