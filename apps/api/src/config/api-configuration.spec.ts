import { validateApiConfiguration } from './api-configuration';

const DATABASE_URL = 'postgresql://devsync:devsync@127.0.0.1:5433/devsync';
const WEB_ORIGIN = 'http://127.0.0.1:3000';

/** The required pair, so a test about one variable does not have to restate the other. */
const REQUIRED = { DATABASE_URL, WEB_ORIGIN };

describe('validateApiConfiguration', () => {
  it('accepts a PostgreSQL URL and a web origin, and defaults the port', () => {
    expect(validateApiConfiguration(REQUIRED)).toEqual({
      port: 3001,
      databaseUrl: DATABASE_URL,
      webOrigin: WEB_ORIGIN,
    });
  });

  it('reads a port that was given', () => {
    const config = validateApiConfiguration({ ...REQUIRED, API_PORT: '4311' });

    expect(config.port).toBe(4311);
  });

  it.each([['0'], ['65536'], ['-1'], ['http'], ['3001.5']])(
    'refuses the port %p',
    (port: string) => {
      expect(() => validateApiConfiguration({ ...REQUIRED, API_PORT: port })).toThrow(
        /API_PORT must be a TCP port/,
      );
    },
  );

  it('refuses to start without DATABASE_URL', () => {
    expect(() => validateApiConfiguration({ WEB_ORIGIN })).toThrow(/DATABASE_URL is required/);
  });

  it('refuses an empty DATABASE_URL rather than treating it as unset', () => {
    expect(() => validateApiConfiguration({ ...REQUIRED, DATABASE_URL: '   ' })).toThrow(
      /DATABASE_URL is required/,
    );
  });

  it('refuses a DATABASE_URL that is not a URL', () => {
    expect(() => validateApiConfiguration({ ...REQUIRED, DATABASE_URL: 'not a url' })).toThrow(
      /not a valid connection URL/,
    );
  });

  it('refuses a database that is not PostgreSQL', () => {
    expect(() =>
      validateApiConfiguration({ ...REQUIRED, DATABASE_URL: 'mysql://host:3306/devsync' }),
    ).toThrow(/must be a PostgreSQL connection URL/);
  });

  it('refuses a URL that names no database', () => {
    expect(() =>
      validateApiConfiguration({
        ...REQUIRED,
        DATABASE_URL: 'postgresql://devsync:devsync@127.0.0.1:5433',
      }),
    ).toThrow(/must name a database/);
  });

  it('never repeats the connection string in a failure message', () => {
    const secret = 'postgresql://devsync:hunter2@127.0.0.1:5433';

    // The URL carries a password, and a startup failure ends up in whatever
    // collects the process's output.
    expect(rejectionMessage({ ...REQUIRED, DATABASE_URL: secret })).not.toContain('hunter2');
  });

  describe('WEB_ORIGIN', () => {
    it('refuses to start without one, rather than guessing which site may read the API', () => {
      expect(() => validateApiConfiguration({ DATABASE_URL })).toThrow(/WEB_ORIGIN is required/);
    });

    it('refuses an empty one rather than treating it as unset', () => {
      expect(() => validateApiConfiguration({ ...REQUIRED, WEB_ORIGIN: '   ' })).toThrow(
        /WEB_ORIGIN is required/,
      );
    });

    it('accepts an https origin', () => {
      const config = validateApiConfiguration({
        ...REQUIRED,
        WEB_ORIGIN: 'https://devsync.example',
      });

      expect(config.webOrigin).toBe('https://devsync.example');
    });

    it('drops a trailing slash, because a browser never sends one', () => {
      const config = validateApiConfiguration({
        ...REQUIRED,
        WEB_ORIGIN: 'http://127.0.0.1:3000/',
      });

      expect(config.webOrigin).toBe('http://127.0.0.1:3000');
    });

    it('refuses a value that is not a URL at all', () => {
      expect(() => validateApiConfiguration({ ...REQUIRED, WEB_ORIGIN: '127.0.0.1:3000' })).toThrow(
        /WEB_ORIGIN is not a valid URL/,
      );
    });

    it.each([['ws://127.0.0.1:3000'], ['file:///tmp'], ['ftp://127.0.0.1']])(
      'refuses the non-browser origin %p',
      (origin: string) => {
        expect(() => validateApiConfiguration({ ...REQUIRED, WEB_ORIGIN: origin })).toThrow(
          /must be an http:\/\/ or https:\/\/ origin/,
        );
      },
    );

    it('refuses credentials, which an Origin header never carries', () => {
      expect(() =>
        validateApiConfiguration({ ...REQUIRED, WEB_ORIGIN: 'http://user:pass@127.0.0.1:3000' }),
      ).toThrow(/must not carry credentials/);
    });

    it.each([['http://127.0.0.1:3000?a=1'], ['http://127.0.0.1:3000#top']])(
      'refuses %p, which is a URL rather than an origin',
      (origin: string) => {
        expect(() => validateApiConfiguration({ ...REQUIRED, WEB_ORIGIN: origin })).toThrow(
          /must not carry a query string or a fragment/,
        );
      },
    );

    it('refuses a path, and names the origin that was meant', () => {
      expect(() =>
        validateApiConfiguration({ ...REQUIRED, WEB_ORIGIN: 'http://127.0.0.1:3000/app' }),
      ).toThrow(/must not carry a path.*Use http:\/\/127\.0\.0\.1:3000 instead/s);
    });
  });
});

/** The message a rejected configuration produced, or a failure saying it was not rejected. */
function rejectionMessage(environment: Record<string, unknown>): string {
  try {
    validateApiConfiguration(environment);
  } catch (error) {
    if (error instanceof Error) {
      return error.message;
    }

    throw error;
  }

  throw new Error('Expected the configuration to be rejected, but it was accepted.');
}
