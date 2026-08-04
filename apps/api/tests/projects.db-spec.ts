import {
  projectDetailResourceSchema,
  projectFileSummaryResourceSchema,
  projectListSchema,
  projectResourceSchema,
} from '@devsync/shared';
import { STARTER_FILE } from '../src/projects/starter-file';
import {
  ABSENT_ID,
  apiError,
  givenProject,
  issuePaths,
  parsedAs,
  starterFileOf,
  useApi,
} from './support/api';

const api = useApi();

describe('POST /projects', () => {
  it('creates a project and answers 201 with it', async () => {
    const response = await api.http().post('/projects').send({ name: 'My project' });

    expect(response.status).toBe(201);
    expect(parsedAs(projectDetailResourceSchema, response.body)).toEqual(
      expect.objectContaining({ name: 'My project' }),
    );
  });

  it('trims the name before storing it', async () => {
    const project = await givenProject(api, '   Spacious   ');

    expect(project.name).toBe('Spacious');
  });

  it('creates exactly one file with it', async () => {
    const project = await givenProject(api);

    expect(project.files).toHaveLength(1);
  });

  it('gives that file the name and language the API owns', async () => {
    const starter = starterFileOf(await givenProject(api));

    expect(starter.name).toBe('main.ts');
    expect(starter.language).toBe('typescript');
  });

  it('gives that file exactly the starter content the API owns', async () => {
    const project = await givenProject(api);
    const starter = starterFileOf(project);

    const response = await api.http().get(`/projects/${project.id}/files/${starter.id}`);

    expect(response.status).toBe(200);
    expect((response.body as { content: string }).content).toBe(STARTER_FILE.content);
  });

  it('passes that policy to the database rather than letting the database choose it', async () => {
    const create = jest.spyOn(api.database().projects, 'createWithInitialFile');

    await givenProject(api, 'Watched');

    expect(create).toHaveBeenCalledWith({
      project: { name: 'Watched' },
      initialFile: { name: 'main.ts', language: 'typescript', content: STARTER_FILE.content },
    });

    create.mockRestore();
  });

  it('answers with a summary of that file, not its content', async () => {
    const project = await givenProject(api);
    const starter = starterFileOf(project);

    expect(starter).not.toHaveProperty('content');
    // The summary schema is strict, so parsing it is the assertion.
    expect(parsedAs(projectFileSummaryResourceSchema, starter)).toEqual(starter);
  });

  it('allows two projects to share a name, because that is not a mistake worth rejecting', async () => {
    const first = await givenProject(api, 'Twice');
    const second = await givenProject(api, 'Twice');

    expect(second.id).not.toBe(first.id);
  });

  it('generates the identifier itself and refuses one from the client', async () => {
    const response = await api.http().post('/projects').send({ name: 'Mine', id: ABSENT_ID });

    expect(response.status).toBe(400);
    expect(apiError(response.body).code).toBe('VALIDATION_FAILED');
  });

  it.each([
    ['an empty name', ''],
    ['a name of only whitespace', '   '],
    ['a name of 101 characters', 'p'.repeat(101)],
  ])('rejects %s', async (_case: string, name: string) => {
    const response = await api.http().post('/projects').send({ name });

    expect(response.status).toBe(400);
    expect(apiError(response.body).code).toBe('VALIDATION_FAILED');
  });

  it('accepts a name of exactly 100 characters', async () => {
    const project = await givenProject(api, 'p'.repeat(100));

    expect(project.name).toHaveLength(100);
  });

  it('rejects a name that is not a string', async () => {
    const response = await api.http().post('/projects').send({ name: 42 });
    const error = apiError(response.body);

    expect(response.status).toBe(400);
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(issuePaths(error)).toEqual([['name']]);
  });

  it('rejects a body with no name', async () => {
    const response = await api.http().post('/projects').send({});

    expect(response.status).toBe(400);
    expect(apiError(response.body).code).toBe('VALIDATION_FAILED');
  });
});

describe('GET /projects', () => {
  it('answers an empty array when there is nothing', async () => {
    const response = await api.http().get('/projects');

    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
  });

  it('answers project resources with no files on them', async () => {
    await givenProject(api, 'Listed');

    const response = await api.http().get('/projects');
    const projects = parsedAs(projectListSchema, response.body);

    expect(projects).toEqual([expect.objectContaining({ name: 'Listed' })]);
    // The project schema is strict, so a `files` property would have failed the
    // parse above; this says why.
    expect(projects[0]).not.toHaveProperty('files');
  });

  it('puts the most recently updated project first', async () => {
    const older = await givenProject(api, 'Older');
    const newer = await givenProject(api, 'Newer');

    const response = await api.http().get('/projects');

    expect(parsedAs(projectListSchema, response.body).map((project) => project.id)).toEqual([
      newer.id,
      older.id,
    ]);
  });

  it('moves a project to the front when a file in it is edited', async () => {
    const older = await givenProject(api, 'Older');
    const newer = await givenProject(api, 'Newer');

    await api
      .http()
      .patch(`/projects/${older.id}/files/${starterFileOf(older).id}`)
      .send({ content: 'edited\n' })
      .expect(200);

    const response = await api.http().get('/projects');

    expect(parsedAs(projectListSchema, response.body).map((project) => project.id)).toEqual([
      older.id,
      newer.id,
    ]);
  });

  it('answers in the same order every time it is asked', async () => {
    // Created together so several land on the same millisecond, which is when the
    // identifier tie-breaker in the data layer's ordering is what decides. That
    // rule is asserted directly in `packages/database`; what the API owes a client
    // is that the answer does not reshuffle between two requests.
    await Promise.all(
      Array.from({ length: 6 }, (_unused, index) => givenProject(api, `Project ${index}`)),
    );

    const first = await api.http().get('/projects');
    const second = await api.http().get('/projects');

    expect(parsedAs(projectListSchema, first.body)).toHaveLength(6);
    expect(second.body).toEqual(first.body);
  });
});

