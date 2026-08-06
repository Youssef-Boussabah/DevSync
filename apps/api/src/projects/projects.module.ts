import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { ProjectFilesController } from '../project-files/project-files.controller';
import { ProjectFilesService } from '../project-files/project-files.service';
import { ProjectsController } from './projects.controller';
import { ProjectsService } from './projects.service';

/**
 * Projects and the files inside them.
 *
 * One module for both, because a file is only ever reached through its project:
 * the two controllers serve one nested resource and share the one `Database` the
 * process has. Splitting them into separate modules would divide a boundary that
 * nothing crosses.
 */
@Module({
  imports: [DatabaseModule],
  controllers: [ProjectsController, ProjectFilesController],
  providers: [ProjectsService, ProjectFilesService],
})
export class ProjectsModule {}
