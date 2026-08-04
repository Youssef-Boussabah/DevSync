import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client';
import type { Database, DatabaseOptions } from './contracts';
import { unavailable } from './errors';
import { createProjectFileOperations } from './project-files';
import { createProjectOperations } from './projects';

/**
 * Builds the one client this process gets.
 *
 * Nothing is constructed at import time: the pool exists only once a caller has
 * supplied a connection string. Everything below the returned object — the
 * adapter, the Prisma client, the pool — stays private to this closure, so no
 * caller can reach past the operations and run whatever query it likes.
 */
export function createDatabase({ connectionString }: DatabaseOptions): Database {
  const adapter = new PrismaPg({ connectionString });
  const client = new PrismaClient({ adapter });

  let connected = false;

  return {
    projects: createProjectOperations(client),
    files: createProjectFileOperations(client),

    async connect() {
      if (connected) {
        return;
      }

      try {
        await client.$connect();
        // `$connect` can be satisfied by the pool alone, so it is not on its own
        // proof that the server is there. One trivial query is.
        await client.$queryRaw`SELECT 1`;
      } catch (error) {
        await client.$disconnect().catch(() => undefined);
        throw unavailable(error);
      }

      connected = true;
    },

    async disconnect() {
      if (!connected) {
        return;
      }

      connected = false;
      await client.$disconnect();
    },
  };
}
