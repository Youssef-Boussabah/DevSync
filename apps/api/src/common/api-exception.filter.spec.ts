import type { Server } from 'node:http';
import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { PersistenceError } from '@devsync/database';
import type { Database, PersistenceFailure } from '@devsync/database';
import { apiErrorResourceSchema, parseContract } from '@devsync/shared';
import type { ApiErrorResource } from '@devsync/shared';
import { DATABASE } from '../database/database.token';
import { HTTP_APPLICATION_OPTIONS, configureHttpApplication } from '../http-application';
import { ProjectFilesController } from '../project-files/project-files.controller';
import { ProjectFilesService } from '../project-files/project-files.service';
import { ProjectsController } from '../projects/projects.controller';
import { ProjectsService } from '../projects/projects.service';

// What a failure looks like on the wire, proved by making the data layer fail on
// purpose. A real PostgreSQL cannot be asked to be unavailable in the middle of
// an integration run without taking the rest of that run with it, so the four
// persistence meanings are injected here instead — the mapping is the thing under
// test, and it is the same mapping whatever produced the failure.
//
// This is not a claim that any route works. The database is a stand-in that only
// ever fails; `pnpm test:db` is where the routes meet a real one.

const PROJECT_ID = '3f4b1c62-8a5d-4e21-9d0f-6c7b2a915e83';
const FILE_ID = 'b81d2f47-5c30-4a9e-8f16-7d40e2c95ab1';

// Everything a leaked exception would carry: an ORM error name and code, a SQL
// fragment, a table name, a host, and a password.
const LEAKY_CAUSE =
  'PrismaClientKnownRequestError P2002: INSERT INTO "project_files" failed on ' +
  'postgresql://devsync:hunter2@db.internal:5432/devsync';

async function startApi(database: Database): Promise<NestExpressApplication> {
  const moduleRef = await Test.createTestingModule({
    controllers: [ProjectsController, ProjectFilesController],
    providers: [ProjectsService, ProjectFilesService, { provide: DATABASE, useValue: database }],
  }).compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>(HTTP_APPLICATION_OPTIONS);

  configureHttpApplication(app);
  await app.init();

  return app;
}

/** A data layer that does nothing but fail, in the way the test asked for. */
function databaseThatThrows(error: Error): Database {
  const failing = (): Promise<never> => Promise.reject(error);

  return {
    connect: () => Promise.resolve(),
    disconnect: () => Promise.resolve(),
    projects: {
      createWithInitialFile: failing,
      list: failing,
      findById: failing,
      rename: failing,
      delete: failing,
    },
    files: { create: failing, list: failing, find: failing, update: failing, delete: failing },
  };
}

function persistenceError(failure: PersistenceFailure): PersistenceError {
  return new PersistenceError(failure, 'The database request failed.', {
    cause: new Error(LEAKY_CAUSE),
  });
}

/** The response body, having proved it matches the shared error contract. */
function apiError(body: unknown): ApiErrorResource {
  const result = parseContract(apiErrorResourceSchema, body);

  if (!result.ok) {
    throw new Error(
      `The response is not a DevSync error resource: ${JSON.stringify(result.issues)}`,
    );
  }

  return result.value;
}

