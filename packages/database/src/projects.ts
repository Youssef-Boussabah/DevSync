import type { PrismaClient } from './generated/prisma/client';
import { withPersistenceErrors } from './errors';
import type { ProjectOperations } from './contracts';
import { toProjectFileRecord, toProjectRecord } from './records';

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
