import { Test } from '@nestjs/testing';
import type { Database } from '@devsync/database';
import { DatabaseLifecycle } from './database.lifecycle';
import { DATABASE } from './database.token';

// A stand-in for the data layer. What is under test here is the wiring — that
// Nest opens the connection on the way up and closes it on the way down — not
// anything about PostgreSQL. That belongs to `pnpm test:db`, and mocking a
// database while claiming database behaviour is what that layer exists to avoid.
function fakeDatabase() {
  const connect = jest.fn<Promise<void>, []>().mockResolvedValue(undefined);
  const disconnect = jest.fn<Promise<void>, []>().mockResolvedValue(undefined);

  const database: Database = {
    connect,
    disconnect,
    // The lifecycle never touches the operations, and standing up ten more mocks
    // to say so would obscure the three assertions that matter.
    projects: {} as Database['projects'],
    files: {} as Database['files'],
  };

  return { database, connect, disconnect };
}

function bootstrap(database: Database) {
  return Test.createTestingModule({
    providers: [DatabaseLifecycle, { provide: DATABASE, useValue: database }],
  }).compile();
}

describe('DatabaseLifecycle', () => {
  it('connects while the application is starting', async () => {
    const { database, connect } = fakeDatabase();
    const moduleRef = await bootstrap(database);

    expect(connect).not.toHaveBeenCalled();

    await moduleRef.init();

    expect(connect).toHaveBeenCalledTimes(1);

    await moduleRef.close();
  });

  it('disconnects while the application is stopping', async () => {
    const { database, disconnect } = fakeDatabase();
    const moduleRef = await bootstrap(database);

    await moduleRef.init();
    expect(disconnect).not.toHaveBeenCalled();

    await moduleRef.close();

    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('fails startup when the database cannot be reached', async () => {
    const unreachable = new Error('The database is unavailable.');
    const { database, connect } = fakeDatabase();
    connect.mockRejectedValue(unreachable);

    const moduleRef = await bootstrap(database);

    await expect(moduleRef.init()).rejects.toThrow(unreachable);
  });
});
