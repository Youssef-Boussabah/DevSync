// @ts-check

// C4 — persistence and restart validation.
//
//   pnpm test:restart
//
// The milestone's claim is that saved project and file data survives the things
// C3 never exercised, and this is the run that proves it rather than asserting
// it. One fixture, six scenarios, in one sequence:
//
//   1. A stack of the real production images comes up: PostgreSQL, the one-shot
//      migration, and the API.
//   2. One project and two files are created through the public HTTP routes, and
//      every field of every resource is recorded as the baseline.
//   3. The API container is stopped and started. The fixture is compared again,
//      field by field.
//   4. PostgreSQL is stopped with the API left running. A persistence route must
//      answer `503 DATABASE_UNAVAILABLE`, promptly, with nothing in the body
//      about how the service is built — and the API process must survive it.
//   5. PostgreSQL comes back. The **same** API process, with the **same**
//      connection pool, must recover on its own, and the fixture must be intact.
//   6. The committed migration is redeployed over the populated database through
//      the real `migrate` service, and the fixture must be intact again.
//
// Two rules run through all of it.
//
// **Everything happens in the `devsync-c4-validation` Compose project** — its own
// containers, network, volume, and host ports. `lib/docker.mjs` refuses to issue
// a Compose command against any other project, and the cleanup refuses to delete
// a volume Docker does not label as this one's. The stack a developer works in
// cannot be reached from here.
//
// **Nothing waits on a fixed delay.** Every wait names a condition — a health
// status, a stopped container, an HTTP answer — and gives it a deadline.

import {
  DEVELOPMENT_PROJECT_NAME,
  TimeoutError,
  VALIDATION_HOST_PORTS,
  VALIDATION_PROJECT_NAME,
  assertCommandSucceeded,
  assertDevelopmentVolumesUntouched,
  assertExactKeys,
  assertNoSensitiveContent,
  compareRecords,
  describeCommandResult,
  redact,
  runLabel,
  waitFor,
} from '../lib/support.mjs';
import {
  compose,
  composeVersion,
  containerIdFor,
  containerState,
  isPortFree,
  projectContainers,
  projectVolumes,
  requireDocker,
  tearDownValidationStack,
} from '../lib/docker.mjs';
import {
  assertFileResource,
  assertProjectDetailResource,
  assertProjectResource,
  createApiClient,
} from '../lib/api.mjs';

/**
 * Everything recorded about the fixture before anything was restarted.
 *
 * @typedef {object} Fixture
 * @property {string} label
 * @property {string} projectId
 * @property {string} starterFileId
 * @property {string} extraFileId
 * @property {Record<string, unknown>} project
 * @property {Record<string, unknown>} starterFile
 * @property {Record<string, unknown>} extraFile
 */

// --- Bounds ------------------------------------------------------------------
//
// Every one of these is a maximum, never a delay. Generous, because a first run
// builds an image on a cold cache; a healthy run reaches its condition in a
// fraction of each.

const IMAGE_BUILD_TIMEOUT_MS = 1_200_000;
const DATABASE_START_TIMEOUT_MS = 240_000;
const STACK_START_TIMEOUT_MS = 420_000;
const API_READY_TIMEOUT_MS = 180_000;
const CONTAINER_STOP_TIMEOUT_MS = 90_000;
const OUTAGE_REQUEST_TIMEOUT_MS = 20_000;
const RECOVERY_TIMEOUT_MS = 180_000;
const MIGRATION_TIMEOUT_MS = 300_000;
const POLL_INTERVAL_MS = 1_000;

const API_BASE_URL = `http://127.0.0.1:${VALIDATION_HOST_PORTS.api}`;

/** The health payload the rest of the system already waits on. */
const HEALTH_BODY = '{"status":"ok","service":"devsync-api"}';

const api = createApiClient(API_BASE_URL);

// --- Output ------------------------------------------------------------------
//
// ASCII only, and everything through `redact`, so a log pasted into an issue
// carries no connection string and reads the same in PowerShell as in CI.

let scenarioNumber = 0;

/** @type {string[]} */
const proofs = [];

