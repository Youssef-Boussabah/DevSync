/**
 * `@devsync/database`
 *
 * The single place where DevSync talks to PostgreSQL. Prisma, the schema, the
 * migrations, and the connection pool all live behind this surface: callers get
 * named operations over projects and files, never a client they can run
 * arbitrary queries through, and never a Prisma error.
 *
 * `createDatabase` is the one export that needs the generated client. Everything
 * else comes from `contracts.ts`, which imports nothing from Prisma — that is
 * what lets a consumer name a `Database`, a `PersistenceError`, or a record
 * without a generated client existing.
 */

export { createDatabase } from './database';

export { PersistenceError, isPersistenceError } from './contracts';

export type {
  Database,
  DatabaseOptions,
  NewProject,
  NewProjectFile,
  NewProjectWithInitialFile,
  PersistenceFailure,
  ProjectFileChanges,
  ProjectFileOperations,
  ProjectFileRecord,
  ProjectFileSummaryRecord,
  ProjectOperations,
  ProjectRecord,
  ProjectWithInitialFileRecord,
} from './contracts';
