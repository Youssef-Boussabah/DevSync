import { JSON_BODY_LIMIT_BYTES } from '../src/http-application';
import { ABSENT_ID, apiError, givenProject, starterFileOf, useApi } from './support/api';

// What the application does before any route is reached: the health endpoint the
// rest of the system watches, the identifiers in a URL, and a body Express cannot
// read at all.

const api = useApi();

afterEach(() => {
  jest.restoreAllMocks();
});

describe('GET /health', () => {
  it('still answers exactly what the rest of the system waits on', async () => {
    const response = await api.http().get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok', service: 'devsync-api' });
  });

  it('says nothing about the database, even though there is one behind it', async () => {
    const response = await api.http().get('/health');

    expect(Object.keys(response.body as object)).toEqual(['status', 'service']);
  });
});

describe('an identifier in the URL that is not a UUID', () => {
  const routes = [
    ['GET', '/projects/not-a-uuid'],
    ['PATCH', '/projects/not-a-uuid'],
    ['DELETE', '/projects/not-a-uuid'],
    ['POST', '/projects/not-a-uuid/files'],
    ['GET', '/projects/not-a-uuid/files'],
    ['GET', `/projects/not-a-uuid/files/${ABSENT_ID}`],
    ['PATCH', `/projects/${ABSENT_ID}/files/not-a-uuid`],
    ['DELETE', `/projects/${ABSENT_ID}/files/not-a-uuid`],
  ] as const;

  it.each(routes)('is a 400 and INVALID_IDENTIFIER for %s %s', async (method, path) => {
    const response = await send(method, path);

    expect(response.status).toBe(400);
    expect(apiError(response.body).code).toBe('INVALID_IDENTIFIER');
  });

  it('is not confused with a record that is simply not there', async () => {
    const missing = await api.http().get(`/projects/${ABSENT_ID}`);

    expect(missing.status).toBe(404);
    expect(apiError(missing.body).code).toBe('PROJECT_NOT_FOUND');
  });

  it('never reaches the database', async () => {
    const database = api.database();
    const watched = [
      jest.spyOn(database.projects, 'findById'),
      jest.spyOn(database.projects, 'rename'),
      jest.spyOn(database.projects, 'delete'),
      jest.spyOn(database.files, 'create'),
      jest.spyOn(database.files, 'list'),
      jest.spyOn(database.files, 'find'),
      jest.spyOn(database.files, 'update'),
      jest.spyOn(database.files, 'delete'),
    ];

    for (const [method, path] of routes) {
      const response = await send(method, path);

      expect(response.status).toBe(400);
    }

    for (const operation of watched) {
      expect(operation).not.toHaveBeenCalled();
    }
  });

  function send(method: (typeof routes)[number][0], path: string) {
    const http = api.http();

    switch (method) {
      case 'GET':
        return http.get(path);
      case 'POST':
        return http.post(path).send({ name: 'utils.ts', language: 'typescript' });
      case 'PATCH':
        return http.patch(path).send({ name: 'Renamed' });
      case 'DELETE':
        return http.delete(path);
    }
  }
});

describe('a body the server cannot read', () => {
  it('rejects JSON that does not parse', async () => {
    const response = await api
      .http()
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

  it('rejects a literal null body', async () => {
    const response = await api
      .http()
      .post('/projects')
      .set('Content-Type', 'application/json')
      .send('null');

    expect(response.status).toBe(400);
    expect(apiError(response.body).code).toBe('VALIDATION_FAILED');
  });

  it('rejects a request with no body at all', async () => {
    const response = await api.http().post('/projects');

    expect(response.status).toBe(400);
    expect(apiError(response.body).code).toBe('VALIDATION_FAILED');
  });

  it('rejects a body that is a bare string rather than an object', async () => {
    const response = await api
      .http()
      .post('/projects')
      .set('Content-Type', 'application/json')
      .send('"My project"');

    expect(response.status).toBe(400);
    expect(apiError(response.body).code).toBe('VALIDATION_FAILED');
  });
});

describe('the request body size limit', () => {
  it('accepts a file just under it', async () => {
    const project = await givenProject(api);
    // Comfortably inside 1 MiB once the surrounding JSON is counted, and far
    // larger than any source file a person writes.
    const content = 'x'.repeat(1_000_000);

    const response = await api
      .http()
      .post(`/projects/${project.id}/files`)
      .send({ name: 'large.ts', language: 'typescript', content });

    expect(response.status).toBe(201);
    expect((response.body as { content: string }).content).toHaveLength(1_000_000);
  });

  it('rejects a body over it with the stable error shape rather than the parser default', async () => {
    const project = await givenProject(api);
    const content = 'x'.repeat(JSON_BODY_LIMIT_BYTES);

    const response = await api
      .http()
      .post(`/projects/${project.id}/files`)
      .send({ name: 'enormous.ts', language: 'typescript', content });

    expect(response.status).toBe(400);
    expect(apiError(response.body)).toEqual({
      statusCode: 400,
      code: 'VALIDATION_FAILED',
      message: 'The request body is larger than the 1 MiB limit.',
    });
  });

  it('stores nothing from a body it rejected', async () => {
    const project = await givenProject(api);

    await api
      .http()
      .post(`/projects/${project.id}/files`)
      .send({
        name: 'enormous.ts',
        language: 'typescript',
        content: 'x'.repeat(JSON_BODY_LIMIT_BYTES),
      });

    const files = await api.http().get(`/projects/${project.id}/files`);

    expect(files.body).toEqual([expect.objectContaining({ id: starterFileOf(project).id })]);
  });
});
