import type { ProjectDetailResource, ProjectResource } from '@devsync/shared';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ApiModule from '@/api';
import { ApiRequestError } from '@/api';
import { ProjectListView } from '@/projects/project-list-view';

// The project list, with the API layer replaced and everything else real.
//
// Only the four named operations are mocked; the error type, the code check, and
// the issue lookup are the real ones, so a component that read a failure wrongly
// fails here. What the routes themselves do is proved against a real API in
// `pnpm test:db` and through a real browser in `pnpm test:e2e`.

const push = vi.fn<(href: string) => void>();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

const api = vi.hoisted(() => ({
  listProjects: vi.fn(),
  createProject: vi.fn(),
  renameProject: vi.fn(),
  deleteProject: vi.fn(),
}));

vi.mock('@/api', async () => {
  const actual = await vi.importActual<typeof ApiModule>('@/api');

  return { ...actual, ...api };
});

const ALPHA: ProjectResource = {
  id: '2b1cb2a4-1d0d-4a0e-9f0a-6b3f4f9d4c11',
  name: 'Alpha',
  createdAt: '2026-08-04T09:00:00.000Z',
  updatedAt: '2026-08-04T11:00:00.000Z',
};

const BETA: ProjectResource = {
  id: '9c2f8a51-5d7e-4c1b-8f30-1e5a7b9d3c02',
  name: 'Beta',
  createdAt: '2026-08-03T09:00:00.000Z',
  updatedAt: '2026-08-03T10:00:00.000Z',
};

const CREATED: ProjectDetailResource = {
  id: '4d7e1f90-2a3b-4c5d-9e6f-7a8b9c0d1e2f',
  name: 'Fresh',
  createdAt: '2026-08-04T12:00:00.000Z',
  updatedAt: '2026-08-04T12:00:00.000Z',
  files: [],
};

function failure(code: 'PROJECT_NOT_FOUND' | 'VALIDATION_FAILED' | 'API_UNAVAILABLE') {
  if (code === 'VALIDATION_FAILED') {
    return new ApiRequestError('VALIDATION_FAILED', 'The request body is not valid.', {
      status: 400,
      issues: [{ path: ['name'], message: 'A project name is required.' }],
    });
  }

  return new ApiRequestError(code, 'Something failed.', { status: 404 });
}

function typeInto(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

beforeEach(() => {
  api.listProjects.mockResolvedValue([ALPHA, BETA]);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('project list', () => {
  it('says it is loading before the projects arrive', () => {
    api.listProjects.mockReturnValue(new Promise(() => undefined));

    render(<ProjectListView />);

    expect(screen.getByText(/loading your projects/i)).toBeInTheDocument();
  });

  it('shows every project the API returned, in the order it returned them', async () => {
    render(<ProjectListView />);

    const names = (await screen.findAllByRole('heading', { level: 3 })).map(
      (heading) => heading.textContent,
    );

    expect(names).toEqual(['Alpha', 'Beta']);
  });

  it('shows when each project last changed, as a machine-readable instant too', async () => {
    render(<ProjectListView />);
    await screen.findByRole('heading', { level: 3, name: 'Alpha' });

    const [updated] = document.querySelectorAll('time');

    expect(updated?.getAttribute('datetime')).toBe(ALPHA.updatedAt);
  });

  it('never puts a project identifier on screen', async () => {
    render(<ProjectListView />);
    await screen.findByRole('heading', { level: 3, name: 'Alpha' });

    expect(document.body.textContent).not.toContain(ALPHA.id);
  });

  it('offers the create form beside an empty list rather than an empty page', async () => {
    api.listProjects.mockResolvedValue([]);

    render(<ProjectListView />);

    expect(await screen.findByText(/no projects yet/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create project' })).toBeInTheDocument();
  });

  it('says so when the API cannot be reached, and offers to try again', async () => {
    api.listProjects.mockRejectedValue(failure('API_UNAVAILABLE'));

    render(<ProjectListView />);

    expect(await screen.findByText(/could not reach its API/i)).toBeInTheDocument();

    api.listProjects.mockResolvedValue([ALPHA]);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('heading', { level: 3, name: 'Alpha' })).toBeInTheDocument();
  });
});

describe('creating a project', () => {
  it('opens the new project once the API has created it', async () => {
    api.createProject.mockResolvedValue(CREATED);

    render(<ProjectListView />);
    typeInto('New project name', 'Fresh');
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }));

    await waitFor(() => {
      expect(api.createProject).toHaveBeenCalledWith({ name: 'Fresh' });
    });
    expect(push).toHaveBeenCalledWith(`/projects/${CREATED.id}`);
  });

  it('will not submit twice while the first request is in flight', async () => {
    api.createProject.mockReturnValue(new Promise(() => undefined));

    render(<ProjectListView />);
    typeInto('New project name', 'Fresh');

    const submit = await screen.findByRole('button', { name: 'Create project' });
    fireEvent.click(submit);

    expect(await screen.findByRole('button', { name: 'Creating…' })).toBeDisabled();
    expect(api.createProject).toHaveBeenCalledTimes(1);
  });

  it('shows a validation issue beside the name it is about', async () => {
    api.createProject.mockRejectedValue(failure('VALIDATION_FAILED'));

    render(<ProjectListView />);
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }));

    expect(await screen.findByText('A project name is required.')).toBeInTheDocument();
    expect(screen.getByLabelText('New project name')).toHaveAttribute('aria-invalid', 'true');
    expect(push).not.toHaveBeenCalled();
  });
});

