import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import type { Database } from '@devsync/database';
import { DATABASE } from './database.token';

/**
 * Opens the connection while the application starts, and closes it while it
 * stops.
 *
 * `onModuleInit` runs during application initialisation — which `app.listen()`
 * performs before it binds anything, and which `app.init()` performs on its own
 * in tests. Creating the application is not enough to trigger it. So a database
 * that cannot be reached rejects `listen`, and the process exits non-zero
 * without ever accepting a request. That is the intended behaviour: a service
 * that accepts requests it cannot serve is worse than one that refuses to
 * start.
 *
 * `onModuleDestroy` runs on shutdown, which needs `enableShutdownHooks()` for a
 * signal-terminated process — `main.ts` calls it.
 */
@Injectable()
export class DatabaseLifecycle implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseLifecycle.name);

  constructor(@Inject(DATABASE) private readonly database: Database) {}

  async onModuleInit(): Promise<void> {
    await this.database.connect();
    // No connection string, here or anywhere else: it carries a password.
    this.logger.log('Connected to PostgreSQL.');
  }

  async onModuleDestroy(): Promise<void> {
    await this.database.disconnect();
  }
}
