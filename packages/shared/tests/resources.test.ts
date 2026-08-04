import { describe, expect, it } from 'vitest';
import {
  projectDetailResourceSchema,
  projectFileResourceSchema,
  projectFileSummaryListSchema,
  projectFileSummaryResourceSchema,
  projectListSchema,
  projectResourceSchema,
  utcTimestampSchema,
} from '../src';
import { accepted, issuePaths, rejected } from './support/contract';

// The response contracts. The API maps every property across by hand, so these
// schemas are what an integration test parses a real response through — a route
// that grew a field or dropped a timestamp fails there rather than reaching a
// client.

const PROJECT_ID = '3f4b1c62-8a5d-4e21-9d0f-6c7b2a915e83';
const FILE_ID = 'b81d2f47-5c30-4a9e-8f16-7d40e2c95ab1';
const CREATED_AT = '2026-08-04T09:15:30.000Z';
const UPDATED_AT = '2026-08-04T09:16:00.500Z';

const project = {
  id: PROJECT_ID,
  name: 'My project',
  createdAt: CREATED_AT,
  updatedAt: UPDATED_AT,
};

const summary = {
  id: FILE_ID,
  projectId: PROJECT_ID,
  name: 'main.ts',
  language: 'typescript',
  createdAt: CREATED_AT,
  updatedAt: UPDATED_AT,
};

describe('timestamps on the wire', () => {
  it('accept a UTC instant, which is what Date#toISOString produces', () => {
    expect(accepted(utcTimestampSchema, CREATED_AT)).toBe(CREATED_AT);
  });

  it('reject a local time with an offset', () => {
    expect(rejected(utcTimestampSchema, '2026-08-04T09:15:30+02:00')).toHaveLength(1);
  });

  it('reject a date with no time at all', () => {
    expect(rejected(utcTimestampSchema, '2026-08-04')).toHaveLength(1);
  });

  it('reject a millisecond number, because the wire format is a string', () => {
    expect(rejected(utcTimestampSchema, 1_754_298_930_000)).toHaveLength(1);
  });
});

describe('a project resource', () => {
  it('is an identifier, a name, and two timestamps', () => {
    expect(accepted(projectResourceSchema, project)).toEqual(project);
  });

  it('does not carry files, because a listing must not cost what a project weighs', () => {
    expect(rejected(projectResourceSchema, { ...project, files: [] })).not.toEqual([]);
  });

  it('rejects a timestamp that is not an instant', () => {
    expect(
      issuePaths(rejected(projectResourceSchema, { ...project, createdAt: 'yesterday' })),
    ).toEqual(['createdAt']);
  });
});

describe('a project-file summary', () => {
  it('is everything about a file except what is in it', () => {
    expect(accepted(projectFileSummaryResourceSchema, summary)).toEqual(summary);
  });

  it('rejects content, so a summary that leaked one fails to parse', () => {
    expect(rejected(projectFileSummaryResourceSchema, { ...summary, content: '' })).not.toEqual([]);
  });

  it('rejects a language nobody offers', () => {
    expect(
      issuePaths(rejected(projectFileSummaryResourceSchema, { ...summary, language: 'rust' })),
    ).toEqual(['language']);
  });
});

describe('a full project-file resource', () => {
  it('carries the content as well', () => {
    const file = { ...summary, content: 'export {};\n' };

    expect(accepted(projectFileResourceSchema, file)).toEqual(file);
  });

  it('treats empty content as content', () => {
    expect(accepted(projectFileResourceSchema, { ...summary, content: '' })).toEqual({
      ...summary,
      content: '',
    });
  });

  it('requires content rather than allowing it to be omitted', () => {
    expect(issuePaths(rejected(projectFileResourceSchema, summary))).toEqual(['content']);
  });
});

describe('a project detail resource', () => {
  it('is a project and a summary of each of its files', () => {
    const detail = { ...project, files: [summary] };

    expect(accepted(projectDetailResourceSchema, detail)).toEqual(detail);
  });

  it('accepts a project with no files, because deleting the last one is allowed', () => {
    expect(accepted(projectDetailResourceSchema, { ...project, files: [] })).toEqual({
      ...project,
      files: [],
    });
  });

  it('rejects a file that carries its content', () => {
    const detail = { ...project, files: [{ ...summary, content: 'leaked' }] };

    expect(rejected(projectDetailResourceSchema, detail)).not.toEqual([]);
  });

  it('points at the file that is wrong, by index', () => {
    const detail = { ...project, files: [summary, { ...summary, language: 'rust' }] };

    expect(issuePaths(rejected(projectDetailResourceSchema, detail))).toEqual(['files.1.language']);
  });

  it('requires the files property, so an omission cannot read as an empty project', () => {
    expect(issuePaths(rejected(projectDetailResourceSchema, project))).toEqual(['files']);
  });
});

describe('the two listings', () => {
  it('are bare arrays, with no envelope around them', () => {
    expect(accepted(projectListSchema, [project])).toEqual([project]);
    expect(accepted(projectFileSummaryListSchema, [summary])).toEqual([summary]);
  });

  it('accept an empty listing', () => {
    expect(accepted(projectListSchema, [])).toEqual([]);
  });

  it('reject an envelope', () => {
    expect(rejected(projectListSchema, { data: [project] })).not.toEqual([]);
  });

  it('reject a file listing that carries contents', () => {
    expect(rejected(projectFileSummaryListSchema, [{ ...summary, content: 'leaked' }])).not.toEqual(
      [],
    );
  });
});
