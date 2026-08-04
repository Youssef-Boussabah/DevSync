import { Prisma } from './generated/prisma/client';

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

  constructor(failure: PersistenceFailure, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'PersistenceError';
    this.failure = failure;
  }
}

export function isPersistenceError(error: unknown): error is PersistenceError {
  return error instanceof PersistenceError;
}

/** Which record a "not found" means, for the operation that was being run. */
type MissingEntity = 'project' | 'projectFile';

// Prisma's codes for a database that is not answering. A connection that drops
// mid-request surfaces here rather than as an initialisation error.
const UNAVAILABLE_CODES = new Set([
  'P1000', // authentication failed
  'P1001', // cannot reach the database server
  'P1002', // the server was reached but timed out
  'P1008', // operation timed out
  'P1017', // the server closed the connection
]);

/**
 * Translates whatever the driver threw into a `PersistenceError`.
 *
 * The original exception is kept as `cause` so a log can still say what really
 * happened; the message this package produces never contains SQL, a connection
 * string, or a table name.
 */
export function toPersistenceError(error: unknown, missingEntity: MissingEntity): PersistenceError {
  if (error instanceof PersistenceError) {
    return error;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
      case 'P2002':
        return new PersistenceError(
          { kind: 'uniqueViolation', constraint: 'projectFileName' },
          'A file with that name already exists in this project.',
          { cause: error },
        );

      case 'P2025':
        return notFound(missingEntity, error);

      // A foreign key that does not resolve can only be `project_id` here, so
      // the project is what is missing — not the file the caller asked for.
      case 'P2003':
        return notFound('project', error);

      default:
        break;
    }

    if (UNAVAILABLE_CODES.has(error.code)) {
      return unavailable(error);
    }

    return new PersistenceError({ kind: 'unknown' }, 'The database rejected the request.', {
      cause: error,
    });
  }

  if (error instanceof Prisma.PrismaClientInitializationError) {
    return unavailable(error);
  }

  return new PersistenceError({ kind: 'unknown' }, 'The database request failed.', {
    cause: error,
  });
}

export function unavailable(cause: unknown): PersistenceError {
  return new PersistenceError({ kind: 'unavailable' }, 'The database is unavailable.', { cause });
}

function notFound(entity: MissingEntity, cause: unknown): PersistenceError {
  const subject = entity === 'project' ? 'project' : 'file';

  return new PersistenceError({ kind: 'notFound', entity }, `No such ${subject}.`, { cause });
}

/**
 * Runs a data-access call with the translation above applied to whatever it
 * throws. Every exported operation goes through this, so no path out of the
 * package can leak a Prisma error.
 */
export async function withPersistenceErrors<T>(
  missingEntity: MissingEntity,
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw toPersistenceError(error, missingEntity);
  }
}