/** @param {string} title */
function scenario(title) {
  scenarioNumber += 1;
  process.stdout.write(`\n[${scenarioNumber}] ${title}\n`);
}

/** @param {string} message */
function note(message) {
  process.stdout.write(`    ${redact(message)}\n`);
}

/** @param {string} message */
function proved(message) {
  proofs.push(message);
  process.stdout.write(`    OK  ${redact(message)}\n`);
}

/** A failed invariant, named so a failure report can quote it. */
class InvariantError extends Error {
  /**
   * @param {string} invariant
   * @param {string} detail
   */
  constructor(invariant, detail) {
    super(`${invariant}\n    ${detail}`);
    this.name = 'InvariantError';
    this.invariant = invariant;
  }
}

/**
 * Asserts one invariant of the milestone. The description is written as the
 * property that must hold, so a failure reads as the thing C4 could not prove.
 *
 * @param {boolean} condition
 * @param {string} invariant
 * @param {string} [detail]
 * @returns {void}
 */
function must(condition, invariant, detail = 'no further detail') {
  if (!condition) {
    throw new InvariantError(invariant, detail);
  }
}

// --- Preflight ---------------------------------------------------------------

/** Development volumes as they were found, so the run can prove it left them alone. */
let developmentVolumesBefore = /** @type {string[]} */ ([]);

/**
 * Proves Docker is there, clears anything a killed run left behind, and checks
 * the validation ports are free before a single image is built.
 *
 * @returns {Promise<void>}
 */
async function preflight() {
  scenario('Preflight: Docker, isolation, and free ports');

  const engine = await requireDocker();
  note(`Docker Engine ${engine}, Compose ${await composeVersion()}`);
  note(`Compose project: ${VALIDATION_PROJECT_NAME}`);
  note(
    `Host ports: api ${VALIDATION_HOST_PORTS.api}, postgres ${VALIDATION_HOST_PORTS.postgres}, ` +
      `web ${VALIDATION_HOST_PORTS.web} (the web service is never built or started)`,
  );

  developmentVolumesBefore = await projectVolumes(DEVELOPMENT_PROJECT_NAME);
  note(
    developmentVolumesBefore.length === 0
      ? `No "${DEVELOPMENT_PROJECT_NAME}" volumes exist on this machine.`
      : `"${DEVELOPMENT_PROJECT_NAME}" volumes present and out of bounds: ${developmentVolumesBefore.join(', ')}`,
  );

  // A run killed between `up` and its cleanup would otherwise leave a populated
  // volume behind, and the assertions below count rows.
  //
  // The exit code is asserted rather than discarded, because a removal that failed
  // leaves exactly that populated volume in place: the run would go on to build
  // images, start a stack over stale data, and fail several minutes later on "the
  // validation database holds exactly one project" — a symptom that says nothing
  // about the cause. Stopping here says it.
  const leftovers = await projectContainers(VALIDATION_PROJECT_NAME);

  if (leftovers.length > 0) {
    note(`Removing ${leftovers.length} container(s) left behind by an earlier run.`);
  }

  assertCommandSucceeded(
    'Removing a validation stack left behind by an earlier run',
    await tearDownValidationStack(),
  );

  for (const [service, port] of Object.entries(VALIDATION_HOST_PORTS)) {
    if (service === 'web') {
      continue;
    }

    must(
      await isPortFree(port),
      `host port ${port} is free for the validation stack`,
      `Something is already listening on 127.0.0.1:${port}. The validation stack publishes ` +
        `${service} there so it cannot collide with development.`,
    );
  }

  proved('The validation project starts from nothing, on ports development does not use.');
}

// --- Bringing the stack up ---------------------------------------------------

/**
 * @returns {Promise<{
 *   apiContainerId: string,
 *   databaseContainerId: string,
 *   apiPid: number,
 *   apiStartedAt: string,
 * }>}
 */
