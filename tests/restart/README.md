# @devsync/restart

C4's proof that saved project and file data survives a restart. This is the only layer that builds
production images, stops and starts containers, and takes a database away from a running service.

```bash
pnpm test:restart   # from the repository root; needs Docker Engine and the Compose plugin
```

## What one run does

One fixture — a project and two files, created through the public HTTP routes and through nothing
else — carried through six scenarios in sequence:

1. **Start.** PostgreSQL, the one-shot `migrate` service, and the API come up from the real
   production images. The API is held until the migration has exited 0, as it is in production.
2. **Seed and baseline.** Every field of the project and of both files is read back and recorded.
   Nothing mutates anything afterwards, which is what lets every later comparison be exact.
3. **API restart.** The API container is stopped, confirmed stopped, and started again. The fixture
   is compared field by field, and the container's PID is asserted to have changed — otherwise the
   scenario would pass against a process that never went away.
4. **Database outage.** PostgreSQL is stopped with the API left running. `GET /projects/:projectId`
   must answer `503 DATABASE_UNAVAILABLE`, within a bounded timeout, twice, with a body carrying
   exactly `statusCode`, `code`, and `message` and no stack, SQL, ORM name, driver error code, table
   name, or connection string. `GET /health` must still answer, and the API's PID must be unchanged.
5. **Recovery.** PostgreSQL is started again and **the API is not restarted**. The persistence route
   is polled until it succeeds, and the PID is asserted to be the same one throughout — so what
   recovered is the same process and the same connection pool.
6. **Migration over existing rows.** `docker compose run --rm migrate` redeploys the committed
   migration against the populated volume. It must exit 0, and the fixture must still be identical.

A final check confirms the API runtime image still carries no Prisma CLI and no TypeScript compiler.

## Isolation

Everything happens in the Compose project **`devsync-c4-validation`**, on host ports **4321** (API),
**5434** (PostgreSQL), and 4320 (web, which is never built or started). It has its own network and
its own `devsync-c4-validation_postgres_data` volume, and the run removes all three in a `finally`
path — including after a failure, and after `Ctrl+C`.

The isolation is enforced in code rather than described in a comment:

- `lib/docker.mjs` passes every Compose invocation's project name through `assertValidationProject`,
  so a command against `devsync` cannot be issued at all.
- Before the cleanup deletes anything, `assertDisposableVolumes` reads the volumes Docker itself
  labels as belonging to this project and refuses the batch if a single name falls outside the
  `devsync-c4-validation_` prefix.
- After the cleanup, `assertDevelopmentVolumesUntouched` proves the `devsync` project's volumes are
  exactly as they were found.

`docker compose down --volumes` is never run against the development project.

## Layout

| Path                               | What it is                                                     |
| ---------------------------------- | -------------------------------------------------------------- |
| `tools/run-restart-validation.mjs` | The scenario, in order, with every invariant named             |
| `lib/support.mjs`                  | The pure half: guards, redaction, bounded waiting, comparison  |
| `lib/docker.mjs`                   | Compose and `docker inspect`, scoped to the validation project |
| `lib/api.mjs`                      | The bounded HTTP client and the resource-shape assertions      |
| `tests/support.test.ts`            | Vitest over `lib/support.mjs`, in `pnpm test`                  |

`lib/support.d.mts` carries the types, because the runner is plain JavaScript run as a command with
no compile step in front of it — the same arrangement `packages/database/tools` uses.

**The Vitest suite does not mock Docker, and must not.** It covers the rules the run is built from:
what may be deleted, what may be printed, what counts as "the record survived", and how a bounded
wait decides it has run out of time. A suite that simulated a container could report that restart
persistence works without one ever having existed. The real run is the proof.

## No fixed sleeps

Every wait names a condition and gives it a deadline: a container's health status, a stopped state,
an HTTP answer, a migration's exit code. A wait that runs out says what it was waiting for, how many
times it looked, and what it saw last. Nothing anywhere in this workspace sleeps for a guessed
interval and calls the result readiness.

[`docs/testing.md`](../../docs/testing.md) is the full description of how this layer sits beside the
other six.
