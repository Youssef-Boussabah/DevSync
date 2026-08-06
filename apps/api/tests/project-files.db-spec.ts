import {
  projectDetailResourceSchema,
  projectFileResourceSchema,
  projectFileSummaryListSchema,
} from '@devsync/shared';
import {
  ABSENT_ID,
  apiError,
  givenFile,
  givenProject,
  issuePaths,
  parsedAs,
  starterFileOf,
  useApi,
} from './support/api';
import type { Api } from './support/api';

const api = useApi();

/** When the project this file belongs to was last considered to have changed. */
async function projectUpdatedAt(client: Api, projectId: string): Promise<string> {
  const response = await client.http().get(`/projects/${projectId}`);

  expect(response.status).toBe(200);

  return parsedAs(projectDetailResourceSchema, response.body).updatedAt;
}

describe('POST /projects/:projectId/files', () => {
  it('creates the file and answers 201 with all of it, content included', async () => {
    const project = await givenProject(api);

    const response = await api
      .http()
      .post(`/projects/${project.id}/files`)
      .send({ name: 'utils.ts', language: 'typescript', content: 'export {};\n' });

    expect(response.status).toBe(201);
    expect(parsedAs(projectFileResourceSchema, response.body)).toEqual(
      expect.objectContaining({
        projectId: project.id,
        name: 'utils.ts',
        language: 'typescript',
        content: 'export {};\n',
      }),
    );
  });

  it('stores an empty string when content is omitted', async () => {
    const project = await givenProject(api);

    const file = await givenFile(api, project.id, { name: 'empty.ts' });

    expect(file.content).toBe('');
  });

  it('stores an empty string when content is explicitly empty', async () => {
    const project = await givenProject(api);

    const file = await givenFile(api, project.id, { name: 'empty.ts', content: '' });

    expect(file.content).toBe('');
  });

  it('does not trim the content', async () => {
    const project = await givenProject(api);
    const content = '\n  indented\n\n';

    const file = await givenFile(api, project.id, {
      name: 'spaced.md',
      content,
      language: 'markdown',
    });

    expect(file.content).toBe(content);
  });

  it('trims the file name', async () => {
    const project = await givenProject(api);

    const file = await givenFile(api, project.id, { name: '  utils.ts  ' });

    expect(file.name).toBe('utils.ts');
  });

  it('moves the project timestamp forward', async () => {
    const project = await givenProject(api);
    const before = await projectUpdatedAt(api, project.id);

    await givenFile(api, project.id, { name: 'utils.ts' });

    expect(Date.parse(await projectUpdatedAt(api, project.id))).toBeGreaterThan(Date.parse(before));
  });

  it('accepts the same file name in a different project', async () => {
    const first = await givenProject(api, 'First');
    const second = await givenProject(api, 'Second');

    await givenFile(api, first.id, { name: 'utils.ts' });
    const twin = await givenFile(api, second.id, { name: 'utils.ts' });

    expect(twin.projectId).toBe(second.id);
  });

  it('accepts README.md alongside readme.md, because names are case-sensitive', async () => {
    const project = await givenProject(api);

    await givenFile(api, project.id, { name: 'README.md', language: 'markdown' });
    const lowercase = await givenFile(api, project.id, { name: 'readme.md', language: 'markdown' });

    expect(lowercase.name).toBe('readme.md');
  });

  it('answers FILE_NAME_TAKEN for the same name twice in one project', async () => {
    const project = await givenProject(api);
    await givenFile(api, project.id, { name: 'utils.ts' });

    const response = await api
      .http()
      .post(`/projects/${project.id}/files`)
      .send({ name: 'utils.ts', language: 'typescript' });

    expect(response.status).toBe(409);
    expect(apiError(response.body)).toEqual({
      statusCode: 409,
      code: 'FILE_NAME_TAKEN',
      message: 'A file named "utils.ts" already exists in this project.',
      issues: [{ path: ['name'], message: 'Already used in this project.' }],
    });
  });

  it('answers VALIDATION_FAILED for a language nobody offers', async () => {
    const project = await givenProject(api);

    const response = await api
      .http()
      .post(`/projects/${project.id}/files`)
      .send({ name: 'main.rs', language: 'rust' });

    const error = apiError(response.body);

    expect(response.status).toBe(400);
    expect(error.code).toBe('VALIDATION_FAILED');
    expect(issuePaths(error)).toEqual([['language']]);
  });

  it('accepts a name of exactly 255 characters and rejects 256', async () => {
    const project = await givenProject(api);

    const accepted = await givenFile(api, project.id, { name: 'f'.repeat(255) });
    expect(accepted.name).toHaveLength(255);

    const response = await api
      .http()
      .post(`/projects/${project.id}/files`)
      .send({ name: 'f'.repeat(256), language: 'typescript' });

    expect(response.status).toBe(400);
    expect(apiError(response.body).code).toBe('VALIDATION_FAILED');
  });

  it.each([
    ['a whitespace-only name', { name: '   ', language: 'typescript' }],
    ['a missing language', { name: 'utils.ts' }],
    ['a name that is not a string', { name: 7, language: 'typescript' }],
    ['content that is not a string', { name: 'utils.ts', language: 'typescript', content: 7 }],
    ['a client-chosen identifier', { name: 'utils.ts', language: 'typescript', id: ABSENT_ID }],
    [
      'a project identifier in the body',
      { name: 'utils.ts', language: 'typescript', projectId: ABSENT_ID },
    ],
  ])('rejects %s', async (_case: string, body: object) => {
    const project = await givenProject(api);

    const response = await api.http().post(`/projects/${project.id}/files`).send(body);

    expect(response.status).toBe(400);
    expect(apiError(response.body).code).toBe('VALIDATION_FAILED');
  });

  it('answers PROJECT_NOT_FOUND when there is no such project', async () => {
    const response = await api
      .http()
      .post(`/projects/${ABSENT_ID}/files`)
      .send({ name: 'utils.ts', language: 'typescript' });

    expect(response.status).toBe(404);
    expect(apiError(response.body).code).toBe('PROJECT_NOT_FOUND');
  });
});

