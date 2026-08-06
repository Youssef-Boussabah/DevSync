import { projectFileResourceSchema } from '@devsync/shared';
import type {
  CreateProjectFileRequest,
  ProjectFileResource,
  UpdateProjectFileRequest,
} from '@devsync/shared';
import type { RequestOptions } from './http';
import { requestNoContent, requestResource, segment } from './http';

/**
 * The file routes the workspace uses.
 *
 * `GET /projects/:projectId/files` is deliberately absent: opening a project
 * already answers with a summary of every file in it, so a client that listed
 * them separately would be making a second request for what it was just given.
 * The route exists on the API and gains a function here when something needs one.
 */

export function createProjectFile(
  projectId: string,
  request: CreateProjectFileRequest,
  options: RequestOptions = {},
): Promise<ProjectFileResource> {
  return requestResource(projectFileResourceSchema, {
    method: 'POST',
    path: `/projects/${segment(projectId)}/files`,
    body: request,
    ...options,
  });
}

/** One complete file, contents included. This is the only route that carries them. */
export function getProjectFile(
  projectId: string,
  fileId: string,
  options: RequestOptions = {},
): Promise<ProjectFileResource> {
  return requestResource(projectFileResourceSchema, {
    method: 'GET',
    path: `/projects/${segment(projectId)}/files/${segment(fileId)}`,
    ...options,
  });
}

/**
 * Any combination of name, language, and content. Sending all three is never
 * required, so a save carries only what the user actually changed.
 */
export function updateProjectFile(
  projectId: string,
  fileId: string,
  request: UpdateProjectFileRequest,
  options: RequestOptions = {},
): Promise<ProjectFileResource> {
  return requestResource(projectFileResourceSchema, {
    method: 'PATCH',
    path: `/projects/${segment(projectId)}/files/${segment(fileId)}`,
    body: request,
    ...options,
  });
}

export function deleteProjectFile(
  projectId: string,
  fileId: string,
  options: RequestOptions = {},
): Promise<void> {
  return requestNoContent({
    method: 'DELETE',
    path: `/projects/${segment(projectId)}/files/${segment(fileId)}`,
    ...options,
  });
}
