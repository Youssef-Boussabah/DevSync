import type { ProjectFileRecord, ProjectFileSummaryRecord, ProjectRecord } from '@devsync/database';
import { languageIdSchema, parseContract } from '@devsync/shared';
import type {
  LanguageId,
  ProjectDetailResource,
  ProjectFileResource,
  ProjectFileSummaryResource,
  ProjectResource,
} from '@devsync/shared';
import { internalError } from './api-error';

/**
 * Storage records in, wire resources out.
 *
 * Every property is copied across by hand rather than spread, so a column added
 * to a table for storage reasons cannot appear in a response by accident, and a
 * `Date` cannot reach a client in whatever format a serialiser happened to
 * choose. Timestamps become UTC ISO-8601 strings here and nowhere else.
 */

export function toProjectResource(project: ProjectRecord): ProjectResource {
  return {
    id: project.id,
    name: project.name,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
  };
}

export function toProjectDetailResource(
  project: ProjectRecord,
  files: ProjectFileSummaryResource[],
): ProjectDetailResource {
  return { ...toProjectResource(project), files };
}

/** A file as a listing shows it: everything except what is in it. */
export function toProjectFileSummaryResource(
  file: ProjectFileSummaryRecord,
): ProjectFileSummaryResource {
  return {
    id: file.id,
    projectId: file.projectId,
    name: file.name,
    language: toLanguageId(file.language),
    createdAt: file.createdAt.toISOString(),
    updatedAt: file.updatedAt.toISOString(),
  };
}

export function toProjectFileResource(file: ProjectFileRecord): ProjectFileResource {
  return { ...toProjectFileSummaryResource(file), content: file.content };
}

/**
 * The language is stored as an ordinary string, because the supported set belongs
 * to `@devsync/shared` rather than to a column. A row holding a value that set no
 * longer contains is a disagreement between the two — an internal inconsistency
 * rather than anything a client asked for — so it fails as one instead of being
 * coerced or quietly dropped.
 */
function toLanguageId(stored: string): LanguageId {
  const result = parseContract(languageIdSchema, stored);

  if (!result.ok) {
    throw internalError(new Error(`Stored language "${stored}" is not one DevSync supports.`));
  }

  return result.value;
}
