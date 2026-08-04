import { describe, expect, it } from 'vitest';
import {
  createProjectFileRequestSchema,
  createProjectRequestSchema,
  updateProjectFileRequestSchema,
  updateProjectRequestSchema,
} from '../src';
import { accepted, issuePaths, rejected } from './support/contract';

describe('creating a project', () => {
  it('trims the name before anything stores it', () => {
    expect(accepted(createProjectRequestSchema, { name: '  My project  ' })).toEqual({
      name: 'My project',
    });
  });

  it('rejects a name that is empty', () => {
    expect(issuePaths(rejected(createProjectRequestSchema, { name: '' }))).toEqual(['name']);
  });

  it('rejects a name that is only whitespace, because trimming leaves nothing', () => {
    expect(issuePaths(rejected(createProjectRequestSchema, { name: '   ' }))).toEqual(['name']);
  });

  it('accepts a name of exactly 100 characters', () => {
    const name = 'p'.repeat(100);

    expect(accepted(createProjectRequestSchema, { name })).toEqual({ name });
  });

  it('rejects a name of 101 characters', () => {
    expect(issuePaths(rejected(createProjectRequestSchema, { name: 'p'.repeat(101) }))).toEqual([
      'name',
    ]);
  });

  it('measures the length after trimming, not before', () => {
    const name = `  ${'p'.repeat(100)}  `;

    expect(accepted(createProjectRequestSchema, { name })).toEqual({ name: 'p'.repeat(100) });
  });

  it('requires a name', () => {
    expect(rejected(createProjectRequestSchema, {})).toHaveLength(1);
  });

  it('rejects a name that is not a string, rather than coercing it', () => {
    expect(rejected(createProjectRequestSchema, { name: 42 })).toHaveLength(1);
  });

  it('rejects an unknown property instead of dropping it', () => {
    expect(rejected(createProjectRequestSchema, { name: 'My project', id: 'mine' })).not.toEqual(
      [],
    );
  });

  it('rejects a body that is not an object', () => {
    expect(rejected(createProjectRequestSchema, null)).toHaveLength(1);
    expect(rejected(createProjectRequestSchema, 'My project')).toHaveLength(1);
  });
});

describe('renaming a project', () => {
  it('accepts a new name and trims it', () => {
    expect(accepted(updateProjectRequestSchema, { name: '  Renamed  ' })).toEqual({
      name: 'Renamed',
    });
  });

  it('rejects an empty body, because renaming is the only change there is', () => {
    expect(rejected(updateProjectRequestSchema, {})).toHaveLength(1);
  });

  it('rejects a body carrying only an unknown property', () => {
    expect(rejected(updateProjectRequestSchema, { title: 'Renamed' })).not.toEqual([]);
  });

  it('rejects a null body', () => {
    expect(rejected(updateProjectRequestSchema, null)).toHaveLength(1);
  });
});

describe('creating a file', () => {
  const validFile = { name: 'utils.ts', language: 'typescript', content: 'export {};\n' };

  it('accepts a complete file', () => {
    expect(accepted(createProjectFileRequestSchema, validFile)).toEqual(validFile);
  });

  it('defaults omitted content to an empty string', () => {
    expect(
      accepted(createProjectFileRequestSchema, { name: 'utils.ts', language: 'typescript' }),
    ).toEqual({ name: 'utils.ts', language: 'typescript', content: '' });
  });

  it('accepts content that is explicitly empty', () => {
    expect(accepted(createProjectFileRequestSchema, { ...validFile, content: '' })).toEqual({
      ...validFile,
      content: '',
    });
  });

  it('does not trim content, because whitespace is part of a file', () => {
    const content = '\n  indented\n\n';

    expect(accepted(createProjectFileRequestSchema, { ...validFile, content })).toEqual({
      ...validFile,
      content,
    });
  });

  it('trims the file name', () => {
    expect(
      accepted(createProjectFileRequestSchema, { ...validFile, name: '  utils.ts  ' }),
    ).toEqual(validFile);
  });

  it('rejects a file name that is only whitespace', () => {
    expect(
      issuePaths(rejected(createProjectFileRequestSchema, { ...validFile, name: ' ' })),
    ).toEqual(['name']);
  });

  it('accepts a file name of exactly 255 characters', () => {
    const name = 'f'.repeat(255);

    expect(accepted(createProjectFileRequestSchema, { ...validFile, name })).toEqual({
      ...validFile,
      name,
    });
  });

  it('rejects a file name of 256 characters', () => {
    expect(
      issuePaths(rejected(createProjectFileRequestSchema, { ...validFile, name: 'f'.repeat(256) })),
    ).toEqual(['name']);
  });

  it('rejects an unsupported language', () => {
    expect(
      issuePaths(rejected(createProjectFileRequestSchema, { ...validFile, language: 'rust' })),
    ).toEqual(['language']);
  });

  it('requires a language, because nothing infers one from the name', () => {
    expect(
      rejected(createProjectFileRequestSchema, { name: 'utils.ts', content: '' }),
    ).toHaveLength(1);
  });

  it('rejects a client-supplied identifier', () => {
    expect(rejected(createProjectFileRequestSchema, { ...validFile, id: 'mine' })).not.toEqual([]);
  });

  it('rejects a project identifier in the body, because it belongs in the path', () => {
    expect(
      rejected(createProjectFileRequestSchema, { ...validFile, projectId: 'somewhere' }),
    ).not.toEqual([]);
  });
});

describe('changing a file', () => {
  it('accepts a rename on its own, and says nothing about the language', () => {
    expect(accepted(updateProjectFileRequestSchema, { name: 'renamed.ts' })).toEqual({
      name: 'renamed.ts',
    });
  });

  it('accepts a language change on its own, and says nothing about the name', () => {
    expect(accepted(updateProjectFileRequestSchema, { language: 'python' })).toEqual({
      language: 'python',
    });
  });

  it('accepts a content change on its own', () => {
    expect(accepted(updateProjectFileRequestSchema, { content: 'print("hi")\n' })).toEqual({
      content: 'print("hi")\n',
    });
  });

  it('accepts every combination at once', () => {
    const changes = { name: 'main.py', language: 'python', content: '' };

    expect(accepted(updateProjectFileRequestSchema, changes)).toEqual(changes);
  });

  it('accepts emptying a file', () => {
    expect(accepted(updateProjectFileRequestSchema, { content: '' })).toEqual({ content: '' });
  });

  it('trims a new name', () => {
    expect(accepted(updateProjectFileRequestSchema, { name: '  renamed.ts  ' })).toEqual({
      name: 'renamed.ts',
    });
  });

  it('applies the same length rules to a new name', () => {
    expect(accepted(updateProjectFileRequestSchema, { name: 'f'.repeat(255) })).toEqual({
      name: 'f'.repeat(255),
    });
    expect(rejected(updateProjectFileRequestSchema, { name: 'f'.repeat(256) })).toHaveLength(1);
  });

  it('rejects a change set with nothing in it', () => {
    expect(rejected(updateProjectFileRequestSchema, {})).not.toEqual([]);
  });

  it('rejects a body carrying only unknown properties', () => {
    expect(rejected(updateProjectFileRequestSchema, { contents: 'oops' })).not.toEqual([]);
  });

  it('rejects an unsupported language', () => {
    expect(issuePaths(rejected(updateProjectFileRequestSchema, { language: 'rust' }))).toEqual([
      'language',
    ]);
  });

  it('rejects a null body', () => {
    expect(rejected(updateProjectFileRequestSchema, null)).toHaveLength(1);
  });
});
