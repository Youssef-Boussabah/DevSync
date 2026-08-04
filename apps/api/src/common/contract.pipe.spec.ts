import {
  createProjectFileRequestSchema,
  createProjectRequestSchema,
  projectFileParamsSchema,
} from '@devsync/shared';
import { ApiError } from './api-error';
import { validatedBody, validatedPath } from './contract.pipe';

// The pipes themselves, without a route around them. Two things matter here: that
// what comes out is the transformed value rather than what was sent, and that a
// failure carries the code the client is supposed to branch on.

const PROJECT_ID = '3f4b1c62-8a5d-4e21-9d0f-6c7b2a915e83';
const FILE_ID = 'b81d2f47-5c30-4a9e-8f16-7d40e2c95ab1';

/** The error a pipe threw, or a failure saying it did not throw one. */
function refusal(run: () => unknown): ApiError {
  try {
    run();
  } catch (error) {
    if (error instanceof ApiError) {
      return error;
    }

    throw error;
  }

  throw new Error('Expected the pipe to reject the value, but it accepted it.');
}

describe('a validated request body', () => {
  const pipe = validatedBody(createProjectRequestSchema);

  it('passes the trimmed value on, not the one that arrived', () => {
    expect(pipe.transform({ name: '  My project  ' }, { type: 'body' })).toEqual({
      name: 'My project',
    });
  });

  it('applies the defaults the contract declares', () => {
    const files = validatedBody(createProjectFileRequestSchema);

    expect(files.transform({ name: 'utils.ts', language: 'typescript' }, { type: 'body' })).toEqual(
      {
        name: 'utils.ts',
        language: 'typescript',
        content: '',
      },
    );
  });

  it('rejects with VALIDATION_FAILED and a 400', () => {
    const error = refusal(() => pipe.transform({ name: '' }, { type: 'body' }));

    expect(error.code).toBe('VALIDATION_FAILED');
    expect(error.statusCode).toBe(400);
  });

  it('says which property was wrong', () => {
    const error = refusal(() => pipe.transform({ name: '' }, { type: 'body' }));

    expect(error.issues?.map((issue) => issue.path)).toEqual([['name']]);
  });

  it('rejects a body that is not an object at all', () => {
    expect(refusal(() => pipe.transform(null, { type: 'body' })).code).toBe('VALIDATION_FAILED');
  });
});

describe('validated path identifiers', () => {
  const pipe = validatedPath(projectFileParamsSchema);

  it('passes a well-formed pair through', () => {
    expect(pipe.transform({ projectId: PROJECT_ID, fileId: FILE_ID }, { type: 'param' })).toEqual({
      projectId: PROJECT_ID,
      fileId: FILE_ID,
    });
  });

  it('rejects with INVALID_IDENTIFIER rather than VALIDATION_FAILED', () => {
    const error = refusal(() =>
      pipe.transform({ projectId: 'nope', fileId: FILE_ID }, { type: 'param' }),
    );

    expect(error.code).toBe('INVALID_IDENTIFIER');
    expect(error.statusCode).toBe(400);
  });

  it('names the identifier that is wrong', () => {
    const error = refusal(() =>
      pipe.transform({ projectId: PROJECT_ID, fileId: '7' }, { type: 'param' }),
    );

    expect(error.issues?.map((issue) => issue.path)).toEqual([['fileId']]);
  });
});
