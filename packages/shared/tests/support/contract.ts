import { parseContract, type ApiIssue, type ContractSchema, type ContractValue } from '../../src';

/**
 * The two things every schema test asks: what a contract produced from an input
 * it accepts, and what it said about one it does not.
 *
 * Both go through `parseContract`, which is the path `apps/api` takes, so a test
 * that passes here is a statement about the API's behaviour rather than about
 * Zod's.
 */

export function accepted<Schema extends ContractSchema>(
  schema: Schema,
  input: unknown,
): ContractValue<Schema> {
  const result = parseContract(schema, input);

  if (!result.ok) {
    throw new Error(`Expected the input to be accepted. Rejected with: ${describe(result.issues)}`);
  }

  return result.value;
}

export function rejected<Schema extends ContractSchema>(
  schema: Schema,
  input: unknown,
): ApiIssue[] {
  const result = parseContract(schema, input);

  if (result.ok) {
    throw new Error(
      `Expected the input to be rejected, but it parsed as ${describe(result.value)}`,
    );
  }

  return result.issues;
}

/** The property names an issue list points at, for assertions that only care where. */
export function issuePaths(issues: ApiIssue[]): string[] {
  return issues.map((issue) => issue.path.join('.'));
}

function describe(value: unknown): string {
  return JSON.stringify(value);
}