async function startStack() {
  scenario('Start the isolated stack: PostgreSQL, the migration, and the API');

  note('Building the api and migrate images (the web image is not built).');
  assertCommandSucceeded(
    'Building the validation images',
    await compose(['build', 'api', 'migrate'], { timeoutMs: IMAGE_BUILD_TIMEOUT_MS, stream: true }),
  );

  note('Starting PostgreSQL and waiting on its own health check.');
  assertCommandSucceeded(
    'Starting the database service',
    await compose(['up', '--detach', '--wait', '--wait-timeout', '180', 'database'], {
      timeoutMs: DATABASE_START_TIMEOUT_MS,
      stream: true,
    }),
  );

  const databaseContainerId = await requireContainer('database');
  await waitForContainerHealth(databaseContainerId, 'database', DATABASE_START_TIMEOUT_MS);

  // Compose holds `api` until `migrate` has exited successfully, so this one
  // command also exercises the ordering the production stack relies on.
  note('Starting the API, which Compose holds until the one-shot migration exits 0.');
  assertCommandSucceeded(
    'Starting the API service',
    await compose(['up', '--detach', 'api'], { timeoutMs: STACK_START_TIMEOUT_MS, stream: true }),
  );

  const migrateState = await containerState(await requireContainer('migrate'));

  must(
    migrateState.Running === false && migrateState.ExitCode === 0,
    'the one-shot migration exited 0 before the API started',
    `migrate: status ${migrateState.Status}, exit code ${migrateState.ExitCode}`,
  );

  const apiContainerId = await requireContainer('api');
  await waitForContainerHealth(apiContainerId, 'api', API_READY_TIMEOUT_MS);
  await waitForApiHealth();

  const apiState = await containerState(apiContainerId);

  proved(
    'The committed migration applied to an empty database and the API became healthy over it, ' +
      'without migrating from its own startup.',
  );

  return {
    apiContainerId,
    databaseContainerId,
    apiPid: apiState.Pid,
    apiStartedAt: apiState.StartedAt,
  };
}

/**
 * @param {string} service
 * @returns {Promise<string>}
 */
async function requireContainer(service) {
  const id = await containerIdFor(service);

  must(
    id !== null,
    `the ${service} container exists in the validation project`,
    `docker compose ps returned no container for "${service}".`,
  );

  return /** @type {string} */ (id);
}

/**
 * @param {string} containerId
 * @param {string} service
 * @param {number} timeoutMs
 * @returns {Promise<void>}
 */
async function waitForContainerHealth(containerId, service, timeoutMs) {
  await waitFor(
    `the ${service} container to report healthy`,
    async () => {
      const state = await containerState(containerId);
      const health = state.Health?.Status ?? 'none';

      return { ok: health === 'healthy', detail: `status ${state.Status}, health ${health}` };
    },
    { timeoutMs, intervalMs: POLL_INTERVAL_MS },
  );

  note(`${service}: healthy`);
}

/**
 * The readiness condition, and the same endpoint Compose's health check uses.
 *
 * @param {number} [timeoutMs]
 * @returns {Promise<void>}
 */
async function waitForApiHealth(timeoutMs = API_READY_TIMEOUT_MS) {
  await waitFor(
    `GET /health to answer ${HEALTH_BODY}`,
    async () => {
      const response = await api.request('GET', '/health', { timeoutMs: 5_000 });

      return {
        ok: response.status === 200 && response.text.trim() === HEALTH_BODY,
        detail: response.failure ?? `HTTP ${response.status} ${response.text.trim().slice(0, 80)}`,
      };
    },
    { timeoutMs, intervalMs: POLL_INTERVAL_MS },
  );
}

// --- The fixture -------------------------------------------------------------

/**
 * Creates one project and one extra file through the public routes, then records
 * every field of both files and of the project as the baseline.
 *
 * The project's `updatedAt` moves when a file in it changes, so the baseline is
 * taken **after** the second file exists. Nothing mutates anything afterwards,
 * which is what lets every later comparison be exact rather than approximate.
 *
 * @returns {Promise<Fixture>}
 */
