/**
 * Everything the API reads from its environment, and the only place it is read.
 *
 * This runs before the application exists: `ConfigModule` calls it while the
 * module graph is being built, so a value that is missing or malformed fails
 * startup with a message naming the variable, rather than surfacing later as a
 * connection to nowhere.
 */
export interface ApiConfiguration {
  port: number;
  databaseUrl: string;
}

const DEFAULT_PORT = 3001;

const POSTGRES_PROTOCOLS = new Set(['postgres:', 'postgresql:']);

export function validateApiConfiguration(environment: Record<string, unknown>): ApiConfiguration {
  return {
    port: readPort(environment.API_PORT),
    databaseUrl: readDatabaseUrl(environment.DATABASE_URL),
  };
}

function readPort(value: unknown): number {
  if (value === undefined || value === '') {
    return DEFAULT_PORT;
  }

  const port = Number(value);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    // Reported by type when it is not a scalar, so an object in the environment
    // cannot turn this message into "[object Object]".
    const received =
      typeof value === 'string' || typeof value === 'number' ? String(value) : typeof value;

    throw new Error(`API_PORT must be a TCP port between 1 and 65535. Received: ${received}`);
  }

  return port;
}

function readDatabaseUrl(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(
      'DATABASE_URL is required and was not set. The API does not fall back to a default ' +
        'database — see `.env.example` for the development value, or start PostgreSQL with ' +
        '`docker compose up -d database`.',
    );
  }

  const url = parseDatabaseUrl(value.trim());

  if (!POSTGRES_PROTOCOLS.has(url.protocol)) {
    throw new Error(
      `DATABASE_URL must be a PostgreSQL connection URL. It begins with "${url.protocol}".`,
    );
  }

  if (url.pathname === '' || url.pathname === '/') {
    throw new Error('DATABASE_URL must name a database, for example postgresql://…:5432/devsync.');
  }

  return value.trim();
}

function parseDatabaseUrl(value: string): URL {
  try {
    return new URL(value);
  } catch {
    // Deliberately without the value: it carries a password, and this message
    // ends up in whatever collects the process's output.
    throw new Error('DATABASE_URL is not a valid connection URL.');
  }
}
