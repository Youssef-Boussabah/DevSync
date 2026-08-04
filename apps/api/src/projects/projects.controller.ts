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
  createProjectRequestSchema,
  projectParamsSchema,
  updateProjectRequestSchema,
} from '@devsync/shared';
import type {
  CreateProjectRequest,
  ProjectDetailResource,
  ProjectParams,
  ProjectResource,
  UpdateProjectRequest,
} from '@devsync/shared';
import { validatedBody, validatedPath } from '../common/contract.pipe';
import { ProjectsService } from './projects.service';

@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Post()
  create(
    @Body(validatedBody(createProjectRequestSchema)) request: CreateProjectRequest,
  ): Promise<ProjectDetailResource> {
    return this.projects.create(request);
  }

  @Get()
  list(): Promise<ProjectResource[]> {
    return this.projects.list();
  }

  @Get(':projectId')
  detail(
    @Param(validatedPath(projectParamsSchema)) { projectId }: ProjectParams,
  ): Promise<ProjectDetailResource> {
    return this.projects.detail(projectId);
  }

  @Patch(':projectId')
  rename(
    @Param(validatedPath(projectParamsSchema)) { projectId }: ProjectParams,
    @Body(validatedBody(updateProjectRequestSchema)) request: UpdateProjectRequest,
  ): Promise<ProjectResource> {
    return this.projects.rename(projectId, request);
  }

  @Delete(':projectId')
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Param(validatedPath(projectParamsSchema)) { projectId }: ProjectParams): Promise<void> {
    return this.projects.delete(projectId);
  }
}
