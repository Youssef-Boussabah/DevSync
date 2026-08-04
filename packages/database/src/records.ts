import type { Project, ProjectFile } from './generated/prisma/client';

/**
 * What this package hands back, and what it accepts.
 *
 * These are storage records, not HTTP contracts. A Prisma model type must never
 * escape the package — a column added for storage reasons would otherwise appear
 * on the wire the moment it existed — so every operation maps its rows onto the
 * shapes below.
 */

export interface ProjectRecord {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectFileRecord {
  id: string;
  projectId: string;
  name: string;
  language: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

/** A file without its contents, for listings. */
export type ProjectFileSummaryRecord = Omit<ProjectFileRecord, 'content'>;

/** Both rows written by the one transaction that creates a project. */
export interface ProjectWithInitialFileRecord {
  project: ProjectRecord;
  file: ProjectFileRecord;
}

export interface NewProject {
  name: string;
}

export interface NewProjectFile {
  name: string;
  language: string;
  content: string;
}

/**
 * The starter file a new project is created with. The caller supplies it in
 * full: what a new project should contain is a product decision, and this
 * package has no business holding an opinion about it.
 */
export interface NewProjectWithInitialFile {
  project: NewProject;
  initialFile: NewProjectFile;
}

/**
 * A partial file change. Absent means "leave it alone" — every property is
 * optional, and passing none is a caller error rather than a no-op write.
 */
export interface ProjectFileChanges {
  name?: string;
  language?: string;
  content?: string;
}

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
