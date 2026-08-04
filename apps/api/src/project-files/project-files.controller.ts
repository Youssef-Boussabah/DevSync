import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import {
  createProjectFileRequestSchema,
  projectFileParamsSchema,
  projectParamsSchema,
  updateProjectFileRequestSchema,
} from '@devsync/shared';
import type {
  CreateProjectFileRequest,
  ProjectFileParams,
  ProjectFileResource,
  ProjectFileSummaryResource,
  ProjectParams,
  UpdateProjectFileRequest,
} from '@devsync/shared';
import { validatedBody, validatedPath } from '../common/contract.pipe';
import { ProjectFilesService } from './project-files.service';

/**
 * Files are addressed under their project, because a file has no meaning outside
 * one. A flat `/files/:fileId` would make the project a query parameter on every
 * request and an authorization check to remember on every one of them.
 */
@Controller('projects/:projectId/files')
export class ProjectFilesController {
  constructor(private readonly files: ProjectFilesService) {}

  @Post()
  create(
    @Param(validatedPath(projectParamsSchema)) { projectId }: ProjectParams,
    @Body(validatedBody(createProjectFileRequestSchema)) request: CreateProjectFileRequest,
  ): Promise<ProjectFileResource> {
    return this.files.create(projectId, request);
  }

  @Get()
  list(
    @Param(validatedPath(projectParamsSchema)) { projectId }: ProjectParams,
  ): Promise<ProjectFileSummaryResource[]> {
    return this.files.list(projectId);
  }

  @Get(':fileId')
  find(
    @Param(validatedPath(projectFileParamsSchema)) { projectId, fileId }: ProjectFileParams,
  ): Promise<ProjectFileResource> {
    return this.files.find(projectId, fileId);
  }

  @Patch(':fileId')
  update(
    @Param(validatedPath(projectFileParamsSchema)) { projectId, fileId }: ProjectFileParams,
    @Body(validatedBody(updateProjectFileRequestSchema)) request: UpdateProjectFileRequest,
  ): Promise<ProjectFileResource> {
    return this.files.update(projectId, fileId, request);
  }

  @Delete(':fileId')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(
    @Param(validatedPath(projectFileParamsSchema)) { projectId, fileId }: ProjectFileParams,
  ): Promise<void> {
    return this.files.delete(projectId, fileId);
  }
}