describe('GET /projects/:projectId/files', () => {
  it('answers summaries, without content', async () => {
    const project = await givenProject(api);

    const response = await api.http().get(`/projects/${project.id}/files`);

    expect(response.status).toBe(200);
    expect(parsedAs(projectFileSummaryListSchema, response.body)).toHaveLength(1);
    expect(response.text).not.toContain('console.log');
  });

  it('answers oldest first, by creation', async () => {
    const project = await givenProject(api);
    await givenFile(api, project.id, { name: 'second.ts' });
    await givenFile(api, project.id, { name: 'third.ts' });

    const response = await api.http().get(`/projects/${project.id}/files`);

    expect(parsedAs(projectFileSummaryListSchema, response.body).map((file) => file.name)).toEqual([
      'main.ts',
      'second.ts',
      'third.ts',
    ]);
  });

  it('answers in the same order every time it is asked', async () => {
    const project = await givenProject(api);
    await Promise.all(
      Array.from({ length: 5 }, (_unused, index) =>
        givenFile(api, project.id, { name: `file-${index}.ts` }),
      ),
    );

    const first = await api.http().get(`/projects/${project.id}/files`);
    const second = await api.http().get(`/projects/${project.id}/files`);

    expect(parsedAs(projectFileSummaryListSchema, first.body)).toHaveLength(6);
    expect(second.body).toEqual(first.body);
  });

  it('answers PROJECT_NOT_FOUND when there is no such project', async () => {
    const response = await api.http().get(`/projects/${ABSENT_ID}/files`);

    expect(response.status).toBe(404);
    expect(apiError(response.body).code).toBe('PROJECT_NOT_FOUND');
  });
});

