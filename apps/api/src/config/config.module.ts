import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateApiConfiguration } from './api-configuration';

/**
 * Configuration loading, which arrives with the first variable that is not a
 * port. Global, because both the port in `main.ts` and the database connection
 * come from here and nothing else should be reading `process.env`.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      // Resolved from the working directory, which is the application's own
      // directory under pnpm and Turborepo. The repository root is listed second
      // because that is where `.env.example` sits and therefore where a
      // developer's `.env` ends up. In a container neither file exists and
      // Compose passes the values directly.
      envFilePath: ['.env', '../../.env'],
      validate: validateApiConfiguration,
    }),
  ],
})
export class ApiConfigModule {}
