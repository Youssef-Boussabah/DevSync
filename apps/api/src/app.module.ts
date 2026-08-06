import { Module } from '@nestjs/common';
import { ApiConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { ProjectsModule } from './projects/projects.module';

@Module({
  imports: [ApiConfigModule, DatabaseModule, HealthModule, ProjectsModule],
})
export class AppModule {}
