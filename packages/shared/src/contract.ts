import type { output, ZodType } from 'zod';
import type { ApiIssue, ApiIssuePathSegment } from './errors';

/**
 * Checking a request against a contract, and describing the failure in the terms
 * this package publishes.
 *
 * Zod validates; nothing outside this package needs to know that. A caller hands
 * over a schema and gets back either the parsed value or the issues that go into
 * an error response — so the validation library stays an implementation detail of
 * `@devsync/shared` rather than a dependency every consumer has to install, pin,
 * and keep in step.
 */

/** Any schema published by this package. */
export type ContractSchema = ZodType;

/** What a schema produces once it has parsed and transformed its input. */
export type ContractValue<Schema extends ContractSchema> = output<Schema>;

export type ContractResult<Schema extends ContractSchema> =
  { ok: true; value: ContractValue<Schema> } | { ok: false; issues: ApiIssue[] };

/**
 * Non-throwing by design: a request that does not match its contract is an
 * ordinary outcome the caller has to answer, not an exception.
 */
export function parseContract<Schema extends ContractSchema>(
  schema: Schema,
  input: unknown,
): ContractResult<Schema> {
  const result = schema.safeParse(input);

  if (result.success) {
    return { ok: true, value: result.data };
  }

  return {
    ok: false,
    issues: result.error.issues.map((issue) => ({
      path: issue.path.map(toPathSegment),
      message: issue.message,
    })),
  };
}

/**
 * An array index stays a number so a client can use it as one; anything else
 * becomes a string, because a symbol cannot survive JSON and a path nobody can
 * serialise is worse than a path spelled out.
 */
function toPathSegment(segment: PropertyKey): ApiIssuePathSegment {
  return typeof segment === 'number' ? segment : String(segment);
}
