// @ts-check

// Everything the restart validation does to Docker.
//
// Two properties matter more than any of the individual commands.
//
// **Every Compose invocation is scoped to the validation project**, by
// `--project-name` on the command line and `COMPOSE_PROJECT_NAME` in the child's
// environment, and the name goes through `assertValidationProject` before the
// process is spawned. There is no code path here that can address the
// development stack, which is why the isolation is a property of the harness
// rather than a note in a document.
//
// **Nothing is spawned through a shell.** Arguments are passed as an array, so
// nothing interpolated into a command can be read as one.

import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  VALIDATION_HOST_PORTS,
  VALIDATION_PROJECT_NAME,
  assertDisposableVolumes,
  assertValidationProject,
  parseLines,
  redact,
} from './support.mjs';

/**
 * A container's state, as `docker inspect` reports it. Only the properties this
 * validation reads are named; Docker sends more.
 *
 * @typedef {object} ContainerState
 * @property {string} Status
 * @property {boolean} Running
 * @property {number} Pid
 * @property {number} ExitCode
 * @property {string} StartedAt
 * @property {{ Status: string } | undefined} [Health]
 */

/** The repository root: `tests/restart/lib` is four levels below it. */
export const REPOSITORY_ROOT = path.resolve(fileURLToPath(import.meta.url), '..', '..', '..', '..');

/** The Compose file the validation stack is built from — the ordinary one. */
export const COMPOSE_FILE = 'compose.yaml';

const DEFAULT_COMMAND_TIMEOUT_MS = 120_000;

/**
 * The environment every Compose command in this run is given.
 *
 * The three port variables are what move the validation stack off the
 * development ports; they are passed explicitly rather than written to a file,
 * because a shell value beats `.env` in Compose's substitution order and a
 * developer's `.env` must not be able to change where this stack listens.
 *
 * @returns {NodeJS.ProcessEnv}
 */
export function composeEnvironment() {
  return {
    ...process.env,
    COMPOSE_PROJECT_NAME: VALIDATION_PROJECT_NAME,
    WEB_HOST_PORT: String(VALIDATION_HOST_PORTS.web),
    API_HOST_PORT: String(VALIDATION_HOST_PORTS.api),
    POSTGRES_HOST_PORT: String(VALIDATION_HOST_PORTS.postgres),
  };
}

/**
 * Runs a command and collects what it said.
 *
 * Never rejects for a non-zero exit: the exit code is data the caller asserts on,
 * so `assertCommandSucceeded` can name what failed. It rejects only when the
 * process could not be started or had to be killed for exceeding its timeout —
 * both of which are the harness's problem rather than the subject's.
 *
 * @param {string} command
 * @param {readonly string[]} args
 * @param {{ cwd?: string, env?: NodeJS.ProcessEnv, timeoutMs?: number, stream?: boolean }} [options]
 * @returns {Promise<import('./support.d.mts').CommandResult>}
 */
export function runCommand(command, args, options = {}) {
  const {
    cwd = REPOSITORY_ROOT,
    env = process.env,
    timeoutMs = DEFAULT_COMMAND_TIMEOUT_MS,
    stream = false,
  } = options;

  const commandLine = redact([command, ...args].join(' '));

  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, timeoutMs);

    const echoOut = stream ? lineEcho((line) => process.stdout.write(`    ${line}\n`)) : undefined;
    const echoErr = stream ? lineEcho((line) => process.stderr.write(`    ${line}\n`)) : undefined;

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      echoOut?.(String(chunk));
    });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
      echoErr?.(String(chunk));
    });

    child.on('error', (error) => {
      clearTimeout(timer);
      reject(new Error(`Could not run \`${commandLine}\`: ${redact(error.message)}`));
    });

    child.on('close', (exitCode, signal) => {
      clearTimeout(timer);
      echoOut?.(null);
      echoErr?.(null);

      if (timedOut) {
        reject(
          new Error(`\`${commandLine}\` did not finish within ${timeoutMs} ms and was killed.`),
        );
        return;
      }

      resolve({ commandLine, exitCode, signal, stdout, stderr });
    });
  });
}

/**
 * Writes streamed output a whole line at a time, so redaction never has to work
 * across a chunk boundary. Called with `null` to flush what is left.
 *
 * @param {(line: string) => void} write
 * @returns {(chunk: string | null) => void}
 */
function lineEcho(write) {
  let buffer = '';

  return (chunk) => {
    if (chunk === null) {
      if (buffer !== '') {
        write(redact(buffer));
        buffer = '';
      }

      return;
    }

    buffer += chunk;

    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      write(redact(line.replace(/\r$/, '')));
    }
  };
}

/**
 * A Docker Compose command against the validation project, and nothing else.
 *
 * @param {readonly string[]} args
 * @param {{ timeoutMs?: number, stream?: boolean }} [options]
 * @returns {Promise<import('./support.d.mts').CommandResult>}
 */
