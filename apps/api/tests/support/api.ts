import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import type { Database } from '@devsync/database';
import {
  apiErrorResourceSchema,
  parseContract,
  projectDetailResourceSchema,
  projectFileResourceSchema,
} from '@devsync/shared';
import type {
  ApiErrorResource,
  ApiIssuePath,
  ContractSchema,
  ContractValue,
  CreateProjectFileRequest,
  ProjectDetailResource,
  ProjectFileResource,
  ProjectFileSummaryResource,
} from '@devsync/shared';
import { AppModule } from '../../src/app.module';
import type { ApiConfiguration } from '../../src/config/api-configuration';
import { DATABASE } from '../../src/database/database.token';
import { HTTP_APPLICATION_OPTIONS, configureHttpApplication } from '../../src/http-application';

/**
 * The real application, over a real database.
 *
 * `AppModule` itself, configured by the same `configureHttpApplication` that
 * `main.ts` calls, so the body limit and the error filter under test are the ones
 * that run in production. Nothing is mocked: proving that a controller calls a
 * stand-in the way a test expects is a different claim from proving a route
 * works.
 *
 * The connection string comes from `tests/global-setup.mjs`, which put the
 * disposable database into a known state and pointed `DATABASE_URL` at it.
 */

type HttpClient = ReturnType<typeof request>;

export interface Api {
  /** Supertest, bound to the in-process application. No port is ever published. */
  http(): HttpClient;

  /** The one `Database` the application is using, for arranging and inspecting state. */
  database(): Database;
}

/** A syntactically valid identifier that nothing will ever have been stored under. */
export const ABSENT_ID = '00000000-0000-4000-8000-000000000000';

export function useApi(): Api {
  let app: NestExpressApplication | undefined;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    app = moduleRef.createNestApplication<NestExpressApplication>(HTTP_APPLICATION_OPTIONS);

    // The same origin `tests/global-setup.mjs` put in the environment, read back
    // through the validated configuration rather than restated — so this suite
    // exercises the value the application actually accepted.
    configureHttpApplication(app, {
      webOrigin: moduleRef
        .get(ConfigService<ApiConfiguration, true>)
        .get('webOrigin', { infer: true }),
    });

    // `init` runs the lifecycle hooks, which is what opens the connection. No
    // `listen`: Supertest binds an ephemeral socket per request, so the suite
    // depends on no fixed port and cannot collide with a running service.
    await app.init();
  });

  beforeEach(async () => {
    // Emptied before rather than after, so a run that crashed halfway cannot
    // leave rows that quietly change the next test. Deleting the projects takes
    // their files with them, through the cascade in the schema.
    const database = running(app).get<Database>(DATABASE);

    for (const project of await database.projects.list()) {
      await database.projects.delete(project.id);
    }
  });

  afterAll(async () => {
    await app?.close();
    app = undefined;
  });

  return {
    http: () => request(running(app).getHttpServer()),
    database: () => running(app).get<Database>(DATABASE),
  };
}

/**
 * Where an error says the problem is, with the wording left out. Messages are
 * explicitly not part of the contract and may be reworded; the paths are what a
 * client acts on.
 */
export function issuePaths(error: ApiErrorResource): ApiIssuePath[] {
  return (error.issues ?? []).map((issue) => issue.path);
}

/**
 * A response body, having proved it matches the contract `@devsync/shared`
 * publishes. Every assertion in the suite reads a value that has been through
 * this, so a route that grew a property or dropped a timestamp fails here rather
 * than reaching a client.
 */
export function parsedAs<Schema extends ContractSchema>(
  schema: Schema,
  body: unknown,
): ContractValue<Schema> {
  const result = parseContract(schema, body);

  if (!result.ok) {
    throw new Error(
      `The response does not match its contract.\n` +
        `Issues: ${JSON.stringify(result.issues)}\n` +
        `Body: ${JSON.stringify(body)}`,
    );
  }

  return result.value;
}

export function apiError(body: unknown): ApiErrorResource {
  return parsedAs(apiErrorResourceSchema, body);
}

export async function givenProject(api: Api, name = 'A project'): Promise<ProjectDetailResource> {
  const response = await api.http().post('/projects').send({ name });

  expect(response.status).toBe(201);

  return parsedAs(projectDetailResourceSchema, response.body);
}

export async function givenFile(
  api: Api,
  projectId: string,
  file: Partial<CreateProjectFileRequest> & { name: string },
): Promise<ProjectFileResource> {
  const response = await api
    .http()
    .post(`/projects/${projectId}/files`)
    .send({ language: 'typescript', ...file });

  expect(response.status).toBe(201);

  return parsedAs(projectFileResourceSchema, response.body);
}

/** The one file a freshly created project holds, with the count asserted rather than assumed. */
export function starterFileOf(project: ProjectDetailResource): ProjectFileSummaryResource {
  const [file, ...rest] = project.files;

  if (file === undefined || rest.length > 0) {
    throw new Error(
      `Expected the project to hold exactly one file, found ${project.files.length}.`,
    );
  }

  return file;
}

function running(app: NestExpressApplication | undefined): NestExpressApplication {
  if (app === undefined) {
    throw new Error('The API is not running. `useApi()` belongs at the top level of a spec file.');
  }

  return app;
}
