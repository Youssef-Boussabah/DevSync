// Declarations for `support.mjs`.
//
// Hand-written because that file is plain JavaScript — the restart runner is a
// command with no compile step in front of it — while the Vitest suite that
// covers it is TypeScript. The same arrangement as
// `packages/database/tools/test-database.d.mts`.

/** The Compose project the validation stack runs under. */
export declare const VALIDATION_PROJECT_NAME: 'devsync-c4-validation';

/** The ordinary development project, named only so it can be refused. */
export declare const DEVELOPMENT_PROJECT_NAME: 'devsync';

/** Host ports the validation stack publishes. */
export declare const VALIDATION_HOST_PORTS: {
  readonly web: number;
  readonly api: number;
  readonly postgres: number;
};

/** How the validation stack's own volume names begin. */
export declare const VALIDATION_VOLUME_PREFIX: string;

/** Removes anything that could carry a credential from text about to be printed. */
export declare function redact(value: unknown): string;

/** Returns the project name when it is the validation one, and throws otherwise. */
export declare function assertValidationProject(projectName: string): string;

/** Throws unless every volume named belongs to the validation project. */
export declare function assertDisposableVolumes(volumeNames: readonly string[]): readonly string[];

/** Throws when the development project's volumes are not exactly as they were. */
export declare function assertDevelopmentVolumesUntouched(
  before: readonly string[],
  after: readonly string[],
): void;

/** What a spawned command did. */
export interface CommandResult {
  /** The command line, already redacted. */
  commandLine: string;
  exitCode: number | null;
  signal: string | null;
  stdout: string;
  stderr: string;
}

/** A redacted, readable account of a command result, for a failure report. */
export declare function describeCommandResult(result: CommandResult): string;

/** Returns the result when the command exited 0, and throws otherwise. */
export declare function assertCommandSucceeded(
  description: string,
  result: CommandResult,
): CommandResult;

/** What a single poll saw. */
export interface ProbeOutcome<T> {
  ok: boolean;
  /** What the probe saw, when it did not hold. Reported by a timeout. */
  detail?: string;
  value?: T;
}

export interface WaitOptions {
  /** The maximum, in milliseconds. Required: an unbounded wait is not a wait. */
  timeoutMs: number;
  /** How long to leave between attempts. Defaults to 1000 ms. */
  intervalMs?: number;
  /** Injected so deadline arithmetic can be tested without spending the time. */
  now?: () => number;
  /** Injected for the same reason. */
  sleep?: (ms: number) => Promise<void>;
}

/** A bounded wait that ran out of time. */
export declare class TimeoutError extends Error {
  constructor(message: string);
}

/** Polls a real condition until it holds or the deadline passes. */
export declare function waitFor<T>(
  description: string,
  probe: () => Promise<ProbeOutcome<T>> | ProbeOutcome<T>,
  options: WaitOptions,
): Promise<ProbeOutcome<T>>;

/** A UTC instant with the `Z` designator, and a real date. */
export declare function isIsoUtcTimestamp(value: unknown): boolean;

/** Throws unless the object carries exactly the properties named. */
export declare function assertExactKeys(
  label: string,
  value: unknown,
  keys: readonly string[],
): Record<string, unknown>;

/** Every property of `expected` compared with `actual`, reported as a list. */
export declare function compareRecords(
  label: string,
  expected: Record<string, unknown>,
  actual: Record<string, unknown>,
): string[];

/** A value, short enough to read and safe enough to print. */
export declare function describeValue(value: unknown): string;

/** Throws when a response body describes the machinery behind the failure. */
export declare function assertNoSensitiveContent(label: string, text: string): void;

/** Docker's `--format json` output, whether it is an array or one object per line. */
export declare function parseJsonOutput(stdout: string): unknown[];

/** Non-empty lines from a command that prints one value per line. */
export declare function parseLines(stdout: string): string[];

/** A run label that is unique per run and readable in a project list. */
export declare function runLabel(date: Date, suffix: string): string;