export function compose(args, options = {}) {
  const projectName = assertValidationProject(VALIDATION_PROJECT_NAME);

  return runCommand(
    'docker',
    ['compose', '--project-name', projectName, '--file', COMPOSE_FILE, ...args],
    { env: composeEnvironment(), ...options },
  );
}

/**
 * The Docker Engine version, or a refusal explaining that C4 needs Docker.
 *
 * @returns {Promise<string>}
 */
export async function requireDocker() {
  /** @type {import('./support.d.mts').CommandResult} */
  let result;

  try {
    result = await runCommand('docker', ['version', '--format', '{{.Server.Version}}'], {
      timeoutMs: 30_000,
    });
  } catch {
    throw new Error(
      'The Docker CLI could not be run. `pnpm test:restart` proves what happens to stored data ' +
        'when containers stop and start, so it needs Docker Engine with the Compose plugin.',
    );
  }

  if (result.exitCode !== 0) {
    throw new Error(
      'Docker is installed but its daemon did not answer. Start Docker Desktop or the Docker ' +
        'service and try again.',
    );
  }

  return result.stdout.trim();
}

/**
 * @returns {Promise<string>}
 */
export async function composeVersion() {
  const result = await runCommand('docker', ['compose', 'version', '--short'], {
    timeoutMs: 30_000,
  });

  return result.exitCode === 0 ? result.stdout.trim() : 'unknown';
}

/**
 * The container Compose created for a service, or `null` when there is none.
 *
 * @param {string} service
 * @returns {Promise<string | null>}
 */
export async function containerIdFor(service) {
  const result = await compose(['ps', '--all', '--quiet', service], { timeoutMs: 60_000 });

  if (result.exitCode !== 0) {
    return null;
  }

  return parseLines(result.stdout)[0] ?? null;
}

/**
 * A container's state, as Docker reports it.
 *
 * @param {string} containerId
 * @returns {Promise<ContainerState>}
 */
export async function containerState(containerId) {
  const result = await runCommand(
    'docker',
    ['inspect', '--format', '{{json .State}}', containerId],
    { timeoutMs: 60_000 },
  );

  if (result.exitCode !== 0) {
    throw new Error(`Could not inspect container ${containerId}.\n${redact(result.stderr)}`);
  }

  return /** @type {ContainerState} */ (JSON.parse(result.stdout.trim()));
}

/**
 * Volumes Docker itself labels as belonging to a Compose project.
 *
 * Read from Docker rather than assembled from a naming convention, because the
 * cleanup guard is only worth having if it checks reality.
 *
 * @param {string} project
 * @returns {Promise<string[]>}
 */
export async function projectVolumes(project) {
  const result = await runCommand(
    'docker',
    [
      'volume',
      'ls',
      '--filter',
      `label=com.docker.compose.project=${project}`,
      '--format',
      '{{.Name}}',
    ],
    { timeoutMs: 60_000 },
  );

  if (result.exitCode !== 0) {
    throw new Error(`Could not list volumes for "${project}".\n${redact(result.stderr)}`);
  }

  return parseLines(result.stdout);
}

/**
 * Containers Docker labels as belonging to a Compose project.
 *
 * @param {string} project
 * @returns {Promise<string[]>}
 */
export async function projectContainers(project) {
  const result = await runCommand(
    'docker',
    [
      'ps',
      '--all',
      '--filter',
      `label=com.docker.compose.project=${project}`,
      '--format',
      '{{.Names}}',
    ],
    { timeoutMs: 60_000 },
  );

  if (result.exitCode !== 0) {
    throw new Error(`Could not list containers for "${project}".\n${redact(result.stderr)}`);
  }

  return parseLines(result.stdout);
}

/**
 * Removes the validation stack and its disposable volume.
 *
 * The guard runs first and reads Docker's own labels: if anything outside this
 * project's prefix came back, nothing is deleted. `--volumes` appears here and
 * nowhere else in the repository's tooling, and it is safe here for exactly one
 * reason — the volume it deletes was created by this run, minutes ago, and holds
 * nothing but the fixture.
 *
 * @returns {Promise<import('./support.d.mts').CommandResult>}
 */
export async function tearDownValidationStack() {
  assertValidationProject(VALIDATION_PROJECT_NAME);
  assertDisposableVolumes(await projectVolumes(VALIDATION_PROJECT_NAME));

  return compose(['down', '--volumes', '--remove-orphans'], { timeoutMs: 180_000 });
}

/**
 * Whether a TCP port on the loopback interface can be bound right now.
 *
 * Checked before the stack starts so a collision is a clear message rather than
 * a Compose error thirty seconds into a build.
 *
 * @param {number} port
 * @returns {Promise<boolean>}
 */
export function isPortFree(port) {
  return new Promise((resolve) => {
    const server = createServer();

    server.once('error', () => {
      resolve(false);
    });

    server.once('listening', () => {
      server.close(() => {
        resolve(true);
      });
    });

    server.listen(port, '127.0.0.1');
  });
}
