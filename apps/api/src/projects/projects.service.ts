import { Inject, Injectable } from '@nestjs/common';
import type { Database } from '@devsync/database';
import type {
  CreateProjectRequest,
  ProjectDetailResource,
  ProjectResource,
  UpdateProjectRequest,
} from '@devsync/shared';
import { projectNotFound } from '../common/api-error';
import {
  toProjectDetailResource,
  toProjectFileSummaryResource,
  toProjectResource,
} from '../common/resources';
import { DATABASE } from '../database/database.token';
import { STARTER_FILE } from './starter-file';

@Injectable()
export class ProjectsService {
  constructor(@Inject(DATABASE) private readonly database: Database) {}

  /**
   * The starter file is the API's, the transaction is the package's. The response
   * carries the new file's identifier so a client can open what it just created
   * without listing the project to find one — and carries it as a summary, so a
   * create does not become the route that ships file contents.
   */
  async create(request: CreateProjectRequest): Promise<ProjectDetailResource> {
    const created = await this.database.projects.createWithInitialFile({
      project: { name: request.name },
      initialFile: STARTER_FILE,
    });

    return toProjectDetailResource(created.project, [toProjectFileSummaryResource(created.file)]);
  }

  /** Most recently updated first; the order is the data layer's, and the index behind it. */
  async list(): Promise<ProjectResource[]> {
    const projects = await this.database.projects.list();

    return projects.map(toProjectResource);
  }

  async detail(projectId: string): Promise<ProjectDetailResource> {
    // `null` is a project that is not there, which only this layer can turn into
    // an answer: the data layer is right not to decide that a lookup missing is
    // an error.
    const project = await this.database.projects.findById(projectId);

    if (project === null) {
      throw projectNotFound();
    }

    const files = await this.database.files.list(projectId);

    return toProjectDetailResource(project, files.map(toProjectFileSummaryResource));
  }

  async rename(projectId: string, request: UpdateProjectRequest): Promise<ProjectResource> {
    return toProjectResource(await this.database.projects.rename(projectId, request.name));
  }

  /** Permanent, and the files go with it by the cascade in the schema. */
  async delete(projectId: string): Promise<void> {
    await this.database.projects.delete(projectId);
  }
}
