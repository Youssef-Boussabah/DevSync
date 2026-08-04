import { Module } from '@nestjs/common';
import { ApiConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [ApiConfigModule, DatabaseModule, HealthModule],
})
export class AppModule {}
