import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createDatabase } from '@devsync/database';
import type { ApiConfiguration } from '../config/api-configuration';
import { DATABASE } from './database.token';
import { DatabaseLifecycle } from './database.lifecycle';

/**
 * The API's one connection to PostgreSQL.
 *
 * The client itself is built by `@devsync/database`; this module's job is to
 * hand it a connection string the API has already validated, to open it during
 * startup, and to close it during shutdown. Nothing here knows what Prisma is.
 */
@Module({
  providers: [
    {
      provide: DATABASE,
      inject: [ConfigService],
      useFactory: (config: ConfigService<ApiConfiguration, true>) =>
        createDatabase({ connectionString: config.get('databaseUrl', { infer: true }) }),
    },
    DatabaseLifecycle,
  ],
  exports: [DATABASE],
})
export class DatabaseModule {}