async function seedFixture() {
  scenario('Seed one fixture through the public API');

  const label = runLabel(new Date(), Math.random().toString(36).slice(2, 8));
  const projectName = `C4 restart validation ${label}`;
  const extraFileName = `restart-${label}.md`;
  const extraFileContent = [
    '# C4 persistence fixture',
    '',
    `Run: ${label}`,
    '',
    'Exactness matters here, so this file carries characters a careless round trip loses:',
    'unicode (café, 日本語, ✓), quotes ("double", \'single\', `backtick`), a backslash \\,',
    'a tab\tbetween words, and a trailing blank line below.',
    '',
  ].join('\n');

  const created = await api.request('POST', '/projects', { body: { name: projectName } });

  must(
    created.status === 201,
    'POST /projects creates the fixture project',
    created.failure ?? `HTTP ${created.status}: ${created.text.slice(0, 200)}`,
  );

  const detail = assertProjectDetailResource('the created project', created.json);
  const files = /** @type {Record<string, unknown>[]} */ (detail.files);

  must(
    files.length === 1,
    'a new project is created with exactly one starter file',
    `the create response listed ${files.length} files`,
  );

  const projectId = String(detail.id);
  const starterFileId = String(files[0]?.id);

  const addedFile = await api.request('POST', `/projects/${projectId}/files`, {
    body: { name: extraFileName, language: 'markdown', content: extraFileContent },
  });

  must(
    addedFile.status === 201,
    'POST /projects/:projectId/files creates the second file',
    addedFile.failure ?? `HTTP ${addedFile.status}: ${addedFile.text.slice(0, 200)}`,
  );

  const extraFile = assertFileResource('the created file', addedFile.json);

  must(
    extraFile.language === 'markdown' && extraFile.content === extraFileContent,
    'the second file is stored with a non-default language and its exact content',
    `language ${String(extraFile.language)}, content length ${String(extraFile.content).length}`,
  );

  const extraFileId = String(extraFile.id);
  const baseline = await readFixture({ projectId, starterFileId, extraFileId });

  note(`project     ${projectId}  "${projectName}"`);
  note(
    `starter     ${starterFileId}  "${String(baseline.starterFile.name)}" ` +
      `(${String(baseline.starterFile.language)}, ${String(baseline.starterFile.content).length} chars)`,
  );
  note(
    `additional  ${extraFileId}  "${extraFileName}" ` +
      `(markdown, ${extraFileContent.length} chars)`,
  );
  proved(
    'A project and two files were created through public HTTP routes only, and every field of ' +
      'each was read back and recorded as the baseline.',
  );

  return { label, projectId, starterFileId, extraFileId, ...baseline };
}

/**
 * Reads the whole fixture back, checking the shape of everything that comes out
 * and that nothing else exists alongside it.
 *
 * @param {{ projectId: string, starterFileId: string, extraFileId: string }} ids
 * @returns {Promise<{
 *   project: Record<string, unknown>,
 *   starterFile: Record<string, unknown>,
 *   extraFile: Record<string, unknown>,
 * }>}
 */
async function readFixture({ projectId, starterFileId, extraFileId }) {
  const list = await api.request('GET', '/projects');

  must(
    list.status === 200 && Array.isArray(list.json),
    'GET /projects answers a JSON array',
    list.failure ?? `HTTP ${list.status}: ${list.text.slice(0, 200)}`,
  );

  const projects = /** @type {unknown[]} */ (list.json);

  must(
    projects.length === 1,
    'the validation database holds exactly one project',
    `GET /projects returned ${projects.length}. More than one means a duplicate was created or ` +
      'an earlier run left data behind.',
  );

  const listed = assertProjectResource('GET /projects[0]', projects[0]);

  must(
    listed.id === projectId,
    'the listed project is the fixture',
    `expected ${projectId}, saw ${String(listed.id)}`,
  );

  const detailResponse = await api.request('GET', `/projects/${projectId}`);

  must(
    detailResponse.status === 200,
    'GET /projects/:projectId answers the fixture project',
    detailResponse.failure ?? `HTTP ${detailResponse.status}: ${detailResponse.text.slice(0, 200)}`,
  );

  const detail = assertProjectDetailResource('GET /projects/:projectId', detailResponse.json);
  const summaries = /** @type {Record<string, unknown>[]} */ (detail.files);

  must(
    summaries.length === 2,
    'the fixture project holds exactly its two files',
    `the project listed ${summaries.length} files: ${summaries.map((file) => String(file.name)).join(', ')}`,
  );

  const seen = summaries.map((file) => String(file.id)).sort();
  const expected = [starterFileId, extraFileId].sort();

  must(
    seen.join(',') === expected.join(','),
    'no unexpected file exists in the fixture project',
    `expected ${expected.join(', ')}, saw ${seen.join(', ')}`,
  );

  return {
    // The files are compared as their own full resources below, so the project is
    // compared as its own four fields and nothing else.
    project: {
      id: detail.id,
      name: detail.name,
      createdAt: detail.createdAt,
      updatedAt: detail.updatedAt,
    },
    starterFile: await readFile(projectId, starterFileId, 'the starter file'),
    extraFile: await readFile(projectId, extraFileId, 'the additional file'),
  };
}