describe('GET /projects/:projectId/files/:fileId', () => {
  it('answers the whole file, content included', async () => {
    const project = await givenProject(api);
    const created = await givenFile(api, project.id, {
      name: 'utils.ts',
      content: 'const a = 1;\n',
    });

    const response = await api.http().get(`/projects/${project.id}/files/${created.id}`);

    expect(response.status).toBe(200);
    expect(parsedAs(projectFileResourceSchema, response.body)).toEqual(created);
  });

  it('answers FILE_NOT_FOUND for a file that lives in another project', async () => {
    const owner = await givenProject(api, 'Owner');
    const other = await givenProject(api, 'Other');
    const file = await givenFile(api, owner.id, { name: 'utils.ts' });

    const response = await api.http().get(`/projects/${other.id}/files/${file.id}`);

    expect(response.status).toBe(404);
    expect(apiError(response.body).code).toBe('FILE_NOT_FOUND');
  });

  it('answers PROJECT_NOT_FOUND when the project does not exist', async () => {
    const response = await api.http().get(`/projects/${ABSENT_ID}/files/${ABSENT_ID}`);

    expect(response.status).toBe(404);
    expect(apiError(response.body).code).toBe('PROJECT_NOT_FOUND');
  });

  it('answers FILE_NOT_FOUND when the project exists and the file does not', async () => {
    const project = await givenProject(api);

    const response = await api.http().get(`/projects/${project.id}/files/${ABSENT_ID}`);

    expect(response.status).toBe(404);
    expect(apiError(response.body).code).toBe('FILE_NOT_FOUND');
  });
});

