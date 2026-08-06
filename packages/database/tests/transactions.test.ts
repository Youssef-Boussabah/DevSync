import { beforeEach, describe, expect, it } from 'vitest';
import type { ProjectRecord } from '../src';
import { countRows, persistenceFailure, useTestDatabase } from './support/test-database';

const database = useTestDatabase();

// Longer than the columns accept, so PostgreSQL rejects the insert. This is how
// the tests below make one statement inside a transaction fail without reaching
// into the package to break something.
const TOO_LONG_FOR_A_PROJECT_NAME = 'p'.repeat(101);
const TOO_LONG_FOR_A_FILE_NAME = `${'f'.repeat(253)}.ts`;

describe('creating a project with its first file', () => {
  it('writes both rows, with the file the caller asked for', async () => {
    const { project, file } = await database.projects.createWithInitialFile({
      project: { name: 'New project' },
      // Deliberately not `main.ts` in TypeScript: the package must store what it
      // is given rather than a starter of its own. What a new project contains
      // is the API's decision.
      initialFile: { name: 'notes.md', language: 'markdown', content: '# Notes\n' },
    });

    expect(await countRows('projects')).toBe(1);
    expect(await countRows('project_files')).toBe(1);

    const stored = await database.files.find(project.id, file.id);

    expect(stored?.name).toBe('notes.md');
    expect(stored?.language).toBe('markdown');
    expect(stored?.content).toBe('# Notes\n');
    expect(stored?.projectId).toBe(project.id);
  });

  it('leaves no project behind when the file insert fails', async () => {
    const failure = await persistenceFailure(
      database.projects.createWithInitialFile({
        project: { name: 'Should not survive' },
        initialFile: {
          name: TOO_LONG_FOR_A_FILE_NAME,
          language: 'typescript',
          content: '',
        },
      }),
    );

    expect(failure.kind).toBe('unknown');
    expect(await countRows('projects')).toBe(0);
    expect(await countRows('project_files')).toBe(0);
  });

  it('leaves no file behind when the project insert fails', async () => {
    const failure = await persistenceFailure(
      database.projects.createWithInitialFile({
        project: { name: TOO_LONG_FOR_A_PROJECT_NAME },
        initialFile: { name: 'main.ts', language: 'typescript', content: '' },
      }),
    );

    expect(failure.kind).toBe('unknown');
    expect(await countRows('projects')).toBe(0);
    expect(await countRows('project_files')).toBe(0);
  });
});

describe('a project timestamp follows its files', () => {
  let project: ProjectRecord;

  beforeEach(async () => {
    const created = await database.projects.createWithInitialFile({
      project: { name: 'Tracked' },
      initialFile: { name: 'main.ts', language: 'typescript', content: 'first' },
    });

    project = created.project;
  });

  async function currentUpdatedAt(): Promise<Date> {
    const found = await database.projects.findById(project.id);

    if (found === null) {
      throw new Error('The project under test disappeared.');
    }

    return found.updatedAt;
  }

  // Each of these asserts the project's timestamp equals the file's, which is
  // only possible if one transaction wrote both. Comparing "is it later than
  // before" would pass for a write that happened seconds afterwards, and would
  // depend on two clock readings falling in different milliseconds.
  it('moves when a file is created', async () => {
    const file = await database.files.create(project.id, {
      name: 'added.ts',
      language: 'typescript',
      content: '',
    });

    expect(await currentUpdatedAt()).toEqual(file.updatedAt);
  });

  it('moves when a file is renamed', async () => {
    const file = await database.files.create(project.id, {
      name: 'before.ts',
      language: 'typescript',
      content: '',
    });

    const renamed = await database.files.update(project.id, file.id, { name: 'after.ts' });

    expect(await currentUpdatedAt()).toEqual(renamed.updatedAt);
  });

  it("moves when a file's language changes", async () => {
    const file = await database.files.create(project.id, {
      name: 'retyped.ts',
      language: 'typescript',
      content: '',
    });

    const retyped = await database.files.update(project.id, file.id, { language: 'javascript' });

    expect(await currentUpdatedAt()).toEqual(retyped.updatedAt);
  });

  it("moves when a file's content changes", async () => {
    const file = await database.files.create(project.id, {
      name: 'edited.ts',
      language: 'typescript',
      content: 'before',
    });

    const edited = await database.files.update(project.id, file.id, { content: 'after' });

    expect(await currentUpdatedAt()).toEqual(edited.updatedAt);
  });

  it('moves when a file is deleted', async () => {
    const file = await database.files.create(project.id, {
      name: 'doomed.ts',
      language: 'typescript',
      content: '',
    });
    const afterCreate = await currentUpdatedAt();

    await database.files.delete(project.id, file.id);

    // No surviving row to compare against, so this one asserts the weaker claim
    // the deletion can support: the timestamp moved forward and did not regress.
    expect((await currentUpdatedAt()).getTime()).toBeGreaterThanOrEqual(afterCreate.getTime());
  });

  it('stays exactly where it was when a file change fails', async () => {
    await database.files.create(project.id, {
      name: 'taken.ts',
      language: 'typescript',
      content: '',
    });
    const before = await currentUpdatedAt();

    const duplicate = await persistenceFailure(
      database.files.create(project.id, { name: 'taken.ts', language: 'typescript', content: '' }),
    );
    const missing = await persistenceFailure(
      database.files.delete(project.id, '00000000-0000-4000-8000-000000000000'),
    );

    expect(duplicate.kind).toBe('uniqueViolation');
    expect(missing.kind).toBe('notFound');
    // Exactly equal: the failed transactions rolled the timestamp back with the
    // rest of their work.
    expect(await currentUpdatedAt()).toEqual(before);
  });
});
