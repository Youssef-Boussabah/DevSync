import { describe, expect, it } from 'vitest';
import type { NewProjectWithInitialFile } from '../src';
import { countRows, isUuid, persistenceFailure, useTestDatabase } from './support/test-database';

const database = useTestDatabase();

function newProject(name: string): NewProjectWithInitialFile {
  return {
    project: { name },
    initialFile: { name: 'main.ts', language: 'typescript', content: 'export {};\n' },
  };
}

describe('projects', () => {
  it('stores a project and reads it back', async () => {
    const { project } = await database.projects.createWithInitialFile(newProject('First project'));

    const found = await database.projects.findById(project.id);

    expect(found).toEqual(project);
    expect(found?.name).toBe('First project');
  });

  it('gives every project a UUID the database generated', async () => {
    const first = await database.projects.createWithInitialFile(newProject('One'));
    const second = await database.projects.createWithInitialFile(newProject('Two'));

    expect(isUuid(first.project.id)).toBe(true);
    expect(isUuid(second.project.id)).toBe(true);
    expect(first.project.id).not.toBe(second.project.id);
  });

  it('generates both timestamps, and starts them equal', async () => {
    const { project } = await database.projects.createWithInitialFile(newProject('Timestamps'));

    expect(project.createdAt).toBeInstanceOf(Date);
    expect(project.updatedAt).toBeInstanceOf(Date);
    // Written by one statement in one transaction, so they are the same moment
    // rather than two clock readings that happen to be close.
    expect(project.updatedAt).toEqual(project.createdAt);
  });

  it('allows two projects to share a name', async () => {
    const first = await database.projects.createWithInitialFile(newProject('Untitled'));
    const second = await database.projects.createWithInitialFile(newProject('Untitled'));

    expect(second.project.id).not.toBe(first.project.id);
    expect(await countRows('projects')).toBe(2);
  });

  it('returns nothing for a project that does not exist', async () => {
    const missing = await database.projects.findById('00000000-0000-4000-8000-000000000000');

    expect(missing).toBeNull();
  });

  it('lists projects most recently updated first, breaking ties on the identifier', async () => {
    await database.projects.createWithInitialFile(newProject('Alpha'));
    await database.projects.createWithInitialFile(newProject('Beta'));
    await database.projects.createWithInitialFile(newProject('Gamma'));

    const listed = await database.projects.list();

    expect(listed).toHaveLength(3);
    // Asserted as the ordering rule rather than as one expected sequence: the
    // rule is what the API promises, and it holds however the timestamps fall.
    for (let index = 1; index < listed.length; index += 1) {
      const earlier = listed[index - 1];
      const later = listed[index];

      expect(earlier).toBeDefined();
      expect(later).toBeDefined();

      if (earlier === undefined || later === undefined) {
        continue;
      }

      const byTimestamp = earlier.updatedAt.getTime() - later.updatedAt.getTime();

      expect(byTimestamp >= 0).toBe(true);

      if (byTimestamp === 0) {
        expect(earlier.id > later.id).toBe(true);
      }
    }
  });

  it('renames a project and moves its updatedAt', async () => {
    const { project } = await database.projects.createWithInitialFile(newProject('Working title'));

    const renamed = await database.projects.rename(project.id, 'Final title');

    expect(renamed.name).toBe('Final title');
    expect(renamed.id).toBe(project.id);
    expect(renamed.createdAt).toEqual(project.createdAt);
    expect(renamed.updatedAt.getTime()).toBeGreaterThanOrEqual(project.updatedAt.getTime());
  });

  it('refuses to rename a project that does not exist', async () => {
    const failure = await persistenceFailure(
      database.projects.rename('00000000-0000-4000-8000-000000000000', 'Nope'),
    );

    expect(failure).toEqual({ kind: 'notFound', entity: 'project' });
  });

  it('deletes a project', async () => {
    const { project } = await database.projects.createWithInitialFile(newProject('Doomed'));

    await database.projects.delete(project.id);

    expect(await database.projects.findById(project.id)).toBeNull();
    expect(await countRows('projects')).toBe(0);
  });

  it('deletes every file in a project along with it', async () => {
    const { project } = await database.projects.createWithInitialFile(newProject('Cascade'));
    await database.files.create(project.id, {
      name: 'helper.ts',
      language: 'typescript',
      content: '',
    });
    const survivor = await database.projects.createWithInitialFile(newProject('Survivor'));

    expect(await countRows('project_files')).toBe(3);

    await database.projects.delete(project.id);

    // The cascade is the schema's, not a loop in application code: the project's
    // own files are gone and the other project's are untouched.
    expect(await countRows('project_files')).toBe(1);
    expect(await database.files.list(survivor.project.id)).toHaveLength(1);
  });

  it('refuses to delete a project that does not exist', async () => {
    const failure = await persistenceFailure(
      database.projects.delete('00000000-0000-4000-8000-000000000000'),
    );

    expect(failure).toEqual({ kind: 'notFound', entity: 'project' });
  });
});
