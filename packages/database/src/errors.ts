import { Prisma } from './generated/prisma/client';
import { PersistenceError } from './contracts';
import {
  classifyKnownRequestFailure,
  requestFailedFailure,
  unavailableFailure,
} from './failure-classification';
import type { ClassifiedFailure, MissingEntity } from './failure-classification';

/**
 * Turning what Prisma threw into one of the four meanings `contracts.ts`
 * defines. Everything ORM-specific about failure handling is here; the error
 * type itself is not, so a caller can name it without loading a generated
 * client.
 *
 * This file recognises the exception; `failure-classification.ts` decides what
 * it means. Only the recognition needs the generated client, which is what lets
 * the rules be tested without one.
 */

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
    // **The whole exception**, not `error.meta`. Where the structured condition
    // lives is the driver's business and it is not in one place: a PostgreSQL
    // error puts a SQLSTATE under `meta.driverAdapterError.cause`, and a system
    // error the adapter does not convert arrives with no metadata at all and its
    // code on the exception itself. Handing over one branch of that graph is how
    // an outage came back as `500`. The classifier reads it as `unknown` and
    // trusts no shape this package does not own.
    return toError(classifyKnownRequestFailure(error.code, error, missingEntity), error);
  }

  if (error instanceof Prisma.PrismaClientInitializationError) {
    return unavailable(error);
  }

  return toError(requestFailedFailure(), error);
}

export function unavailable(cause: unknown): PersistenceError {
  return toError(unavailableFailure('connection-open'), cause);
}

function toError(
  { failure, message, reason }: ClassifiedFailure,
  cause: unknown,
): PersistenceError {
  return new PersistenceError(failure, message, { cause, diagnostic: reason });
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
