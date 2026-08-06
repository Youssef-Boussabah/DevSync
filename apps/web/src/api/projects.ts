import {
  projectDetailResourceSchema,
  projectListSchema,
  projectResourceSchema,
} from '@devsync/shared';
import type {
  CreateProjectRequest,
  ProjectDetailResource,
  ProjectList,
  ProjectResource,
  UpdateProjectRequest,
} from '@devsync/shared';
import type { RequestOptions } from './http';
import { requestNoContent, requestResource, segment } from './http';

/**
 * The five project routes, one named function each.
 *
 * Named rather than generic: a caller that had to assemble a method, a path, and
 * a schema at each call site would be free to assemble the wrong one, and the
 * route contract would live in the components instead of here.
 */

export function listProjects(options: RequestOptions = {}): Promise<ProjectList> {
  return requestResource(projectListSchema, {
    method: 'GET',
    path: '/projects',
    ...options,
  });
}

/** Answers the project **and** the `main.ts` the API creates it with. */
export function createProject(
  request: CreateProjectRequest,
  options: RequestOptions = {},
): Promise<ProjectDetailResource> {
  return requestResource(projectDetailResourceSchema, {
    method: 'POST',
    path: '/projects',
    body: request,
    ...options,
  });
}

/** The project and a summary of each of its files. Never their contents. */
export function getProject(
  projectId: string,
  options: RequestOptions = {},
): Promise<ProjectDetailResource> {
  return requestResource(projectDetailResourceSchema, {
    method: 'GET',
    path: `/projects/${segment(projectId)}`,
    ...options,
  });
}

export function renameProject(
  projectId: string,
  request: UpdateProjectRequest,
  options: RequestOptions = {},
): Promise<ProjectResource> {
  return requestResource(projectResourceSchema, {
    method: 'PATCH',
    path: `/projects/${segment(projectId)}`,
    body: request,
    ...options,
  });
}

/** Permanent, and it takes every file in the project with it. */
export function deleteProject(projectId: string, options: RequestOptions = {}): Promise<void> {
  return requestNoContent({
    method: 'DELETE',
    path: `/projects/${segment(projectId)}`,
    ...options,
  });
}