/**
 * @param {string} projectId
 * @param {string} fileId
 * @param {string} label
 * @returns {Promise<Record<string, unknown>>}
 */
async function readFile(projectId, fileId, label) {
  const response = await api.request('GET', `/projects/${projectId}/files/${fileId}`);

  must(
    response.status === 200,
    `GET /projects/:projectId/files/:fileId answers ${label}`,
    response.failure ?? `HTTP ${response.status}: ${response.text.slice(0, 200)}`,
  );

  return assertFileResource(label, response.json);
}

/**
 * The exact comparison: every field of the project and of both files, byte for
 * byte, against what was recorded before anything was restarted.
 *
 * @param {Fixture} baseline
 * @param {string} occasion
 * @returns {Promise<void>}
 */
async function assertFixtureIntact(baseline, occasion) {
  const current = await readFixture(baseline);

  const differences = [
    ...compareRecords('project', baseline.project, current.project),
    ...compareRecords('starter file', baseline.starterFile, current.starterFile),
    ...compareRecords('additional file', baseline.extraFile, current.extraFile),
  ];

  must(
    differences.length === 0,
    `every recorded field is unchanged ${occasion}`,
    differences.join('\n    '),
  );

  proved(`Identifiers, names, languages, contents, and both timestamps are unchanged ${occasion}.`);
}

// --- Scenario: the API restarts ----------------------------------------------

/**
 * @param {Fixture} baseline
 * @param {{ apiContainerId: string, apiPid: number, apiStartedAt: string }} before
 * @returns {Promise<{ apiPid: number }>}
 */
async function scenarioApiRestart(baseline, before) {
  scenario('Restart the API container');

  assertCommandSucceeded('Stopping the API', await compose(['stop', 'api'], { timeoutMs: 90_000 }));

  await waitFor(
    'the API container to report stopped',
    async () => {
      const state = await containerState(before.apiContainerId);

      return { ok: state.Running === false, detail: `status ${state.Status}` };
    },
    { timeoutMs: CONTAINER_STOP_TIMEOUT_MS, intervalMs: POLL_INTERVAL_MS },
  );

  note('The API container is stopped; PostgreSQL and its volume were not touched.');

  assertCommandSucceeded(
    'Starting the API',
    await compose(['start', 'api'], { timeoutMs: 90_000 }),
  );

  await waitForContainerHealth(before.apiContainerId, 'api', API_READY_TIMEOUT_MS);
  await waitForApiHealth();

  const after = await containerState(before.apiContainerId);

  must(
    after.Pid !== before.apiPid,
    'the API is a genuinely new process rather than one that never stopped',
    `pid before ${before.apiPid}, pid after ${after.Pid}`,
  );

  must(
    after.StartedAt !== before.apiStartedAt,
    'the API container reports a new start time',
    `started before ${before.apiStartedAt}, started after ${after.StartedAt}`,
  );

  note(`API restarted: pid ${before.apiPid} -> ${after.Pid}`);

  await assertFixtureIntact(baseline, 'after the API restart');

  return { apiPid: after.Pid };
}

// --- Scenario: PostgreSQL goes away ------------------------------------------

/**
 * @param {Fixture} baseline
 * @param {{ apiContainerId: string, databaseContainerId: string, apiPid: number }} context
 * @returns {Promise<void>}
 */
