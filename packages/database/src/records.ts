import type { Project, ProjectFile } from './generated/prisma/client';
import type { ProjectFileRecord, ProjectFileSummaryRecord, ProjectRecord } from './contracts';

/**
 * Prisma rows in, this package's own records out.
 *
 * The record shapes themselves live in `contracts.ts`, because a caller has to
 * name them and must not need a generated client to do so. What is here is the
 * mapping, which is the only part that knows what a Prisma model looks like.
 */

export function toProjectRecord(row: Project): ProjectRecord {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toProjectFileRecord(row: ProjectFile): ProjectFileRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    language: row.language,
    content: row.content,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toProjectFileSummaryRecord(
  row: Omit<ProjectFile, 'content'>,
): ProjectFileSummaryRecord {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    language: row.language,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
