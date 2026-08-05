/**
 * Everything the API reads from its environment, and the only place it is read.
 *
 * This runs before the application exists: `ConfigModule` calls it while the
 * module graph is being built, so a value that is missing or malformed fails
 * startup with a message naming the variable, rather than surfacing later as a
 * connection to nowhere — or, for the origin below, as a browser quietly
 * refusing every response.
 */
export interface ApiConfiguration {
  port: number;
  databaseUrl: string;
  /** The one origin cross-origin browser requests are answered for. */
  webOrigin: string;
}

const DEFAULT_PORT = 3001;

const POSTGRES_PROTOCOLS = new Set(['postgres:', 'postgresql:']);

const BROWSER_PROTOCOLS = new Set(['http:', 'https:']);

export function validateApiConfiguration(environment: Record<string, unknown>): ApiConfiguration {
  return {
    port: readPort(environment.API_PORT),
    databaseUrl: readDatabaseUrl(environment.DATABASE_URL),
    webOrigin: readWebOrigin(environment.WEB_ORIGIN),
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

/**
 * The exact origin `apps/web` is served from, required from C3 because that is
 * the milestone where a browser first calls this API from a different origin.
 *
 * An origin is a scheme, a host, and a port — nothing else. A path, a query, a
 * fragment, or credentials in this value would each mean the author was
 * describing a URL rather than an origin, and a `Origin` header never carries
 * any of them, so the comparison the browser makes would silently never match.
 * There is no default: an API that guesses which site may read it is an API that
 * has stopped enforcing anything.
 */
function readWebOrigin(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(
      'WEB_ORIGIN is required and was not set. It is the exact origin the browser loads DevSync ' +
        'from — scheme, host, and port — and the only origin this API answers cross-origin ' +
        'requests for. See `.env.example`.',
    );
  }

  const trimmed = value.trim();
  let url: URL;

  try {
    url = new URL(trimmed);
  } catch {
    throw new Error(`WEB_ORIGIN is not a valid URL. Received: ${trimmed}`);
  }

  if (!BROWSER_PROTOCOLS.has(url.protocol)) {
    throw new Error(`WEB_ORIGIN must be an http:// or https:// origin. Received: ${trimmed}`);
  }

  if (url.username !== '' || url.password !== '') {
    throw new Error('WEB_ORIGIN must not carry credentials; an origin is scheme, host, and port.');
  }

  if (url.search !== '' || url.hash !== '') {
    throw new Error(
      'WEB_ORIGIN must not carry a query string or a fragment; an origin is scheme, host, and port.',
    );
  }

  if (url.pathname !== '/') {
    throw new Error(
      `WEB_ORIGIN must not carry a path. Received: ${trimmed}. Use ${url.origin} instead.`,
    );
  }

  // `URL.origin` drops the trailing slash a browser never sends, so
  // `http://127.0.0.1:3000/` and `http://127.0.0.1:3000` become one value.
  return url.origin;
}
