import type { Prisma, PrismaClient } from './generated/prisma/client';
import { withPersistenceErrors } from './errors';
import { PersistenceError, type ProjectFileOperations } from './contracts';
import { toProjectFileRecord, toProjectFileSummaryRecord } from './records';

const summarySelection = {
  id: true,
  projectId: true,
  name: true,
  language: true,
  createdAt: true,
  updatedAt: true,
} as const;

export function createProjectFileOperations(client: PrismaClient): ProjectFileOperations {
  /**
   * Moves the project's `updatedAt`, and doubles as the existence check every
   * file operation needs. It runs first, so a missing project is reported as a
   * missing project; a file failure afterwards rolls this back with it.
   */
  async function touchProject(
    tx: Prisma.TransactionClient,
    projectId: string,
    at: Date,
  ): Promise<void> {
    await withPersistenceErrors('project', () =>
      tx.project.update({ where: { id: projectId }, data: { updatedAt: at } }),
    );
  }

  return {
    async create(projectId, file) {
      return withPersistenceErrors('projectFile', () =>
        client.$transaction(async (tx) => {
          const createdAt = new Date();
          await touchProject(tx, projectId, createdAt);

          const row = await withPersistenceErrors('projectFile', () =>
            tx.projectFile.create({
              data: {
                projectId,
                name: file.name,
                language: file.language,
                content: file.content,
                createdAt,
                updatedAt: createdAt,
              },
            }),
          );

          return toProjectFileRecord(row);
        }),
      );
    },

    async list(projectId) {
      // One round trip: a project that does not exist comes back as `null`,
      // which is the distinction the caller needs, and the files arrive with it.
      const row = await withPersistenceErrors('project', () =>
        client.project.findUnique({
          where: { id: projectId },
          select: {
            files: {
              orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
              select: summarySelection,
            },
          },
        }),
      );

      if (row === null) {
        throw missingProject(projectId);
      }

      return row.files.map(toProjectFileSummaryRecord);
    },

    async find(projectId, fileId) {
      const row = await withPersistenceErrors('project', () =>
        client.project.findUnique({
          where: { id: projectId },
          select: { files: { where: { id: fileId } } },
        }),
      );

      if (row === null) {
        throw missingProject(projectId);
      }

      const file = row.files[0];

      return file === undefined ? null : toProjectFileRecord(file);
    },

    async update(projectId, fileId, changes) {
      return withPersistenceErrors('projectFile', () =>
        client.$transaction(async (tx) => {
          const updatedAt = new Date();
          await touchProject(tx, projectId, updatedAt);

          const data: Prisma.ProjectFileUpdateInput = { updatedAt };

          // Assigned rather than spread: `exactOptionalPropertyTypes` is on, and
          // an explicit `undefined` is a different thing from an absent key.
          if (changes.name !== undefined) {
            data.name = changes.name;
          }
          if (changes.language !== undefined) {
            data.language = changes.language;
          }
          if (changes.content !== undefined) {
            data.content = changes.content;
          }

          const row = await withPersistenceErrors('projectFile', () =>
            tx.projectFile.update({ where: { id: fileId, projectId }, data }),
          );

          return toProjectFileRecord(row);
        }),
      );
    },

    async delete(projectId, fileId) {
      await withPersistenceErrors('projectFile', () =>
        client.$transaction(async (tx) => {
          await touchProject(tx, projectId, new Date());

          await withPersistenceErrors('projectFile', () =>
            tx.projectFile.delete({ where: { id: fileId, projectId } }),
          );
        }),
      );
    },
  };
}

function missingProject(projectId: string): PersistenceError {
  return new PersistenceError(
    { kind: 'notFound', entity: 'project' },
    `No such project: ${projectId}`,
  );
}
