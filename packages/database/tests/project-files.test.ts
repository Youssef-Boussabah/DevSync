import { beforeEach, describe, expect, it } from 'vitest';
import type { ProjectRecord } from '../src';
import { countRows, isUuid, persistenceFailure, useTestDatabase } from './support/test-database';

const database = useTestDatabase();

const MISSING_ID = '00000000-0000-4000-8000-000000000000';

let project: ProjectRecord;

beforeEach(async () => {
  const created = await database.projects.createWithInitialFile({
    project: { name: 'Host project' },
    initialFile: { name: 'main.ts', language: 'typescript', content: 'export {};\n' },
  });

  project = created.project;
});

describe('project files', () => {
  it('stores a file and reads it back in full', async () => {
    const created = await database.files.create(project.id, {
      name: 'utils.ts',
      language: 'typescript',
      content: 'export const answer = 42;\n',
    });

    const found = await database.files.find(project.id, created.id);

    expect(found).toEqual(created);
    expect(isUuid(created.id)).toBe(true);
    expect(created.projectId).toBe(project.id);
    expect(created.content).toBe('export const answer = 42;\n');
  });

  it('accepts empty content and gives it back as an empty string', async () => {
    const created = await database.files.create(project.id, {
      name: 'empty.ts',
      language: 'typescript',
      content: '',
    });

    const found = await database.files.find(project.id, created.id);

    expect(created.content).toBe('');
    expect(found?.content).toBe('');
  });

  it('stores the language as whatever string it was given', async () => {
    const created = await database.files.create(project.id, {
      name: 'notes.md',
      language: 'markdown',
      content: '# Notes\n',
    });

    expect(created.language).toBe('markdown');
    // No enum and no check constraint: a language the product does not offer is
    // rejected at the API boundary, not by the schema, which is what keeps
    // adding one from being a migration.
    const unknown = await database.files.create(project.id, {
      name: 'mystery.txt',
      language: 'plaintext',
      content: '',
    });

    expect(unknown.language).toBe('plaintext');
  });

  it('lists files oldest first, without their contents', async () => {
    await database.files.create(project.id, { name: 'b.ts', language: 'typescript', content: 'b' });
    await database.files.create(project.id, { name: 'a.ts', language: 'typescript', content: 'a' });

    const listed = await database.files.list(project.id);

    expect(listed.map((file) => file.name)).toEqual(['main.ts', 'b.ts', 'a.ts']);
    expect(listed[0]).not.toHaveProperty('content');

    for (let index = 1; index < listed.length; index += 1) {
      const earlier = listed[index - 1];
      const later = listed[index];

      if (earlier === undefined || later === undefined) {
        continue;
      }

      const byTimestamp = earlier.createdAt.getTime() - later.createdAt.getTime();

      expect(byTimestamp <= 0).toBe(true);

      if (byTimestamp === 0) {
        expect(earlier.id < later.id).toBe(true);
      }
    }
  });

  it('rejects a second file with the same name in one project', async () => {
    await database.files.create(project.id, {
      name: 'utils.ts',
      language: 'typescript',
      content: '',
    });

    const failure = await persistenceFailure(
      database.files.create(project.id, { name: 'utils.ts', language: 'typescript', content: '' }),
    );

    expect(failure).toEqual({ kind: 'uniqueViolation', constraint: 'projectFileName' });
    expect(await database.files.list(project.id)).toHaveLength(2);
  });

  it('allows the same file name in a different project', async () => {
    const other = await database.projects.createWithInitialFile({
      project: { name: 'Other project' },
      initialFile: { name: 'main.ts', language: 'typescript', content: '' },
    });

    await database.files.create(project.id, {
      name: 'shared.ts',
      language: 'typescript',
      content: 'here',
    });
    const elsewhere = await database.files.create(other.project.id, {
      name: 'shared.ts',
      language: 'typescript',
      content: 'and here',
    });

    expect(elsewhere.name).toBe('shared.ts');
    expect(await countRows('project_files')).toBe(4);
  });

  // The collation the migration pins on `project_files.name` is what decides
  // this. Without it the answer depends on the locale the server was
  // initialised with, which is not a thing to leave to the environment.
  it('treats file names as case-sensitive', async () => {
    await database.files.create(project.id, {
      name: 'README.md',
      language: 'markdown',
      content: 'upper',
    });

    const lower = await database.files.create(project.id, {
      name: 'readme.md',
      language: 'markdown',
      content: 'lower',
    });

    expect(lower.name).toBe('readme.md');
    expect((await database.files.list(project.id)).map((file) => file.name)).toContain('README.md');

    const failure = await persistenceFailure(
      database.files.create(project.id, { name: 'README.md', language: 'markdown', content: '' }),
    );

    expect(failure).toEqual({ kind: 'uniqueViolation', constraint: 'projectFileName' });
  });

  it('renames a file without touching its language', async () => {
    const created = await database.files.create(project.id, {
      name: 'old.ts',
      language: 'typescript',
      content: 'kept',
    });

    const renamed = await database.files.update(project.id, created.id, { name: 'new.ts' });

    expect(renamed.name).toBe('new.ts');
    expect(renamed.language).toBe('typescript');
    expect(renamed.content).toBe('kept');
  });

  it('changes a language without renaming the file', async () => {
    const created = await database.files.create(project.id, {
      name: 'script.ts',
      language: 'typescript',
      content: 'print("hi")',
    });

    const retyped = await database.files.update(project.id, created.id, { language: 'python' });

    expect(retyped.language).toBe('python');
    expect(retyped.name).toBe('script.ts');
    expect(retyped.content).toBe('print("hi")');
  });

  it('replaces content on its own', async () => {
    const created = await database.files.create(project.id, {
      name: 'edit.ts',
      language: 'typescript',
      content: 'before',
    });

    const edited = await database.files.update(project.id, created.id, { content: 'after' });

    expect(edited.content).toBe('after');
    expect(edited.name).toBe('edit.ts');
    expect(edited.language).toBe('typescript');
  });

  it('deletes a file and leaves the rest of the project alone', async () => {
    const created = await database.files.create(project.id, {
      name: 'doomed.ts',
      language: 'typescript',
      content: '',
    });

    await database.files.delete(project.id, created.id);

    expect(await database.files.find(project.id, created.id)).toBeNull();
    expect((await database.files.list(project.id)).map((file) => file.name)).toEqual(['main.ts']);
  });

  it('will not reach a file through the wrong project', async () => {
    const other = await database.projects.createWithInitialFile({
      project: { name: 'Other project' },
      initialFile: { name: 'main.ts', language: 'typescript', content: 'theirs' },
    });

    expect(await database.files.find(project.id, other.file.id)).toBeNull();

    const updateFailure = await persistenceFailure(
      database.files.update(project.id, other.file.id, { content: 'stolen' }),
    );
    const deleteFailure = await persistenceFailure(
      database.files.delete(project.id, other.file.id),
    );

    expect(updateFailure).toEqual({ kind: 'notFound', entity: 'projectFile' });
    expect(deleteFailure).toEqual({ kind: 'notFound', entity: 'projectFile' });

    const untouched = await database.files.find(other.project.id, other.file.id);

    expect(untouched?.content).toBe('theirs');
  });

  it('reports a missing project rather than a missing file', async () => {
    expect(await persistenceFailure(database.files.list(MISSING_ID))).toEqual({
      kind: 'notFound',
      entity: 'project',
    });
    expect(await persistenceFailure(database.files.find(MISSING_ID, MISSING_ID))).toEqual({
      kind: 'notFound',
      entity: 'project',
    });
    expect(
      await persistenceFailure(
        database.files.create(MISSING_ID, { name: 'x.ts', language: 'typescript', content: '' }),
      ),
    ).toEqual({ kind: 'notFound', entity: 'project' });
  });

  it('reports a missing file in a project that exists', async () => {
    expect(
      await persistenceFailure(database.files.update(project.id, MISSING_ID, { content: 'x' })),
    ).toEqual({ kind: 'notFound', entity: 'projectFile' });
    expect(await persistenceFailure(database.files.delete(project.id, MISSING_ID))).toEqual({
      kind: 'notFound',
      entity: 'projectFile',
    });
  });
});
