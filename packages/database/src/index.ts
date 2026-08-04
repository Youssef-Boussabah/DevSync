/**
 * `@devsync/database`
 *
 * The single place where DevSync talks to PostgreSQL. Prisma, the schema, the
 * migrations, and the connection pool all live behind this surface: callers get
 * named operations over projects and files, never a client they can run
 * arbitrary queries through, and never a Prisma error.
 */

export { createDatabase } from './database';
export type { Database, DatabaseOptions } from './database';

export { PersistenceError, isPersistenceError } from './errors';
export type { PersistenceFailure } from './errors';

export type {
  NewProject,
  NewProjectFile,
  NewProjectWithInitialFile,
  ProjectFileChanges,
  ProjectFileRecord,
  ProjectFileSummaryRecord,
  ProjectRecord,
  ProjectWithInitialFileRecord,
} from './records';

export type { ProjectOperations } from './projects';
export type { ProjectFileOperations } from './project-files';
