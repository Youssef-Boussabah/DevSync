import { describe, expect, it } from 'vitest';
import {
  API_ERROR_CODES,
  apiErrorCodeSchema,
  apiErrorResourceSchema,
  apiIssueSchema,
} from '../src';
import { accepted, rejected } from './support/contract';

describe('the stable error codes', () => {
  it('are exactly the seven the API answers with', () => {
    expect([...API_ERROR_CODES]).toEqual([
      'VALIDATION_FAILED',
      'INVALID_IDENTIFIER',
      'PROJECT_NOT_FOUND',
      'FILE_NOT_FOUND',
      'FILE_NAME_TAKEN',
      'DATABASE_UNAVAILABLE',
      'INTERNAL_ERROR',
    ]);
  });

  it.each([...API_ERROR_CODES])('accepts %s', (code) => {
    expect(accepted(apiErrorCodeSchema, code)).toBe(code);
  });

  it('rejects a code that is not in the contract', () => {
    expect(rejected(apiErrorCodeSchema, 'NOT_FOUND')).toHaveLength(1);
  });

  it('is case-sensitive', () => {
    expect(rejected(apiErrorCodeSchema, 'internal_error')).toHaveLength(1);
  });
});

describe('an issue', () => {
  it('is a path and a message', () => {
    const issue = { path: ['name'], message: 'Already used in this project.' };

    expect(accepted(apiIssueSchema, issue)).toEqual(issue);
  });

  it('accepts a numeric segment, so an array element can be addressed', () => {
    const issue = { path: ['files', 1, 'language'], message: 'Unsupported language.' };

    expect(accepted(apiIssueSchema, issue)).toEqual(issue);
  });

  it('accepts an empty path, which is how a whole-body problem is reported', () => {
    expect(
      accepted(apiIssueSchema, { path: [], message: 'Provide at least one property.' }),
    ).toEqual({ path: [], message: 'Provide at least one property.' });
  });

  it('rejects an issue with no message', () => {
    expect(rejected(apiIssueSchema, { path: ['name'] })).toHaveLength(1);
  });
});

describe('an error resource', () => {
  const conflict = {
    statusCode: 409,
    code: 'FILE_NAME_TAKEN',
    message: 'A file named "utils.ts" already exists in this project.',
    issues: [{ path: ['name'], message: 'Already used in this project.' }],
  };

  it('carries field-level detail when there is some', () => {
    expect(accepted(apiErrorResourceSchema, conflict)).toEqual(conflict);
  });

  it('omits the issues entirely when there is none', () => {
    const notFound = { statusCode: 404, code: 'PROJECT_NOT_FOUND', message: 'No such project.' };

    expect(accepted(apiErrorResourceSchema, notFound)).toEqual(notFound);
  });

  it('rejects an empty issue list, which claims detail it does not have', () => {
    expect(rejected(apiErrorResourceSchema, { ...conflict, issues: [] })).toHaveLength(1);
  });

  it('rejects a code outside the contract', () => {
    expect(rejected(apiErrorResourceSchema, { ...conflict, code: 'CONFLICT' })).toHaveLength(1);
  });

  it('rejects a status that is not a whole number', () => {
    expect(rejected(apiErrorResourceSchema, { ...conflict, statusCode: 409.5 })).toHaveLength(1);
  });

  it('rejects anything it was not told about, such as a stack trace', () => {
    expect(rejected(apiErrorResourceSchema, { ...conflict, stack: 'Error: at ...' })).not.toEqual(
      [],
    );
  });
});
