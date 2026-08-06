import { describe, expect, it } from 'vitest';
import {
  fileIdSchema,
  projectFileParamsSchema,
  projectIdSchema,
  projectParamsSchema,
} from '../src';
import { accepted, rejected } from './support/contract';

const PROJECT_ID = '3f4b1c62-8a5d-4e21-9d0f-6c7b2a915e83';
const FILE_ID = 'b81d2f47-5c30-4a9e-8f16-7d40e2c95ab1';

describe('project and file identifiers', () => {
  it('accept a UUID the database would have generated', () => {
    expect(accepted(projectIdSchema, PROJECT_ID)).toBe(PROJECT_ID);
    expect(accepted(fileIdSchema, FILE_ID)).toBe(FILE_ID);
  });

  it.each([
    ['a word', 'not-a-uuid'],
    ['a number as text', '42'],
    ['an empty string', ''],
    ['a UUID with a missing group', '3f4b1c62-8a5d-4e21-9d0f'],
    ['a UUID with a trailing character', `${PROJECT_ID}x`],
  ])('rejects %s', (_case: string, value: string) => {
    expect(rejected(projectIdSchema, value)).toHaveLength(1);
  });

  it('does not coerce a non-string into an identifier', () => {
    expect(rejected(projectIdSchema, 42)).toHaveLength(1);
  });
});

describe('route parameters', () => {
  it('parse a project path', () => {
    expect(accepted(projectParamsSchema, { projectId: PROJECT_ID })).toEqual({
      projectId: PROJECT_ID,
    });
  });

  it('parse a project-file path', () => {
    expect(accepted(projectFileParamsSchema, { projectId: PROJECT_ID, fileId: FILE_ID })).toEqual({
      projectId: PROJECT_ID,
      fileId: FILE_ID,
    });
  });

  it('name the parameter that is wrong', () => {
    const issues = rejected(projectFileParamsSchema, { projectId: PROJECT_ID, fileId: 'nope' });

    expect(issues).toEqual([expect.objectContaining({ path: ['fileId'] })]);
  });

  it('reject a project-file path missing its project', () => {
    expect(rejected(projectFileParamsSchema, { fileId: FILE_ID })).toHaveLength(1);
  });
});
