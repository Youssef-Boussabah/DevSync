import { HttpStatus } from '@nestjs/common';
import type { PersistenceError } from '@devsync/database';
import type { ApiErrorCode, ApiErrorResource, ApiIssue } from '@devsync/shared';

/**
 * Every failure DevSync answers with, in one type.
 *
 * The status and the stable code travel together, so the pairing is decided once
 * — in the factories below — rather than at each of the places that raise one.
 * The original exception is kept as `cause` for the log and is never serialised:
 * a client learns what went wrong, not what DevSync is made of.
 */
export class ApiError extends Error {
  readonly statusCode: HttpStatus;
  readonly code: ApiErrorCode;
  readonly issues?: ApiIssue[];

  constructor(
    statusCode: HttpStatus,
    code: ApiErrorCode,
    message: string,
    options: ApiErrorOptions = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });

    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;

    // An empty list claims field-level detail while carrying none, so it is
    // treated as no detail at all.
    if (options.issues !== undefined && options.issues.length > 0) {
      this.issues = options.issues;
    }
  }
}

export interface ApiErrorOptions {
  issues?: ApiIssue[] | undefined;
  cause?: unknown;
}

/** What goes on the wire. Nothing else about the error does. */
export function toApiErrorResource(error: ApiError): ApiErrorResource {
  const resource: ApiErrorResource = {
    statusCode: error.statusCode,
    code: error.code,
    message: error.message,
  };

  return error.issues === undefined ? resource : { ...resource, issues: error.issues };
}

export function validationFailed(message: string, options?: ApiErrorOptions): ApiError {
  return new ApiError(HttpStatus.BAD_REQUEST, 'VALIDATION_FAILED', message, options);
}

/**
 * Separate from `VALIDATION_FAILED` because it is worth telling a client that the
 * URL it built is wrong rather than the body it sent — a distinction it can act
 * on, which is the only reason to spend a code on it.
 */
export function invalidIdentifier(issues: ApiIssue[]): ApiError {
  return new ApiError(
    HttpStatus.BAD_REQUEST,
    'INVALID_IDENTIFIER',
    'The request URL contains an identifier that is not a UUID.',
    { issues },
  );
}

export function projectNotFound(cause?: unknown): ApiError {
  return new ApiError(HttpStatus.NOT_FOUND, 'PROJECT_NOT_FOUND', 'No such project.', { cause });
}

export function fileNotFound(cause?: unknown): ApiError {
  return new ApiError(HttpStatus.NOT_FOUND, 'FILE_NOT_FOUND', 'No such file in this project.', {
    cause,
  });
}

export function fileNameTaken(fileName: string | undefined, cause?: unknown): ApiError {
  const message =
    fileName === undefined
      ? 'A file with that name already exists in this project.'
      : `A file named "${fileName}" already exists in this project.`;

  return new ApiError(HttpStatus.CONFLICT, 'FILE_NAME_TAKEN', message, {
    issues: [{ path: ['name'], message: 'Already used in this project.' }],
    cause,
  });
}

export function databaseUnavailable(cause: unknown): ApiError {
  return new ApiError(
    HttpStatus.SERVICE_UNAVAILABLE,
    'DATABASE_UNAVAILABLE',
    'The database is unavailable. Try again shortly.',
    { cause },
  );
}

export function internalError(cause: unknown): ApiError {
  return new ApiError(
    HttpStatus.INTERNAL_SERVER_ERROR,
    'INTERNAL_ERROR',
    'The request could not be completed.',
    { cause },
  );
}

export interface PersistenceContext {
  /**
   * The name the caller was trying to give a file, when there is one. The data
   * layer knows a unique constraint was violated; only the caller knows what it
   * was trying to call the file.
   */
  fileName?: string | undefined;
}

/**
 * The one place a persistence meaning becomes an HTTP answer.
 *
 * `@devsync/database` classifies every failure into four meanings and lets no
 * ORM exception out. This maps those meanings, and nothing here knows what
 * Prisma or PostgreSQL is — which is what keeps the data layer replaceable.
 */
export function fromPersistenceError(
  error: PersistenceError,
  context: PersistenceContext = {},
): ApiError {
  switch (error.failure.kind) {
    case 'notFound':
      return error.failure.entity === 'project' ? projectNotFound(error) : fileNotFound(error);

    case 'uniqueViolation':
      return fileNameTaken(context.fileName, error);

    case 'unavailable':
      return databaseUnavailable(error);

    case 'unknown':
      return internalError(error);
  }
}
