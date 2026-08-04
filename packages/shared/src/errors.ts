import { z } from 'zod';

/**
 * The one shape every DevSync route answers a failure with.
 *
 * A client branches on `code` and never on `message`: the codes below are the
 * contract and may not change meaning, while the wording is free to be reworded
 * for whoever reads it. Nothing in a failure response describes the machinery
 * that produced it — no SQL, no ORM code, no connection string, no stack.
 */

export const API_ERROR_CODES = [
  'VALIDATION_FAILED',
  'INVALID_IDENTIFIER',
  'PROJECT_NOT_FOUND',
  'FILE_NOT_FOUND',
  'FILE_NAME_TAKEN',
  'DATABASE_UNAVAILABLE',
  'INTERNAL_ERROR',
] as const;

export const apiErrorCodeSchema = z.enum(API_ERROR_CODES);

export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

/**
 * Where in the request body the problem is. Numeric segments are supported so an
 * array element can be addressed, which costs nothing now and is what stops the
 * shape needing to change the first time a request carries a list.
 */
export const apiIssuePathSegmentSchema = z.union([z.string(), z.int()]);

export type ApiIssuePathSegment = z.infer<typeof apiIssuePathSegmentSchema>;

export const apiIssuePathSchema = z.array(apiIssuePathSegmentSchema);

export type ApiIssuePath = z.infer<typeof apiIssuePathSchema>;

export const apiIssueSchema = z.strictObject({
  path: apiIssuePathSchema,
  message: z.string(),
});

export type ApiIssue = z.infer<typeof apiIssueSchema>;

export const apiErrorResourceSchema = z.strictObject({
  // Repeated from the HTTP status line so a logged response body is
  // self-contained.
  statusCode: z.int(),
  code: apiErrorCodeSchema,
  message: z.string(),
  // Present only when there is field-level detail worth having. An empty list
  // says the same thing as an absent one while looking like an answer, so the
  // minimum is one.
  issues: z.array(apiIssueSchema).min(1).optional(),
});

export type ApiErrorResource = z.infer<typeof apiErrorResourceSchema>;
