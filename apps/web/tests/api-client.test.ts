import type { ApiErrorResource, ProjectFileResource } from '@devsync/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createProject,
  createProjectFile,
  deleteProject,
  deleteProjectFile,
  getProject,
  getProjectFile,
  isAbortError,
  isApiRequestError,
  issueMessageFor,
  listProjects,
  renameProject,
  updateProjectFile,
} from '@/api';

// The transport, against a stubbed `fetch`.
//
// Nothing here starts a server: the claim being tested is what the client sends,
// what it makes of what comes back, and what it throws — all of which are
// decisions this layer makes on its own. That the routes themselves behave is
// proved against a real API and a real PostgreSQL by `pnpm test:db`, and through a
// real browser by `pnpm test:e2e`.

const API = 'http://127.0.0.1:3001';

const PROJECT_ID = '2b1cb2a4-1d0d-4a0e-9f0a-6b3f4f9d4c11';
const FILE_ID = 'f0a4c9e2-9a2c-4a91-8a0b-0d16a1f4e2c7';

const PROJECT = {
  id: PROJECT_ID,
  name: 'A project',
  createdAt: '2026-08-04T10:00:00.000Z',
  updatedAt: '2026-08-04T11:00:00.000Z',
};

const FILE_SUMMARY = {
  id: FILE_ID,
  projectId: PROJECT_ID,
  name: 'main.ts',
  language: 'typescript',
  createdAt: '2026-08-04T10:00:00.000Z',
  updatedAt: '2026-08-04T11:00:00.000Z',
};

const FILE: ProjectFileResource = {
  ...FILE_SUMMARY,
  language: 'typescript',
  content: 'const a = 1;\n',
};

const fetchMock = vi.fn<typeof fetch>();

