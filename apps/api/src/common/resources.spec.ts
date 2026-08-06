import type { ProjectFileRecord, ProjectRecord } from '@devsync/database';
import { ApiError } from './api-error';
import {
  toProjectDetailResource,
  toProjectFileResource,
  toProjectFileSummaryResource,
  toProjectResource,
} from './resources';

// The seam between storage and the wire. The database hands back `Date` objects
// and its own record types; a client must receive neither.

const project: ProjectRecord = {
  id: '3f4b1c62-8a5d-4e21-9d0f-6c7b2a915e83',
  name: 'My project',
  createdAt: new Date('2026-08-04T09:15:30.000Z'),
  updatedAt: new Date('2026-08-04T09:16:00.500Z'),
};

const file: ProjectFileRecord = {
  id: 'b81d2f47-5c30-4a9e-8f16-7d40e2c95ab1',
  projectId: project.id,
  name: 'main.ts',
  language: 'typescript',
  content: 'export {};\n',
  createdAt: new Date('2026-08-04T09:15:30.000Z'),
  updatedAt: new Date('2026-08-04T09:15:30.000Z'),
};

describe('mapping a project', () => {
  it('turns both timestamps into UTC ISO-8601 strings', () => {
    expect(toProjectResource(project)).toEqual({
      id: project.id,
      name: 'My project',
      createdAt: '2026-08-04T09:15:30.000Z',
      updatedAt: '2026-08-04T09:16:00.500Z',
    });
  });

  it('adds files only when a detail resource asks for them', () => {
    expect(toProjectResource(project)).not.toHaveProperty('files');
    expect(toProjectDetailResource(project, [])).toHaveProperty('files', []);
  });

  it('carries file summaries in a detail resource', () => {
    const detail = toProjectDetailResource(project, [toProjectFileSummaryResource(file)]);

    expect(detail.files).toEqual([expect.objectContaining({ id: file.id, name: 'main.ts' })]);
  });
});

describe('mapping a file', () => {
  it('leaves the content out of a summary', () => {
    const summary = toProjectFileSummaryResource(file);

    expect(summary).not.toHaveProperty('content');
    expect(summary).toEqual({
      id: file.id,
      projectId: project.id,
      name: 'main.ts',
      language: 'typescript',
      createdAt: '2026-08-04T09:15:30.000Z',
      updatedAt: '2026-08-04T09:15:30.000Z',
    });
  });

  it('includes the content in a full resource', () => {
    expect(toProjectFileResource(file)).toHaveProperty('content', 'export {};\n');
  });

  it('treats empty content as content rather than dropping the property', () => {
    expect(toProjectFileResource({ ...file, content: '' })).toHaveProperty('content', '');
  });

  it('copies only the properties the contract names', () => {
    // A column added to the table for storage reasons must not reach a client
    // merely because the record was spread.
    const withExtra = { ...file, internalRevision: 7 };

    expect(toProjectFileResource(withExtra)).not.toHaveProperty('internalRevision');
  });

  it('fails as an internal error when a stored language is not one DevSync supports', () => {
    // Only reachable if the supported list loses a value that rows already hold —
    // a disagreement between the schema and the contract, not a client request.
    const error = refusal(() => toProjectFileSummaryResource({ ...file, language: 'rust' }));

    expect(error.statusCode).toBe(500);
    expect(error.code).toBe('INTERNAL_ERROR');
    // What was actually stored belongs in the log, through the cause, not in the
    // message a client reads.
    expect(error.message).not.toContain('rust');
  });
});

/** The error a mapping threw, or a failure saying it did not throw one. */
function refusal(run: () => unknown): ApiError {
  try {
    run();
  } catch (error) {
    if (error instanceof ApiError) {
      return error;
    }

    throw error;
  }

  throw new Error('Expected the mapping to fail, but it succeeded.');
}