async function scenarioDatabaseOutage(baseline, context) {
  scenario('Stop PostgreSQL with the API still running');

  assertCommandSucceeded(
    'Stopping PostgreSQL',
    await compose(['stop', 'database'], { timeoutMs: 90_000 }),
  );

  await waitFor(
    'the PostgreSQL container to report stopped',
    async () => {
      const state = await containerState(context.databaseContainerId);

      return { ok: state.Running === false, detail: `status ${state.Status}` };
    },
    { timeoutMs: CONTAINER_STOP_TIMEOUT_MS, intervalMs: POLL_INTERVAL_MS },
  );

  note('PostgreSQL is stopped. The API was not touched.');

  const first = await requestDuringOutage(baseline.projectId, 'the first request');
  const second = await requestDuringOutage(baseline.projectId, 'the second request');

  note(
    `Slowest of the two: ${Math.max(first, second)} ms, inside the ` +
      `${OUTAGE_REQUEST_TIMEOUT_MS} ms bound.`,
  );

  // `/health` says nothing about the database, so the API must still answer it
  // while the database is gone — which is what "still reachable" means here.
  const health = await api.request('GET', '/health', { timeoutMs: OUTAGE_REQUEST_TIMEOUT_MS });

  must(
    health.status === 200 && health.text.trim() === HEALTH_BODY,
    'the API is still reachable during the outage',
    health.failure ?? `HTTP ${health.status}: ${health.text.slice(0, 120)}`,
  );

  const state = await containerState(context.apiContainerId);

  must(
    state.Running === true && state.Pid === context.apiPid,
    'the API process survived the outage rather than crashing or being replaced',
    `running ${String(state.Running)}, pid expected ${context.apiPid}, saw ${state.Pid}`,
  );

  proved(
    'A persistence route answered 503 DATABASE_UNAVAILABLE, twice, within its timeout, with no ' +
      'stack, SQL, ORM name, driver code, table name, or connection string in the body — and the ' +
      'API process did not restart.',
  );
}

/**
 * One request during the outage, with the whole controlled-failure contract
 * asserted on it.
 *
 * @param {string} projectId
 * @param {string} which
 * @returns {Promise<number>} how long it took, in milliseconds
 */
async function requestDuringOutage(projectId, which) {
  const response = await api.request('GET', `/projects/${projectId}`, {
    timeoutMs: OUTAGE_REQUEST_TIMEOUT_MS,
  });

  must(
    response.failure === undefined,
    `${which} finishes within ${OUTAGE_REQUEST_TIMEOUT_MS} ms instead of hanging`,
    response.failure ?? '',
  );

  must(
    response.status === 503,
    `${which} answers 503`,
    `HTTP ${response.status}: ${redact(response.text.slice(0, 300))}`,
  );

  // Exactly these three properties. An `issues` list is legitimate on a
  // validation failure and meaningless here, and anything else — `stack`,
  // `error`, `cause`, `detail` — is the leak this asserts against.
  const body = assertExactKeys(`${which}'s body`, response.json, ['statusCode', 'code', 'message']);

  must(
    body.code === 'DATABASE_UNAVAILABLE' && body.statusCode === 503,
    `${which} carries the stable DATABASE_UNAVAILABLE code`,
    `code ${String(body.code)}, statusCode ${String(body.statusCode)}`,
  );

  must(
    typeof body.message === 'string' && body.message.trim() !== '',
    `${which} carries a public message`,
    `message ${String(body.message)}`,
  );

  assertNoSensitiveContent(`${which}'s body`, response.text);

  note(`${which}: HTTP 503 ${String(body.code)} in ${response.elapsedMs} ms`);

  return response.elapsedMs;
}

// --- Scenario: PostgreSQL comes back -----------------------------------------

/**
 * @param {Fixture} baseline
 * @param {{ apiContainerId: string, databaseContainerId: string, apiPid: number }} context
 * @returns {Promise<void>}
 */
