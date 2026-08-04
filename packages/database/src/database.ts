import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client';
import { unavailable } from './errors';
import { createProjectFileOperations, type ProjectFileOperations } from './project-files';
import { createProjectOperations, type ProjectOperations } from './projects';

export interface DatabaseOptions {
  /**
   * A PostgreSQL connection string. It arrives already validated from the
   * application that owns configuration; this package reads no environment
   * variable and has no fallback, so there is no way for it to end up talking to
   * a database nobody chose.
   */
  connectionString: string;
}

export interface Database {
  readonly projects: ProjectOperations;
  readonly files: ProjectFileOperations;

  /**
   * Opens the pool and proves the database answers. Throws an `unavailable`
   * `PersistenceError` if it does not, which is what turns an unreachable
   * database into a failed startup rather than a service that accepts traffic
   * it cannot serve.
   */
  connect(): Promise<void>;

  /** Closes the pool. Safe to call when already disconnected. */
  disconnect(): Promise<void>;
}

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
