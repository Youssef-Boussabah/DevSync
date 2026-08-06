/**
 * `@devsync/shared`
 *
 * The contracts `apps/web` and `apps/api` have to agree on: what a client may
 * send, what it gets back, and what a failure looks like. Every runtime schema
 * here and the TypeScript type beside it come from one definition, so the check
 * that runs and the type that compiles cannot drift apart.
 *
 * Nothing in this package is server-only. It reads no environment variable,
 * opens no connection, and imports nothing from `apps/api`, `apps/web`, or
 * `@devsync/database` — it ships in the browser bundle from C3, and a package
 * that reads configuration cannot safely do that.
 */

export { SUPPORTED_LANGUAGE_IDS, languageIdSchema } from './languages';
export type { LanguageId } from './languages';

export {
  fileIdSchema,
  projectFileParamsSchema,
  projectIdSchema,
  projectParamsSchema,
} from './identifiers';
export type { ProjectFileParams, ProjectParams } from './identifiers';

export {
  createProjectFileRequestSchema,
  createProjectRequestSchema,
  updateProjectFileRequestSchema,
  updateProjectRequestSchema,
} from './requests';
export type {
  CreateProjectFileRequest,
  CreateProjectRequest,
  UpdateProjectFileRequest,
  UpdateProjectRequest,
} from './requests';

export {
  projectDetailResourceSchema,
  projectFileResourceSchema,
  projectFileSummaryListSchema,
  projectFileSummaryResourceSchema,
  projectListSchema,
  projectResourceSchema,
  utcTimestampSchema,
} from './resources';
export type {
  ProjectDetailResource,
  ProjectFileResource,
  ProjectFileSummaryList,
  ProjectFileSummaryResource,
  ProjectList,
  ProjectResource,
} from './resources';

export {
  API_ERROR_CODES,
  apiErrorCodeSchema,
  apiErrorResourceSchema,
  apiIssuePathSchema,
  apiIssuePathSegmentSchema,
  apiIssueSchema,
} from './errors';
export type {
  ApiErrorCode,
  ApiErrorResource,
  ApiIssue,
  ApiIssuePath,
  ApiIssuePathSegment,
} from './errors';

export { parseContract } from './contract';
export type { ContractResult, ContractSchema, ContractValue } from './contract';