async function scenarioDatabaseRecovery(baseline, context) {
  scenario('Start PostgreSQL again, and do not restart the API');

  assertCommandSucceeded(
    'Starting PostgreSQL',
    await compose(['start', 'database'], { timeoutMs: 120_000 }),
  );

  await waitForContainerHealth(context.databaseContainerId, 'database', DATABASE_START_TIMEOUT_MS);

  const midway = await containerState(context.apiContainerId);

  must(
    midway.Running === true && midway.Pid === context.apiPid,
    'the API was not restarted while PostgreSQL was coming back',
    `running ${String(midway.Running)}, pid expected ${context.apiPid}, saw ${midway.Pid}`,
  );

  await waitFor(
    'the persistence route to succeed again through the same API process',
    async () => {
      const response = await api.request('GET', `/projects/${baseline.projectId}`, {
        timeoutMs: 10_000,
      });

      return { ok: response.status === 200, detail: response.failure ?? `HTTP ${response.status}` };
    },
    { timeoutMs: RECOVERY_TIMEOUT_MS, intervalMs: POLL_INTERVAL_MS },
  );

  const after = await containerState(context.apiContainerId);

  must(
    after.Running === true && after.Pid === context.apiPid,
    'the API that recovered is the same process, with the same connection pool',
    `pid expected ${context.apiPid}, saw ${after.Pid}`,
  );

  note(`API pid unchanged throughout the outage and the recovery: ${context.apiPid}`);

  await assertFixtureIntact(baseline, 'after the PostgreSQL restart');
}

// --- Scenario: the migration runs again over existing rows --------------------

/**
 * @param {Fixture} baseline
 * @returns {Promise<void>}
 */
async function scenarioMigrationOverExistingData(baseline) {
  scenario('Redeploy the committed migration over the populated database');

  note('docker compose run --rm migrate — the real one-shot service, on the same volume.');

  const result = await compose(['run', '--rm', '--no-TTY', 'migrate'], {
    timeoutMs: MIGRATION_TIMEOUT_MS,
    stream: true,
  });

  must(
    result.exitCode === 0,
    'the migration service exits 0 against a database that already holds rows',
    describeCommandResult(result),
  );

  // The exit code and the data are the proof. Prisma's log wording is not a
  // contract, so nothing here asserts on it.
  await assertFixtureIntact(baseline, 'after the migration was redeployed');
}

// --- Scenario: the API image still carries no Prisma CLI ----------------------

/**
 * @returns {Promise<void>}
 */
async function scenarioApiImageBoundary() {
  scenario('Confirm the API runtime image still carries no Prisma CLI or compiler');

  const script = [
    'if ls -d /repo/node_modules/.pnpm/prisma@* >/dev/null 2>&1; then echo prisma-package; exit 1; fi',
    'if ls -d /repo/node_modules/.pnpm/typescript@* >/dev/null 2>&1; then echo typescript-package; exit 1; fi',
    'if command -v prisma >/dev/null 2>&1; then echo prisma-binary; exit 1; fi',
    'if command -v tsc >/dev/null 2>&1; then echo tsc-binary; exit 1; fi',
    'echo none',
  ].join('\n');

  const result = await compose(['exec', '--no-TTY', 'api', 'sh', '-c', script], {
    timeoutMs: 60_000,
  });

  must(
    result.exitCode === 0 && result.stdout.trim().endsWith('none'),
    'the API runtime image contains no Prisma CLI and no TypeScript compiler',
    describeCommandResult(result),
  );

  proved(
    'Migrations still run only in the migrate image; the API image gained nothing from this ' +
      'validation.',
  );
}

// --- Cleanup -----------------------------------------------------------------

let cleanedUp = false;

/**
 * Removes the validation stack, its network, and its disposable volume, then
 * proves both that nothing of this run is left and that the development
 * project's volumes are exactly as they were found.
 *
 * @returns {Promise<void>}
 */
