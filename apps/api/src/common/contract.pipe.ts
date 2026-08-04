import type { PipeTransform } from '@nestjs/common';
import { parseContract } from '@devsync/shared';
import type { ApiIssue, ContractSchema, ContractValue } from '@devsync/shared';
import { invalidIdentifier, validationFailed, type ApiError } from './api-error';

/**
 * Request validation, driven by the schemas in `@devsync/shared`.
 *
 * There are no DTO classes and no decorator metadata here on purpose: a class
 * carrying `class-validator` decorators cannot be shared with the browser, and
 * the schema is what C3 needs to read. The pipe's input is `unknown`, so nothing
 * downstream can be reached by a value that has not been through a contract.
 */

type FailureFor = (issues: ApiIssue[]) => ApiError;

class ContractPipe<Schema extends ContractSchema> implements PipeTransform<
  unknown,
  ContractValue<Schema>
> {
  constructor(
    private readonly schema: Schema,
    private readonly reject: FailureFor,
  ) {}

  transform(value: unknown): ContractValue<Schema> {
    const result = parseContract(this.schema, value);

    if (!result.ok) {
      throw this.reject(result.issues);
    }

    return result.value;
  }
}

/** A request body, reported as `VALIDATION_FAILED` when it does not match. */
export function validatedBody<Schema extends ContractSchema>(
  schema: Schema,
): PipeTransform<unknown, ContractValue<Schema>> {
  return new ContractPipe(schema, (issues) =>
    validationFailed('The request body is not valid.', { issues }),
  );
}

/**
 * The identifiers in a URL, reported as `INVALID_IDENTIFIER`. They are checked
 * here rather than in a service, so a malformed identifier never reaches the
 * database as a query that was always going to miss.
 */
export function validatedPath<Schema extends ContractSchema>(
  schema: Schema,
): PipeTransform<unknown, ContractValue<Schema>> {
  return new ContractPipe(schema, invalidIdentifier);
}
