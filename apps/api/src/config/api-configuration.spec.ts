import { validateApiConfiguration } from './api-configuration';

const DATABASE_URL = 'postgresql://devsync:devsync@127.0.0.1:5433/devsync';

describe('validateApiConfiguration', () => {
  it('accepts a PostgreSQL URL and defaults the port', () => {
    expect(validateApiConfiguration({ DATABASE_URL })).toEqual({
      port: 3001,
      databaseUrl: DATABASE_URL,
    });
  });

  it('reads a port that was given', () => {
    const config = validateApiConfiguration({ DATABASE_URL, API_PORT: '4311' });

    expect(config.port).toBe(4311);
  });

  it.each([['0'], ['65536'], ['-1'], ['http'], ['3001.5']])(
    'refuses the port %p',
    (port: string) => {
      expect(() => validateApiConfiguration({ DATABASE_URL, API_PORT: port })).toThrow(
        /API_PORT must be a TCP port/,
      );
    },
  );

  it('refuses to start without DATABASE_URL', () => {
    expect(() => validateApiConfiguration({})).toThrow(/DATABASE_URL is required/);
  });

  it('refuses an empty DATABASE_URL rather than treating it as unset', () => {
    expect(() => validateApiConfiguration({ DATABASE_URL: '   ' })).toThrow(
      /DATABASE_URL is required/,
    );
  });

  it('refuses a DATABASE_URL that is not a URL', () => {
    expect(() => validateApiConfiguration({ DATABASE_URL: 'not a url' })).toThrow(
      /not a valid connection URL/,
    );
  });

  it('refuses a database that is not PostgreSQL', () => {
    expect(() => validateApiConfiguration({ DATABASE_URL: 'mysql://host:3306/devsync' })).toThrow(
      /must be a PostgreSQL connection URL/,
    );
  });

  it('refuses a URL that names no database', () => {
    expect(() =>
      validateApiConfiguration({ DATABASE_URL: 'postgresql://devsync:devsync@127.0.0.1:5433' }),
    ).toThrow(/must name a database/);
  });

  it('never repeats the connection string in a failure message', () => {
    const secret = 'postgresql://devsync:hunter2@127.0.0.1:5433';

    // The URL carries a password, and a startup failure ends up in whatever
    // collects the process's output.
    expect(rejectionMessage({ DATABASE_URL: secret })).not.toContain('hunter2');
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
