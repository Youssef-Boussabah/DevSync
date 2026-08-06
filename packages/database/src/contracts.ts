/**
 * Everything a caller of this package can name, with nothing from the ORM in it.
 *
 * This file imports no Prisma type, no generated client, and no driver. That is
 * the point rather than a coincidence: the package already claims that a Prisma
 * model is not a contract and that no Prisma error escapes, and this is where
 * those two claims become checkable. Anything that needs the generated client
 * lives beside this file and depends on it, never the other way round.
 *
 * One consequence is practical. `apps/api`'s fast Jest suite consumes these
 * declarations from source, so it can type-check and run without
 * `prisma generate` having been run first — which is what keeps `pnpm test`
 * building nothing. See `apps/api/jest.config.mjs`.
 */

/**
 * What went wrong, in terms the caller can act on.
 *
 * Prisma's error codes and PostgreSQL's SQLSTATEs stay inside this package. The
 * API maps these four meanings onto HTTP status codes; it never reads an ORM
 * exception, which is what allows the ORM behind this package to be replaced.
 */
export type PersistenceFailure =
  | { kind: 'notFound'; entity: 'project' | 'projectFile' }
  | { kind: 'uniqueViolation'; constraint: 'projectFileName' }
  | { kind: 'unavailable' }
  | { kind: 'unknown' };

export class PersistenceError extends Error {
  readonly failure: PersistenceFailure;

  /**
   * A short internal token naming the rule that classified this failure — for
   * the server's log, never for a response.
   *
   * It carries no value read out of the original exception: no SQLSTATE, no
   * driver code, no message, no host. What it answers is the question an outage
   * that answered `500` left unanswerable from a log — *which* rule decided, and
   * in particular whether any rule matched at all.
   */
  readonly diagnostic: string | undefined;

  constructor(
    failure: PersistenceFailure,
    message: string,
    options?: { cause?: unknown; diagnostic?: string },
  ) {
    super(message, options === undefined ? undefined : { cause: options.cause });
    this.name = 'PersistenceError';
    this.failure = failure;
    this.diagnostic = options?.diagnostic;
  }
}

export function isPersistenceError(error: unknown): error is PersistenceError {
  return error instanceof PersistenceError;
}

/**
 * What this package hands back, and what it accepts.
 *
 * These are storage records, not HTTP contracts. A Prisma model type must never
 * escape the package — a column added for storage reasons would otherwise appear
 * on the wire the moment it existed — so every operation maps its rows onto the
 * shapes below.
 */

export interface ProjectRecord {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectFileRecord {
  id: string;
  projectId: string;
  name: string;
  language: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

/** A file without its contents, for listings. */
export type ProjectFileSummaryRecord = Omit<ProjectFileRecord, 'content'>;

/** Both rows written by the one transaction that creates a project. */
export interface ProjectWithInitialFileRecord {
  project: ProjectRecord;
  file: ProjectFileRecord;
}

export interface NewProject {
  name: string;
}

export interface NewProjectFile {
  name: string;
  language: string;
  content: string;
}

/**
 * The starter file a new project is created with. The caller supplies it in
 * full: what a new project should contain is a product decision, and this
 * package has no business holding an opinion about it.
 */
export interface NewProjectWithInitialFile {
  project: NewProject;
  initialFile: NewProjectFile;
}

/**
 * A partial file change. Absent means "leave it alone" — every property is
 * optional, and passing none is a caller error rather than a no-op write.
 */
export interface ProjectFileChanges {
  name?: string;
  language?: string;
  content?: string;
}

export interface ProjectOperations {
  /**
   * Creates a project and its first file in one transaction. If either insert
   * fails, neither row remains.
   *
   * The starter file arrives from the caller. This package does not decide what
   * a new project's first file is called, what language it opens as, or what it
   * says — that is a product decision, and it belongs to the API.
   */
  createWithInitialFile(input: NewProjectWithInitialFile): Promise<ProjectWithInitialFileRecord>;

  /** Most recently updated first, with the identifier as the final tie-breaker. */
  list(): Promise<ProjectRecord[]>;

  findById(projectId: string): Promise<ProjectRecord | null>;

  /** Throws a `notFound` `PersistenceError` if there is no such project. */
  rename(projectId: string, name: string): Promise<ProjectRecord>;

  /** Permanently deletes the project and, by cascade, every file in it. */
  delete(projectId: string): Promise<void>;
}

/**
 * File operations, all of them scoped to a project.
 *
 * Two conventions run through this interface. **A missing project always throws**
 * a `notFound` `PersistenceError`, because the project in the path is context
 * rather than the thing being asked for. **A missing file is `null`** from a
 * lookup and a `notFound` error from anything that changes it — asking whether a
 * file exists and acting on one that must exist are different questions.
 *
 * Every operation that changes a file also moves its project's `updatedAt`, in
 * the same transaction, so a project list ordered by recency reflects real work.
 */
export interface ProjectFileOperations {
  create(projectId: string, file: NewProjectFile): Promise<ProjectFileRecord>;

  /** Oldest first by creation time, with the identifier as the tie-breaker. */
  list(projectId: string): Promise<ProjectFileSummaryRecord[]>;

  /** `null` when the project holds no such file. */
  find(projectId: string, fileId: string): Promise<ProjectFileRecord | null>;

  /**
   * Applies whichever of `name`, `language`, and `content` are present. The API
   * rejects an empty change set before it reaches here; if one arrives anyway,
   * only the timestamps move.
   */
  update(
    projectId: string,
    fileId: string,
    changes: ProjectFileChanges,
  ): Promise<ProjectFileRecord>;

  delete(projectId: string, fileId: string): Promise<void>;
}

export interface DatabaseOptions {
  /**
   * A PostgreSQL connection string. It arrives already validated from the
   * application that owns configuration; this package reads no environment
   * variable and has no fallback, so there is no way for it to end up talking to
   * a database nobody chose.
   */
  connectionString: string;
}

export interface Database {
  readonly projects: ProjectOperations;
  readonly files: ProjectFileOperations;

  /**
   * Opens the pool and proves the database answers. Throws an `unavailable`
   * `PersistenceError` if it does not, which is what turns an unreachable
   * database into a failed startup rather than a service that accepts traffic
   * it cannot serve.
   */
  connect(): Promise<void>;

  /** Closes the pool. Safe to call when already disconnected. */
  disconnect(): Promise<void>;
}