describe('GET /projects/:projectId', () => {
  it('answers the project and a summary of each of its files', async () => {
    const project = await givenProject(api, 'Detailed');

    const response = await api.http().get(`/projects/${project.id}`);

    expect(response.status).toBe(200);
    expect(parsedAs(projectDetailResourceSchema, response.body)).toEqual(project);
  });

  it('never includes file contents', async () => {
    const project = await givenProject(api);

    const response = await api.http().get(`/projects/${project.id}`);

    expect(response.text).not.toContain('console.log');
  });

  it('answers PROJECT_NOT_FOUND for an identifier nothing was stored under', async () => {
    const response = await api.http().get(`/projects/${ABSENT_ID}`);
    const error = apiError(response.body);

    expect(response.status).toBe(404);
    expect(error.statusCode).toBe(404);
    expect(error.code).toBe('PROJECT_NOT_FOUND');
    // Nothing field-specific to say, so no empty list pretending otherwise.
    expect(error.issues).toBeUndefined();
  });
});

describe('PATCH /projects/:projectId', () => {
  it('renames the project and answers 200 with it', async () => {
    const project = await givenProject(api, 'Before');

    const response = await api.http().patch(`/projects/${project.id}`).send({ name: 'After' });

    expect(response.status).toBe(200);
    expect(parsedAs(projectResourceSchema, response.body).name).toBe('After');
  });

  it('trims the new name', async () => {
    const project = await givenProject(api);

    const response = await api.http().patch(`/projects/${project.id}`).send({ name: '  Tidy  ' });

    expect(parsedAs(projectResourceSchema, response.body).name).toBe('Tidy');
  });

  it('moves the project timestamp forward and leaves its creation alone', async () => {
    const project = await givenProject(api);

    const response = await api.http().patch(`/projects/${project.id}`).send({ name: 'Renamed' });
    const renamed = parsedAs(projectResourceSchema, response.body);

    expect(renamed.createdAt).toBe(project.createdAt);
    expect(Date.parse(renamed.updatedAt)).toBeGreaterThanOrEqual(Date.parse(project.updatedAt));
    expect(renamed.updatedAt).not.toBe(project.createdAt);
  });

  it('answers a project resource, without its files', async () => {
    const project = await givenProject(api);

    const response = await api.http().patch(`/projects/${project.id}`).send({ name: 'Renamed' });

    expect(response.body).not.toHaveProperty('files');
  });

  it.each([
    ['an empty body', {}],
    ['an empty name', { name: '' }],
    ['a whitespace name', { name: '  ' }],
    ['a name of 101 characters', { name: 'p'.repeat(101) }],
    ['an unknown property', { title: 'Renamed' }],
    ['a name alongside an unknown property', { name: 'Renamed', archived: true }],
  ])('rejects %s', async (_case: string, body: object) => {
    const project = await givenProject(api);

    const response = await api.http().patch(`/projects/${project.id}`).send(body);

    expect(response.status).toBe(400);
    expect(apiError(response.body).code).toBe('VALIDATION_FAILED');
  });

  it('accepts a name of exactly 100 characters', async () => {
    const project = await givenProject(api);
    const name = 'p'.repeat(100);

    const response = await api.http().patch(`/projects/${project.id}`).send({ name });

    expect(response.status).toBe(200);
    expect(parsedAs(projectResourceSchema, response.body).name).toBe(name);
  });

  it('answers PROJECT_NOT_FOUND when there is no such project', async () => {
    const response = await api.http().patch(`/projects/${ABSENT_ID}`).send({ name: 'Renamed' });

    expect(response.status).toBe(404);
    expect(apiError(response.body).code).toBe('PROJECT_NOT_FOUND');
  });
});

describe('DELETE /projects/:projectId', () => {
  it('answers 204 with no body', async () => {
    const project = await givenProject(api);

    const response = await api.http().delete(`/projects/${project.id}`);

    expect(response.status).toBe(204);
    expect(response.text).toBe('');
  });

  it('removes the project from the listing', async () => {
    const project = await givenProject(api);

    await api.http().delete(`/projects/${project.id}`).expect(204);
    const response = await api.http().get('/projects');

    expect(response.body).toEqual([]);
  });

  it('takes the project files with it', async () => {
    const project = await givenProject(api);
    const starter = starterFileOf(project);

    await api.http().delete(`/projects/${project.id}`).expect(204);
    const response = await api.http().get(`/projects/${project.id}/files/${starter.id}`);

    expect(response.status).toBe(404);
    expect(apiError(response.body).code).toBe('PROJECT_NOT_FOUND');
  });

  it('leaves another project alone', async () => {
    const doomed = await givenProject(api, 'Doomed');
    const survivor = await givenProject(api, 'Survivor');

    await api.http().delete(`/projects/${doomed.id}`).expect(204);
    const response = await api.http().get(`/projects/${survivor.id}`);

    expect(response.status).toBe(200);
    expect(parsedAs(projectDetailResourceSchema, response.body).files).toHaveLength(1);
  });

  it('answers PROJECT_NOT_FOUND the second time, because deletion is permanent', async () => {
    const project = await givenProject(api);

    await api.http().delete(`/projects/${project.id}`).expect(204);
    const response = await api.http().delete(`/projects/${project.id}`);

    expect(response.status).toBe(404);
    expect(apiError(response.body).code).toBe('PROJECT_NOT_FOUND');
  });
});