describe('renaming a project', () => {
  it('shows the new name only after the server has confirmed it', async () => {
    let resolveRename: ((project: ProjectResource) => void) | undefined;
    api.renameProject.mockReturnValue(
      new Promise<ProjectResource>((resolve) => {
        resolveRename = resolve;
      }),
    );

    render(<ProjectListView />);
    fireEvent.click(await screen.findByRole('button', { name: 'Rename Alpha' }));
    typeInto('New name for Alpha', 'Alpha renamed');
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }));

    await waitFor(() => {
      expect(api.renameProject).toHaveBeenCalledWith(ALPHA.id, { name: 'Alpha renamed' });
    });
    expect(screen.queryByRole('heading', { name: 'Alpha renamed' })).not.toBeInTheDocument();

    resolveRename?.({ ...ALPHA, name: 'Alpha renamed' });

    expect(
      await screen.findByRole('heading', { level: 3, name: 'Alpha renamed' }),
    ).toBeInTheDocument();
  });

  it('keeps the rename form open and says why when the server refuses', async () => {
    api.renameProject.mockRejectedValue(failure('VALIDATION_FAILED'));

    render(<ProjectListView />);
    fireEvent.click(await screen.findByRole('button', { name: 'Rename Alpha' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }));

    expect(await screen.findByText('A project name is required.')).toBeInTheDocument();
    expect(screen.getByLabelText('New name for Alpha')).toBeInTheDocument();
  });

  it('drops a project from the list when the rename says it is already gone', async () => {
    api.renameProject.mockRejectedValue(failure('PROJECT_NOT_FOUND'));

    render(<ProjectListView />);
    fireEvent.click(await screen.findByRole('button', { name: 'Rename Alpha' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }));

    await waitFor(() => {
      expect(screen.queryByText('Alpha')).not.toBeInTheDocument();
    });
    expect(screen.getByRole('heading', { level: 3, name: 'Beta' })).toBeInTheDocument();
  });
});

describe('deleting a project', () => {
  it('asks first, and does nothing if the answer is no', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(<ProjectListView />);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Alpha' }));

    expect(api.deleteProject).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { level: 3, name: 'Alpha' })).toBeInTheDocument();
  });

  it('warns that it is permanent', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(<ProjectListView />);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Alpha' }));

    expect(confirm.mock.calls[0]?.[0]).toMatch(/permanent/i);
  });

  it('removes the project once the API has deleted it', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    api.deleteProject.mockResolvedValue(undefined);

    render(<ProjectListView />);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Alpha' }));

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Alpha' })).not.toBeInTheDocument();
    });
    expect(api.deleteProject).toHaveBeenCalledWith(ALPHA.id);
    expect(screen.getByRole('heading', { level: 3, name: 'Beta' })).toBeInTheDocument();
  });

  it('reconciles the list when the project was already gone', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    api.deleteProject.mockRejectedValue(failure('PROJECT_NOT_FOUND'));

    render(<ProjectListView />);
    fireEvent.click(await screen.findByRole('button', { name: 'Delete Alpha' }));

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Alpha' })).not.toBeInTheDocument();
    });
  });
});