describe('PATCH /projects/:projectId/files/:fileId', () => {
  it('renames without touching the language or the content', async () => {
    const project = await givenProject(api);
    const file = await givenFile(api, project.id, { name: 'utils.ts', content: 'const a = 1;\n' });

    const response = await api
      .http()
      .patch(`/projects/${project.id}/files/${file.id}`)
      .send({ name: 'helpers.ts' });

    expect(response.status).toBe(200);
    expect(parsedAs(projectFileResourceSchema, response.body)).toEqual(
      expect.objectContaining({
        name: 'helpers.ts',
        language: 'typescript',
        content: 'const a = 1;\n',
      }),
    );
  });

  it('changes the language without renaming', async () => {
    const project = await givenProject(api);
    const file = await givenFile(api, project.id, { name: 'notes.ts', content: '# Notes\n' });

    const response = await api
      .http()
      .patch(`/projects/${project.id}/files/${file.id}`)
      .send({ language: 'markdown' });

    expect(parsedAs(projectFileResourceSchema, response.body)).toEqual(
      expect.objectContaining({ name: 'notes.ts', language: 'markdown', content: '# Notes\n' }),
    );
  });

  it('changes the content without restating the name or the language', async () => {
    const project = await givenProject(api);
    const file = await givenFile(api, project.id, { name: 'utils.ts', content: 'const a = 1;\n' });

    const response = await api
      .http()
      .patch(`/projects/${project.id}/files/${file.id}`)
      .send({ content: 'const b = 2;\n' });

    expect(parsedAs(projectFileResourceSchema, response.body)).toEqual(
      expect.objectContaining({
        name: 'utils.ts',
        language: 'typescript',
        content: 'const b = 2;\n',
      }),
    );
  });

  it('changes every property at once', async () => {
    const project = await givenProject(api);
    const file = await givenFile(api, project.id, { name: 'utils.ts' });

    const response = await api
      .http()
      .patch(`/projects/${project.id}/files/${file.id}`)
      .send({ name: 'main.py', language: 'python', content: 'print("hi")\n' });

    expect(parsedAs(projectFileResourceSchema, response.body)).toEqual(
      expect.objectContaining({ name: 'main.py', language: 'python', content: 'print("hi")\n' }),
    );
  });

  it('accepts emptying a file', async () => {
    const project = await givenProject(api);
    const file = await givenFile(api, project.id, { name: 'utils.ts', content: 'const a = 1;\n' });

    const response = await api
      .http()
      .patch(`/projects/${project.id}/files/${file.id}`)
      .send({ content: '' });

    expect(parsedAs(projectFileResourceSchema, response.body).content).toBe('');
  });

  it('trims a new name', async () => {
    const project = await givenProject(api);
    const file = await givenFile(api, project.id, { name: 'utils.ts' });

    const response = await api
      .http()
      .patch(`/projects/${project.id}/files/${file.id}`)
      .send({ name: '  helpers.ts  ' });

    expect(parsedAs(projectFileResourceSchema, response.body).name).toBe('helpers.ts');
  });

  it('moves both the file and the project timestamps forward', async () => {
    const project = await givenProject(api);
    const file = await givenFile(api, project.id, { name: 'utils.ts' });
    const before = await projectUpdatedAt(api, project.id);

    const response = await api
      .http()
      .patch(`/projects/${project.id}/files/${file.id}`)
      .send({ content: 'edited\n' });

    const updated = parsedAs(projectFileResourceSchema, response.body);

    expect(Date.parse(updated.updatedAt)).toBeGreaterThan(Date.parse(file.updatedAt));
    expect(updated.createdAt).toBe(file.createdAt);
    expect(Date.parse(await projectUpdatedAt(api, project.id))).toBeGreaterThan(Date.parse(before));
  });

  it.each([
    ['a change set with nothing in it', {}],
    ['a body carrying only an unknown property', { contents: 'oops' }],
    ['an unsupported language', { language: 'rust' }],
    ['a whitespace-only name', { name: '   ' }],
    ['a name of 256 characters', { name: 'f'.repeat(256) }],
    ['content that is not a string', { content: 7 }],
  ])('rejects %s', async (_case: string, body: object) => {
    const project = await givenProject(api);
    const file = await givenFile(api, project.id, { name: 'utils.ts' });

    const response = await api.http().patch(`/projects/${project.id}/files/${file.id}`).send(body);

    expect(response.status).toBe(400);
    expect(apiError(response.body).code).toBe('VALIDATION_FAILED');
  });

  it('answers FILE_NAME_TAKEN when the new name is already used', async () => {
    const project = await givenProject(api);
    await givenFile(api, project.id, { name: 'taken.ts' });
    const file = await givenFile(api, project.id, { name: 'utils.ts' });

    const response = await api
      .http()
      .patch(`/projects/${project.id}/files/${file.id}`)
      .send({ name: 'taken.ts' });

    expect(response.status).toBe(409);
    expect(apiError(response.body)).toEqual({
      statusCode: 409,
      code: 'FILE_NAME_TAKEN',
      message: 'A file named "taken.ts" already exists in this project.',
      issues: [{ path: ['name'], message: 'Already used in this project.' }],
    });
  });

  it('leaves the file alone when the rename was refused', async () => {
    const project = await givenProject(api);
    await givenFile(api, project.id, { name: 'taken.ts' });
    const file = await givenFile(api, project.id, { name: 'utils.ts' });

    await api.http().patch(`/projects/${project.id}/files/${file.id}`).send({ name: 'taken.ts' });
    const response = await api.http().get(`/projects/${project.id}/files/${file.id}`);

    expect(parsedAs(projectFileResourceSchema, response.body)).toEqual(file);
  });

  it('answers FILE_NOT_FOUND when there is no such file', async () => {
    const project = await givenProject(api);

    const response = await api
      .http()
      .patch(`/projects/${project.id}/files/${ABSENT_ID}`)
      .send({ content: 'edited\n' });

    expect(response.status).toBe(404);
    expect(apiError(response.body).code).toBe('FILE_NOT_FOUND');
  });

  it('answers FILE_NOT_FOUND for a file addressed through the wrong project', async () => {
    const owner = await givenProject(api, 'Owner');
    const other = await givenProject(api, 'Other');
    const file = await givenFile(api, owner.id, { name: 'utils.ts' });

    const response = await api
      .http()
      .patch(`/projects/${other.id}/files/${file.id}`)
      .send({ content: 'edited\n' });

    expect(response.status).toBe(404);
    expect(apiError(response.body).code).toBe('FILE_NOT_FOUND');
  });

  it('answers PROJECT_NOT_FOUND when the project does not exist', async () => {
    const response = await api
      .http()
      .patch(`/projects/${ABSENT_ID}/files/${ABSENT_ID}`)
      .send({ content: 'edited\n' });

    expect(response.status).toBe(404);
    expect(apiError(response.body).code).toBe('PROJECT_NOT_FOUND');
  });
});

