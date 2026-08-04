import type { PrismaClient } from './generated/prisma/client';
import { withPersistenceErrors } from './errors';
import type {
  NewProjectWithInitialFile,
  ProjectRecord,
  ProjectWithInitialFileRecord,
} from './records';
import { toProjectFileRecord, toProjectRecord } from './records';

export interface ProjectOperations {
  /**
   * Creates a project and its first file in one transaction. If either insert
   * fails, neither row remains.
   *
   * The starter file arrives from the caller. This package does not decide what
   * a new project's first file is called, what language it opens as, or what it
   * says — that is a product decision, and it belongs to the API.
   */
  createWithInitialFile(input: NewProjectWithInitialFile): Promise<ProjectWithInitialFileRecord>;

  /** Most recently updated first, with the identifier as the final tie-breaker. */
  list(): Promise<ProjectRecord[]>;

  findById(projectId: string): Promise<ProjectRecord | null>;

  /** Throws a `notFound` `PersistenceError` if there is no such project. */
  rename(projectId: string, name: string): Promise<ProjectRecord>;

  /** Permanently deletes the project and, by cascade, every file in it. */
  delete(projectId: string): Promise<void>;
}

export function createProjectOperations(client: PrismaClient): ProjectOperations {
  return {
    async createWithInitialFile({ project, initialFile }) {
      return withPersistenceErrors('project', () =>
        client.$transaction(async (tx) => {
          // One timestamp for both rows: they are written together, and saying
          // so exactly is what makes the transaction observable from outside.
          const createdAt = new Date();

          const projectRow = await tx.project.create({
            data: { name: project.name, createdAt, updatedAt: createdAt },
          });

          const fileRow = await tx.projectFile.create({
            data: {
              projectId: projectRow.id,
              name: initialFile.name,
              language: initialFile.language,
              content: initialFile.content,
              createdAt,
              updatedAt: createdAt,
            },
          });

          return { project: toProjectRecord(projectRow), file: toProjectFileRecord(fileRow) };
        }),
      );
    },

    async list() {
      const rows = await withPersistenceErrors('project', () =>
        client.project.findMany({ orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }] }),
      );

      return rows.map(toProjectRecord);
    },

    async findById(projectId) {
      const row = await withPersistenceErrors('project', () =>
        client.project.findUnique({ where: { id: projectId } }),
      );

      return row === null ? null : toProjectRecord(row);
    },

    async rename(projectId, name) {
      const row = await withPersistenceErrors('project', () =>
        client.project.update({
          where: { id: projectId },
          data: { name, updatedAt: new Date() },
        }),
      );

      return toProjectRecord(row);
    },

    async delete(projectId) {
      await withPersistenceErrors('project', () =>
        client.project.delete({ where: { id: projectId } }),
      );
    },
  };
}
