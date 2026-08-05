/**
 * The browser's view of `apps/api`.
 *
 * Components import from here and get named operations and typed failures.
 * Nothing else in `apps/web` calls `fetch`, reads a status code, or parses a
 * response body — which is what keeps the route contract in one directory
 * instead of spread across the interface.
 */

export { API_BASE_URL, resolveApiBaseUrl } from './api-url';

export {
  ApiRequestError,
  CLIENT_ERROR_CODES,
  apiUnavailable,
  errorMessage,
  hasErrorCode,
  isApiRequestError,
  issueMessageFor,
  malformedResponse,
} from './api-error';
export type { ApiFailureCode, ClientErrorCode } from './api-error';

export { isAbortError } from './http';
export type { RequestOptions } from './http';

export { createProject, deleteProject, getProject, listProjects, renameProject } from './projects';

export {
  createProjectFile,
  deleteProjectFile,
  getProjectFile,
  updateProjectFile,
} from './project-files';
