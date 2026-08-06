import { Inject, Injectable } from '@nestjs/common';
import { isPersistenceError } from '@devsync/database';
import type { Database, ProjectFileChanges } from '@devsync/database';
import type {
  CreateProjectFileRequest,
  ProjectFileResource,
  ProjectFileSummaryResource,
  UpdateProjectFileRequest,
} from '@devsync/shared';
import { fileNotFound, fromPersistenceError } from '../common/api-error';
import { toProjectFileResource, toProjectFileSummaryResource } from '../common/resources';
import { DATABASE } from '../database/database.token';

@Injectable()
export class ProjectFilesService {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async create(projectId: string, request: CreateProjectFileRequest): Promise<ProjectFileResource> {
    const file = await reportingNameConflicts(request.name, () =>
      this.database.files.create(projectId, {
        name: request.name,
        language: request.language,
        content: request.content,
      }),
    );

    return toProjectFileResource(file);
  }

  /** Summaries, so listing a project does not cost what the code in it weighs. */
  async list(projectId: string): Promise<ProjectFileSummaryResource[]> {
    const files = await this.database.files.list(projectId);

    return files.map(toProjectFileSummaryResource);
  }

  async find(projectId: string, fileId: string): Promise<ProjectFileResource> {
    // The project in the path is part of the lookup rather than decoration, so a
    // file addressed through the wrong project is not found here either.
    const file = await this.database.files.find(projectId, fileId);

    if (file === null) {
      throw fileNotFound();
    }

    return toProjectFileResource(file);
  }

  async update(
    projectId: string,
    fileId: string,
    request: UpdateProjectFileRequest,
  ): Promise<ProjectFileResource> {
    const file = await reportingNameConflicts(request.name, () =>
      this.database.files.update(projectId, fileId, toChanges(request)),
    );

    return toProjectFileResource(file);
  }

  async delete(projectId: string, fileId: string): Promise<void> {
    await this.database.files.delete(projectId, fileId);
  }
}

/**
 * Assigned rather than spread: `exactOptionalPropertyTypes` is on, and a property
 * explicitly set to `undefined` is a different thing from an absent one — which
 * is precisely the difference between "leave the language alone" and "change the
 * language to nothing".
 */
function toChanges(request: UpdateProjectFileRequest): ProjectFileChanges {
  const changes: ProjectFileChanges = {};

  if (request.name !== undefined) {
    changes.name = request.name;
  }
  if (request.language !== undefined) {
    changes.language = request.language;
  }
  if (request.content !== undefined) {
    changes.content = request.content;
  }

  return changes;
}

/**
 * Runs a write that can collide with a name already in the project, so that the
 * conflict names the file the client asked for. The data layer knows a unique
 * constraint was violated; only the caller knows what it was trying to call it.
 */
async function reportingNameConflicts<T>(
  fileName: string | undefined,
  write: () => Promise<T>,
): Promise<T> {
  try {
    return await write();
  } catch (error) {
    throw isPersistenceError(error) ? fromPersistenceError(error, { fileName }) : error;
  }
}