function respondWith(body: unknown, status = 200) {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

function respondWithText(text: string, status = 200) {
  fetchMock.mockResolvedValue(new Response(text, { status }));
}

/** The one call that was made: its URL and the init object beside it. */
function lastCall(): { url: string; init: RequestInit } {
  const call = fetchMock.mock.lastCall;

  if (call === undefined) {
    throw new Error('No request was made.');
  }

  const [target, init] = call;

  if (typeof target !== 'string') {
    throw new Error('The client is expected to build its own URL string.');
  }

  return { url: target, init: init ?? {} };
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

describe('reading resources', () => {
  it('lists projects from the configured API, with no cached answer', async () => {
    respondWith([PROJECT]);

    const projects = await listProjects();

    expect(projects).toEqual([PROJECT]);
    expect(lastCall().url).toBe(`${API}/projects`);
    expect(lastCall().init.method).toBe('GET');
    expect(lastCall().init.cache).toBe('no-store');
  });

  it('sends no Content-Type when there is no body to describe', async () => {
    respondWith([]);

    await listProjects();

    expect(lastCall().init.headers).toBeUndefined();
  });

  it('reads a project and the summaries of its files', async () => {
    respondWith({ ...PROJECT, files: [FILE_SUMMARY] });

    const project = await getProject(PROJECT_ID);

    expect(project.files).toEqual([FILE_SUMMARY]);
    expect(lastCall().url).toBe(`${API}/projects/${PROJECT_ID}`);
  });

  it('reads one complete file, contents included', async () => {
    respondWith(FILE);

    const file = await getProjectFile(PROJECT_ID, FILE_ID);

    expect(file.content).toBe('const a = 1;\n');
    expect(lastCall().url).toBe(`${API}/projects/${PROJECT_ID}/files/${FILE_ID}`);
  });

  it('passes an abort signal through to the request', async () => {
    respondWith([]);

    const controller = new AbortController();
    await listProjects({ signal: controller.signal });

    expect(lastCall().init.signal).toBe(controller.signal);
  });

  it('rethrows an abort untouched, so a caller can tell it apart from a failure', async () => {
    fetchMock.mockRejectedValue(new DOMException('The user aborted a request.', 'AbortError'));

    const failure: unknown = await listProjects().catch((error: unknown) => error);

    expect(isAbortError(failure)).toBe(true);
    expect(isApiRequestError(failure)).toBe(false);
  });
});

describe('writing resources', () => {
  it('creates a project with a JSON body and says so in the headers', async () => {
    respondWith({ ...PROJECT, files: [FILE_SUMMARY] }, 201);

    await createProject({ name: 'A project' });

    expect(lastCall().init.method).toBe('POST');
    expect(lastCall().init.body).toBe(JSON.stringify({ name: 'A project' }));
    expect(lastCall().init.headers).toEqual({ 'Content-Type': 'application/json' });
  });

  it('renames a project through PATCH', async () => {
    respondWith({ ...PROJECT, name: 'Renamed' });

    const project = await renameProject(PROJECT_ID, { name: 'Renamed' });

    expect(project.name).toBe('Renamed');
    expect(lastCall().init.method).toBe('PATCH');
  });

  it('creates a file under its project', async () => {
    respondWith({ ...FILE, name: 'utils.ts', content: '' }, 201);

    await createProjectFile(PROJECT_ID, { name: 'utils.ts', language: 'typescript', content: '' });

    expect(lastCall().url).toBe(`${API}/projects/${PROJECT_ID}/files`);
    expect(lastCall().init.method).toBe('POST');
  });

  it('sends only the properties a save actually changed', async () => {
    respondWith({ ...FILE, content: 'next' });

    await updateProjectFile(PROJECT_ID, FILE_ID, { content: 'next' });

    expect(lastCall().init.body).toBe(JSON.stringify({ content: 'next' }));
  });

  it.each([
    ['a project', () => deleteProject(PROJECT_ID)],
    ['a file', () => deleteProjectFile(PROJECT_ID, FILE_ID)],
  ])('treats the 204 from deleting %s as no body at all', async (_name, remove) => {
    // A `204` carries no body, and `Response.json()` on one rejects — so a client
    // that read it anyway would fail here rather than resolving.
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));

    await expect(remove()).resolves.toBeUndefined();
    expect(lastCall().init.method).toBe('DELETE');
  });

  // The delete routes answer `204` and nothing else. Any other success status is
  // a route that stopped matching its contract, and reporting a deletion that may
  // not have happened is the failure worth refusing.
  it.each([[200], [201], [202]])(
    'refuses a %i from a delete, because the contract says 204',
    async (status: number) => {
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify(PROJECT), {
          status,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const failure: unknown = await deleteProject(PROJECT_ID).catch((error: unknown) => error);

      expect(isApiRequestError(failure) && failure.code).toBe('MALFORMED_RESPONSE');
    },
  );

  it('still reads a documented failure from a delete rather than calling it malformed', async () => {
    respondWith(
      {
        statusCode: 404,
        code: 'PROJECT_NOT_FOUND',
        message: 'No such project.',
      },
      404,
    );

    const failure: unknown = await deleteProject(PROJECT_ID).catch((error: unknown) => error);

    expect(isApiRequestError(failure)).toBe(true);
    if (!isApiRequestError(failure)) return;

    expect(failure.code).toBe('PROJECT_NOT_FOUND');
    expect(failure.status).toBe(404);
  });
});

describe('failures', () => {
  const conflict: ApiErrorResource = {
    statusCode: 409,
    code: 'FILE_NAME_TAKEN',
    message: 'A file named "main.ts" already exists in this project.',
    issues: [{ path: ['name'], message: 'Already used in this project.' }],
  };

  it('turns the shared error resource into a failure carrying its stable code', async () => {
    respondWith(conflict, 409);

    const failure: unknown = await createProjectFile(PROJECT_ID, {
      name: 'main.ts',
      language: 'typescript',
      content: '',
    }).catch((error: unknown) => error);

    expect(isApiRequestError(failure)).toBe(true);
    if (!isApiRequestError(failure)) return;

    expect(failure.code).toBe('FILE_NAME_TAKEN');
    expect(failure.status).toBe(409);
    expect(failure.message).toContain('already exists');
  });

  it('keeps the field-level issue, so it can be shown beside the input', async () => {
    respondWith(conflict, 409);

    const failure: unknown = await renameProject(PROJECT_ID, { name: 'x' }).catch(
      (error: unknown) => error,
    );

    expect(issueMessageFor(failure, 'name')).toBe('Already used in this project.');
    expect(issueMessageFor(failure, 'language')).toBeUndefined();
  });

  it('reports a success body that does not match its contract as a client failure', async () => {
    // A file resource without `content`: the schema is strict, so this is a
    // contract failure rather than a file that happens to be empty.
    respondWith(FILE_SUMMARY);

    const failure: unknown = await getProjectFile(PROJECT_ID, FILE_ID).catch(
      (error: unknown) => error,
    );

    expect(isApiRequestError(failure)).toBe(true);
    if (!isApiRequestError(failure)) return;

    expect(failure.code).toBe('MALFORMED_RESPONSE');
  });

  it('reports a success body that is not JSON the same way', async () => {
    respondWithText('<html>a proxy said something</html>');

    const failure: unknown = await listProjects().catch((error: unknown) => error);

    expect(isApiRequestError(failure) && failure.code).toBe('MALFORMED_RESPONSE');
  });

  it('does not believe half of a failure body it cannot read', async () => {
    respondWith({ statusCode: 500, code: 'NOT_A_DEVSYNC_CODE' }, 500);

    const failure: unknown = await listProjects().catch((error: unknown) => error);

    expect(isApiRequestError(failure) && failure.code).toBe('MALFORMED_RESPONSE');
  });

  it('reports a request that never arrived as the API being unreachable', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    const failure: unknown = await listProjects().catch((error: unknown) => error);

    expect(isApiRequestError(failure)).toBe(true);
    if (!isApiRequestError(failure)) return;

    expect(failure.code).toBe('API_UNAVAILABLE');
    expect(failure.status).toBeUndefined();
    expect(failure.message).toMatch(/could not reach/i);
  });

  it('shows nothing of what actually went wrong inside', async () => {
    fetchMock.mockRejectedValue(new TypeError('connect ECONNREFUSED 127.0.0.1:5433'));

    const failure: unknown = await listProjects().catch((error: unknown) => error);

    expect(isApiRequestError(failure) && failure.message).not.toContain('ECONNREFUSED');
  });
});