describe('DELETE /projects/:projectId/files/:fileId', () => {
  it('answers 204 with no body', async () => {
    const project = await givenProject(api);
    const file = await givenFile(api, project.id, { name: 'utils.ts' });

    const response = await api.http().delete(`/projects/${project.id}/files/${file.id}`);

    expect(response.status).toBe(204);
    expect(response.text).toBe('');
  });

  it('moves the project timestamp forward', async () => {
    const project = await givenProject(api);
    const file = await givenFile(api, project.id, { name: 'utils.ts' });
    const before = await projectUpdatedAt(api, project.id);

    await api.http().delete(`/projects/${project.id}/files/${file.id}`).expect(204);

    expect(Date.parse(await projectUpdatedAt(api, project.id))).toBeGreaterThan(Date.parse(before));
  });

  it('allows the last file to be deleted, leaving the project with none', async () => {
    const project = await givenProject(api);

    await api
      .http()
      .delete(`/projects/${project.id}/files/${starterFileOf(project).id}`)
      .expect(204);

    const response = await api.http().get(`/projects/${project.id}`);

    expect(response.status).toBe(200);
    expect(parsedAs(projectDetailResourceSchema, response.body).files).toEqual([]);
  });

  it('leaves the other files in the project alone', async () => {
    const project = await givenProject(api);
    const doomed = await givenFile(api, project.id, { name: 'doomed.ts' });

    await api.http().delete(`/projects/${project.id}/files/${doomed.id}`).expect(204);
    const response = await api.http().get(`/projects/${project.id}/files`);

    expect(parsedAs(projectFileSummaryListSchema, response.body).map((file) => file.name)).toEqual([
      'main.ts',
    ]);
  });

  it('answers FILE_NOT_FOUND the second time, because deletion is permanent', async () => {
    const project = await givenProject(api);
    const file = await givenFile(api, project.id, { name: 'utils.ts' });

    await api.http().delete(`/projects/${project.id}/files/${file.id}`).expect(204);
    const response = await api.http().delete(`/projects/${project.id}/files/${file.id}`);

    expect(response.status).toBe(404);
    expect(apiError(response.body).code).toBe('FILE_NOT_FOUND');
  });

  it('answers FILE_NOT_FOUND for a file addressed through the wrong project', async () => {
    const owner = await givenProject(api, 'Owner');
    const other = await givenProject(api, 'Other');
    const file = await givenFile(api, owner.id, { name: 'utils.ts' });

    const response = await api.http().delete(`/projects/${other.id}/files/${file.id}`);

    expect(response.status).toBe(404);
    expect(apiError(response.body).code).toBe('FILE_NOT_FOUND');
  });

  it('answers PROJECT_NOT_FOUND when the project does not exist', async () => {
    const response = await api.http().delete(`/projects/${ABSENT_ID}/files/${ABSENT_ID}`);

    expect(response.status).toBe(404);
    expect(apiError(response.body).code).toBe('PROJECT_NOT_FOUND');
  });
});