describe('the API exception boundary', () => {
  let app: NestExpressApplication | undefined;
  let logged: jest.SpyInstance;

  beforeEach(() => {
    // The 5xx paths log the real exception. Silenced here so a passing run is
    // quiet, and read back in the test that asserts what reaches the log.
    logged = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    await app?.close();
    app = undefined;
    logged.mockRestore();
  });

  async function serving(error: Error): Promise<Server> {
    app = await startApi(databaseThatThrows(error));

    return app.getHttpServer();
  }

  it('answers a missing project with PROJECT_NOT_FOUND', async () => {
    const server = await serving(persistenceError({ kind: 'notFound', entity: 'project' }));
    const response = await request(server).get(`/projects/${PROJECT_ID}`);

    expect(response.status).toBe(404);
    expect(apiError(response.body).code).toBe('PROJECT_NOT_FOUND');
  });

  it('answers a missing file with FILE_NOT_FOUND', async () => {
    const server = await serving(persistenceError({ kind: 'notFound', entity: 'projectFile' }));
    const response = await request(server).get(`/projects/${PROJECT_ID}/files/${FILE_ID}`);

    expect(response.status).toBe(404);
    expect(apiError(response.body).code).toBe('FILE_NOT_FOUND');
  });

  it('answers a duplicate file name with FILE_NAME_TAKEN, naming the file', async () => {
    const server = await serving(
      persistenceError({ kind: 'uniqueViolation', constraint: 'projectFileName' }),
    );
    const response = await request(server)
      .post(`/projects/${PROJECT_ID}/files`)
      .send({ name: 'utils.ts', language: 'typescript' });

    expect(response.status).toBe(409);
    expect(apiError(response.body)).toEqual({
      statusCode: 409,
      code: 'FILE_NAME_TAKEN',
      message: 'A file named "utils.ts" already exists in this project.',
      issues: [{ path: ['name'], message: 'Already used in this project.' }],
    });
  });

  it('answers an unreachable database with DATABASE_UNAVAILABLE', async () => {
    const server = await serving(persistenceError({ kind: 'unavailable' }));
    const response = await request(server).get('/projects');

    expect(response.status).toBe(503);
    expect(apiError(response.body).code).toBe('DATABASE_UNAVAILABLE');
  });

  it('answers an unclassified persistence failure with INTERNAL_ERROR', async () => {
    const server = await serving(persistenceError({ kind: 'unknown' }));
    const response = await request(server).get('/projects');

    expect(response.status).toBe(500);
    expect(apiError(response.body).code).toBe('INTERNAL_ERROR');
  });

  it('answers an exception nobody anticipated with INTERNAL_ERROR', async () => {
    const server = await serving(new TypeError(LEAKY_CAUSE));
    const response = await request(server).get('/projects');

    expect(response.status).toBe(500);
    expect(apiError(response.body)).toEqual({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'The request could not be completed.',
    });
  });

  it('logs the real exception rather than returning it', async () => {
    const server = await serving(new TypeError(LEAKY_CAUSE));
    const response = await request(server).get('/projects');

    expect(response.text).not.toContain(LEAKY_CAUSE);
    expect(logged).toHaveBeenCalledWith(expect.stringContaining(LEAKY_CAUSE), expect.any(String));
  });

  it.each([
    ['a not found', { kind: 'notFound', entity: 'project' } satisfies PersistenceFailure],
    [
      'a unique violation',
      { kind: 'uniqueViolation', constraint: 'projectFileName' } satisfies PersistenceFailure,
    ],
    ['an unavailable database', { kind: 'unavailable' } satisfies PersistenceFailure],
    ['an unknown failure', { kind: 'unknown' } satisfies PersistenceFailure],
  ])('never describes the machinery behind %s', async (_case: string, failure) => {
    const server = await serving(persistenceError(failure));
    const response = await request(server).get(`/projects/${PROJECT_ID}`);

    for (const secret of [
      'PrismaClientKnownRequestError',
      'P2002',
      'INSERT INTO',
      'project_files',
      'db.internal',
      'hunter2',
      'postgresql://',
      '.ts:',
    ]) {
      expect(response.text).not.toContain(secret);
    }
  });

  it('rejects a body that is not JSON before it reaches a route', async () => {
    const server = await serving(new Error('unused'));
    const response = await request(server)
      .post('/projects')
      .set('Content-Type', 'application/json')
      .send('{"name": ');

    expect(response.status).toBe(400);
    expect(apiError(response.body)).toEqual({
      statusCode: 400,
      code: 'VALIDATION_FAILED',
      message: 'The request body is not valid JSON.',
    });
  });

  it('leaves an unmatched route to the framework rather than inventing a code for it', async () => {
    const server = await serving(new Error('unused'));
    const response = await request(server).get('/nothing-here');

    expect(response.status).toBe(404);
    // Deliberately not a DevSync error resource: there is no stable code for a
    // URL that is not part of the API, and adding one would grow the contract for
    // a failure no client of it can provoke.
    expect(response.body).not.toHaveProperty('code');
  });
});