async function cleanup() {
  if (cleanedUp) {
    return;
  }

  cleanedUp = true;

  scenario('Clean up the validation project');

  const result = await tearDownValidationStack();

  if (result.exitCode !== 0) {
    process.stderr.write(`    Cleanup failed.\n${describeCommandResult(result)}\n`);
    throw new Error('The validation stack could not be removed.');
  }

  const containers = await projectContainers(VALIDATION_PROJECT_NAME);
  const volumes = await projectVolumes(VALIDATION_PROJECT_NAME);

  must(
    containers.length === 0,
    'no validation container remains',
    `still present: ${containers.join(', ')}`,
  );

  must(
    volumes.length === 0,
    'no validation volume remains',
    `still present: ${volumes.join(', ')}`,
  );

  assertDevelopmentVolumesUntouched(
    developmentVolumesBefore,
    await projectVolumes(DEVELOPMENT_PROJECT_NAME),
  );

  proved(
    `The ${VALIDATION_PROJECT_NAME} containers, network, and volume are gone, and the ` +
      `${DEVELOPMENT_PROJECT_NAME} project's volumes are exactly as they were found.`,
  );
}

/**
 * Container states and recent logs, redacted, for a run that failed.
 *
 * @returns {Promise<void>}
 */
async function diagnostics() {
  process.stderr.write('\n--- Validation stack diagnostics ---\n');

  for (const args of [
    ['ps', '--all'],
    ['logs', '--no-color', '--tail', '120'],
  ]) {
    try {
      const result = await compose(args, { timeoutMs: 60_000 });

      process.stderr.write(`\n$ docker compose ${args.join(' ')}\n`);
      process.stderr.write(`${redact(result.stdout)}\n`);

      if (result.stderr.trim() !== '') {
        process.stderr.write(`${redact(result.stderr)}\n`);
      }
    } catch (error) {
      process.stderr.write(
        `Could not collect diagnostics: ${redact(error instanceof Error ? error.message : error)}\n`,
      );
    }
  }
}

// --- The run -----------------------------------------------------------------

/**
 * @returns {Promise<void>}
 */
async function main() {
  process.stdout.write('DevSync C4 - persistence and restart validation\n');

  /** @type {unknown} */
  let failure;

  try {
    await preflight();

    const stack = await startStack();
    const baseline = await seedFixture();
    const afterRestart = await scenarioApiRestart(baseline, stack);

    const context = {
      apiContainerId: stack.apiContainerId,
      databaseContainerId: stack.databaseContainerId,
      apiPid: afterRestart.apiPid,
    };

    await scenarioDatabaseOutage(baseline, context);
    await scenarioDatabaseRecovery(baseline, context);
    await scenarioMigrationOverExistingData(baseline);
    await scenarioApiImageBoundary();
  } catch (error) {
    failure = error;
    await diagnostics();
  } finally {
    try {
      await cleanup();
    } catch (error) {
      if (failure === undefined) {
        failure = error;
      } else {
        process.stderr.write(
          `\nCleanup also failed: ${redact(error instanceof Error ? error.message : error)}\n`,
        );
      }
    }
  }

  if (failure !== undefined) {
    process.stderr.write('\nC4 restart validation FAILED\n');

    if (failure instanceof InvariantError) {
      process.stderr.write(`  invariant: ${redact(failure.invariant)}\n`);
    }

    if (failure instanceof TimeoutError) {
      process.stderr.write('  cause: a bounded wait ran out of time\n');
    }

    process.stderr.write(
      `  ${redact(failure instanceof Error ? (failure.stack ?? failure.message) : failure)}\n`,
    );

    process.exitCode = 1;

    return;
  }

  process.stdout.write('\nC4 restart validation PASSED\n');

  for (const proof of proofs) {
    process.stdout.write(`  - ${redact(proof)}\n`);
  }
}

let interrupting = false;

for (const signal of /** @type {NodeJS.Signals[]} */ (['SIGINT', 'SIGTERM'])) {
  process.on(signal, () => {
    if (interrupting) {
      return;
    }

    interrupting = true;
    process.stderr.write(`\nInterrupted by ${signal}; removing the validation stack.\n`);

    cleanup().then(
      () => {
        process.exit(130);
      },
      (error) => {
        process.stderr.write(
          `Cleanup after ${signal} failed: ${redact(error instanceof Error ? error.message : error)}\n`,
        );
        process.exit(130);
      },
    );
  });
}

await main();
