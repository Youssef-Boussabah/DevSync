import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import type { ApiConfiguration } from './config/api-configuration';
import { HTTP_APPLICATION_OPTIONS, configureHttpApplication } from './http-application';

async function bootstrap(): Promise<void> {
  // Building the module graph validates the configuration, because
  // `ConfigModule` runs the validator as the graph is assembled. A missing or
  // malformed `DATABASE_URL` therefore rejects here, before anything connects.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, HTTP_APPLICATION_OPTIONS);

  const config = app.get(ConfigService<ApiConfiguration, true>);

  // Before `listen`, because the global filter has to be registered by the time
  // Nest installs its router hooks — that is what puts it in front of a body the
  // parser rejected as well as in front of every route. The allowed origin comes
  // from the validated configuration, so the running service and the integration
  // suite are configured by the same function from the same kind of value.
  configureHttpApplication(app, { webOrigin: config.get('webOrigin', { infer: true }) });

  // Without this, SIGTERM kills the process before `onModuleDestroy` runs and
  // the connection pool is never closed. Compose sends exactly that on `down`.
  app.enableShutdownHooks();

  // `listen` initialises the application first, which is what runs the
  // `onModuleInit` hooks — including the one that opens the database. A
  // database that cannot be reached rejects this call, so the process exits
  // non-zero without ever binding the port.
  await app.listen(config.get('port', { infer: true }));
}

void bootstrap();
