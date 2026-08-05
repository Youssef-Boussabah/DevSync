import type { ProjectDetailResource, ProjectFileResource } from '@devsync/shared';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ApiModule from '@/api';
import { ApiRequestError } from '@/api';
import type { CodeEditorProps } from '@/editor/code-editor';
import { ProjectWorkspace } from '@/workspace/project-workspace';

// The workspace, with the API layer replaced and the editor replaced by a plain
// textarea honouring the same controlled contract. Typing it as the real
// `CodeEditorProps` means the stand-in cannot drift from the boundary without the
// type-check noticing, and it is enough to act as a user typing without
// pretending jsdom can run Monaco — which `code-editor.test.tsx` covers, and the
// Playwright suite drives for real.

const push = vi.fn<(href: string) => void>();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

vi.mock('@/editor/code-editor', () => ({
  CodeEditor: ({ value, language, onChange }: CodeEditorProps) => (
    <div>
      <span data-testid="editor-language">{language}</span>
      <textarea
        aria-label="Editor content"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
    </div>
  ),
}));

const api = vi.hoisted(() => ({
  getProject: vi.fn(),
  renameProject: vi.fn(),
  deleteProject: vi.fn(),
  createProjectFile: vi.fn(),
  getProjectFile: vi.fn(),
  updateProjectFile: vi.fn(),
  deleteProjectFile: vi.fn(),
}));

vi.mock('@/api', async () => {
  const actual = await vi.importActual<typeof ApiModule>('@/api');

  return { ...actual, ...api };
});

const PROJECT_ID = '2b1cb2a4-1d0d-4a0e-9f0a-6b3f4f9d4c11';
const MAIN_ID = 'f0a4c9e2-9a2c-4a91-8a0b-0d16a1f4e2c7';
const NOTES_ID = 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d';

const MAIN: ProjectFileResource = {
  id: MAIN_ID,
  projectId: PROJECT_ID,
  name: 'main.ts',
  language: 'typescript',
  content: 'const a = 1;\n',
  createdAt: '2026-08-04T09:00:00.000Z',
  updatedAt: '2026-08-04T10:00:00.000Z',
};

const NOTES: ProjectFileResource = {
  id: NOTES_ID,
  projectId: PROJECT_ID,
  name: 'README.md',
  language: 'markdown',
  content: '# Notes\n',
  createdAt: '2026-08-04T09:30:00.000Z',
  updatedAt: '2026-08-04T10:30:00.000Z',
};

function summaryOf({ content: _content, ...summary }: ProjectFileResource) {
  return summary;
}

function projectWith(...files: ProjectFileResource[]): ProjectDetailResource {
  return {
    id: PROJECT_ID,
    name: 'Alpha',
    createdAt: '2026-08-04T09:00:00.000Z',
    updatedAt: '2026-08-04T10:30:00.000Z',
    files: files.map(summaryOf),
  };
}

function fileFor(id: string): ProjectFileResource {
  return id === MAIN_ID ? MAIN : NOTES;
}

function editorContent(): HTMLTextAreaElement {
  const element = screen.getByRole('textbox', { name: 'Editor content' });

  if (!(element instanceof HTMLTextAreaElement)) {
    throw new Error('The workspace did not render an editable surface.');
  }

  return element;
}

function type(text: string) {
  fireEvent.change(editorContent(), { target: { value: text } });
}

function setField(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function saveButton(): HTMLElement {
  return screen.getByRole('button', { name: 'Save' });
}

function deleteFileButton(): HTMLElement {
  return screen.getByRole('button', { name: 'Delete file' });
}

/**
 * The form around the file controls.
 *
 * Submitting it directly is how a user reaches `handleSave` without the Save
 * button — pressing Enter in the name field does exactly this — so it is also the
 * only way to prove the handler's own guard rather than the button's `disabled`
 * attribute.
 */
function fileForm(): HTMLFormElement {
  const form = screen.getByLabelText('File name').closest('form');

  if (!(form instanceof HTMLFormElement)) {
    throw new Error('The file controls are not inside a form.');
  }

  return form;
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
}

/**
 * A promise the test decides when to settle.
 *
 * The concurrency tests are about what happens **while** a request is in flight,
 * so they need one that genuinely stays open rather than one that has already
 * resolved by the next tick.
 */
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;

  const promise = new Promise<T>((resolveWith, rejectWith) => {
    resolve = resolveWith;
    reject = rejectWith;
  });

  return { promise, resolve, reject };
}

/** Renders and waits until the first file is open, which is where every flow starts. */
async function openWorkspace() {
  render(<ProjectWorkspace projectId={PROJECT_ID} />);

  await screen.findByRole('textbox', { name: 'File name' });
}

beforeEach(() => {
  api.getProject.mockResolvedValue(projectWith(MAIN, NOTES));
  api.getProjectFile.mockImplementation((_projectId: string, fileId: string) =>
    Promise.resolve(fileFor(fileId)),
  );
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe('loading a project', () => {
  it('says it is loading before the project arrives', () => {
    api.getProject.mockReturnValue(new Promise(() => undefined));

    render(<ProjectWorkspace projectId={PROJECT_ID} />);

    expect(screen.getByText(/loading the project/i)).toBeInTheDocument();
  });

  it('shows the project name and its files', async () => {
    await openWorkspace();

    expect(screen.getByRole('heading', { level: 1, name: 'Alpha' })).toBeInTheDocument();
    expect(screen.getByText('main.ts')).toBeInTheDocument();
    expect(screen.getByText('README.md')).toBeInTheDocument();
  });

  it('opens the first file, contents and stored language included', async () => {
    await openWorkspace();

    expect(editorContent().value).toBe('const a = 1;\n');
    expect(screen.getByTestId('editor-language')).toHaveTextContent('typescript');
    expect(screen.getByLabelText('File name')).toHaveValue('main.ts');
    expect(api.getProjectFile).toHaveBeenCalledWith(PROJECT_ID, MAIN_ID, expect.anything());
  });

  it('shows a project that no longer exists as exactly that, with a way back', async () => {
    api.getProject.mockRejectedValue(notFound('PROJECT_NOT_FOUND'));

    render(<ProjectWorkspace projectId={PROJECT_ID} />);

    expect(await screen.findByText(/no longer exists/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to your projects/i })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Editor content' })).not.toBeInTheDocument();
  });

  it('offers to try again when the project could not be loaded', async () => {
    api.getProject.mockRejectedValueOnce(
      new ApiRequestError(
        'DATABASE_UNAVAILABLE',
        'The database is unavailable. Try again shortly.',
      ),
    );

    render(<ProjectWorkspace projectId={PROJECT_ID} />);

    expect(await screen.findByText(/database is unavailable/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Alpha' })).toBeInTheDocument();
  });

  it('shows an intentional empty state for a project with no files', async () => {
    api.getProject.mockResolvedValue(projectWith());

    render(<ProjectWorkspace projectId={PROJECT_ID} />);

    expect(await screen.findByText(/this project has no files/i)).toBeInTheDocument();
    expect(api.getProjectFile).not.toHaveBeenCalled();
  });
});

describe('the save model', () => {
  it('says the file is saved, with Save disabled, until something changes', async () => {
    await openWorkspace();

    expect(screen.getByRole('status')).toHaveTextContent('Saved');
    expect(saveButton()).toBeDisabled();
  });

  it('says there are unsaved changes as soon as the content differs', async () => {
    await openWorkspace();

    type('const a = 2;\n');

    expect(screen.getByRole('status')).toHaveTextContent('Unsaved changes');
    expect(saveButton()).toBeEnabled();
  });

  it('sends only the content when only the content changed', async () => {
    api.updateProjectFile.mockResolvedValue({ ...MAIN, content: 'const a = 2;\n' });

    await openWorkspace();
    type('const a = 2;\n');
    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(api.updateProjectFile).toHaveBeenCalledWith(PROJECT_ID, MAIN_ID, {
        content: 'const a = 2;\n',
      });
    });
    expect(screen.getByRole('status')).toHaveTextContent('Saved');
  });

  it('saves an emptied file, because empty is content', async () => {
    api.updateProjectFile.mockResolvedValue({ ...MAIN, content: '' });

    await openWorkspace();
    type('');
    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(api.updateProjectFile).toHaveBeenCalledWith(PROJECT_ID, MAIN_ID, { content: '' });
    });
  });

  it('renames without touching the language', async () => {
    api.updateProjectFile.mockResolvedValue({ ...MAIN, name: 'entry.ts' });

    await openWorkspace();
    setField('File name', 'entry.ts');
    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(api.updateProjectFile).toHaveBeenCalledWith(PROJECT_ID, MAIN_ID, {
        name: 'entry.ts',
      });
    });
    expect(screen.getByLabelText('Language')).toHaveValue('typescript');
  });

  it('changes the language without renaming the file', async () => {
    api.updateProjectFile.mockResolvedValue({ ...MAIN, language: 'javascript' });

    await openWorkspace();
    setField('Language', 'javascript');

    expect(screen.getByLabelText('File name')).toHaveValue('main.ts');
    expect(screen.getByTestId('editor-language')).toHaveTextContent('javascript');

    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(api.updateProjectFile).toHaveBeenCalledWith(PROJECT_ID, MAIN_ID, {
        language: 'javascript',
      });
    });
  });

  it('ignores a language the selector never offered', async () => {
    await openWorkspace();

    setField('Language', 'cobol');

    expect(screen.getByTestId('editor-language')).toHaveTextContent('typescript');
    expect(saveButton()).toBeDisabled();
  });

  it('takes the server resource as the new authority, so a trimmed name settles', async () => {
    api.updateProjectFile.mockResolvedValue({ ...MAIN, name: 'entry.ts' });

    await openWorkspace();
    setField('File name', '  entry.ts  ');
    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(screen.getByLabelText('File name')).toHaveValue('entry.ts');
    });
    expect(screen.getByRole('status')).toHaveTextContent('Saved');
  });

  it('shows the new name in the file list after a successful rename', async () => {
    api.updateProjectFile.mockResolvedValue({ ...MAIN, name: 'entry.ts' });

    await openWorkspace();
    setField('File name', 'entry.ts');
    fireEvent.click(saveButton());

    expect(await screen.findByText('entry.ts')).toBeInTheDocument();
  });

  it('keeps the draft when a save fails, and says the save failed', async () => {
    api.updateProjectFile.mockRejectedValue(
      new ApiRequestError(
        'DATABASE_UNAVAILABLE',
        'The database is unavailable. Try again shortly.',
      ),
    );

    await openWorkspace();
    type('const kept = true;');
    fireEvent.click(saveButton());

    expect(await screen.findByText(/database is unavailable/i)).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Save failed');
    expect(editorContent().value).toBe('const kept = true;');
  });

  it('shows a duplicate name at the field it is about', async () => {
    api.updateProjectFile.mockRejectedValue(
      new ApiRequestError('FILE_NAME_TAKEN', 'A file named "README.md" already exists.', {
        status: 409,
        issues: [{ path: ['name'], message: 'Already used in this project.' }],
      }),
    );

    await openWorkspace();
    setField('File name', 'README.md');
    fireEvent.click(saveButton());

    expect(await screen.findByText('Already used in this project.')).toBeInTheDocument();
    expect(screen.getByLabelText('File name')).toHaveAttribute('aria-invalid', 'true');
  });

  it('clears a previous failure once a later save succeeds', async () => {
    api.updateProjectFile
      .mockRejectedValueOnce(new ApiRequestError('DATABASE_UNAVAILABLE', 'Unavailable.'))
      .mockResolvedValueOnce({ ...MAIN, content: 'retry' });

    await openWorkspace();
    type('retry');
    fireEvent.click(saveButton());

    await screen.findByText('Save failed');

    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Saved');
    });
  });

  it('announces the save state in a live region', async () => {
    await openWorkspace();

    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  });
});

describe('switching files', () => {
  it('loads the other file when it is selected', async () => {
    await openWorkspace();

    fireEvent.click(screen.getByRole('button', { name: /README\.md/ }));

    await waitFor(() => {
      expect(editorContent().value).toBe('# Notes\n');
    });
    expect(screen.getByTestId('editor-language')).toHaveTextContent('markdown');
    expect(screen.getByLabelText('File name')).toHaveValue('README.md');
  });

  it('asks before abandoning an unsaved draft, and stays put if the answer is no', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);

    await openWorkspace();
    type('const unsaved = true;');
    fireEvent.click(screen.getByRole('button', { name: /README\.md/ }));

    expect(confirm).toHaveBeenCalled();
    expect(editorContent().value).toBe('const unsaved = true;');
    expect(api.getProjectFile).toHaveBeenCalledTimes(1);
  });

  it('switches when the answer is yes', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    await openWorkspace();
    type('const unsaved = true;');
    fireEvent.click(screen.getByRole('button', { name: /README\.md/ }));

    await waitFor(() => {
      expect(editorContent().value).toBe('# Notes\n');
    });
  });

  it('asks nothing when there is nothing to lose', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);

    await openWorkspace();
    fireEvent.click(screen.getByRole('button', { name: /README\.md/ }));

    await waitFor(() => {
      expect(editorContent().value).toBe('# Notes\n');
    });
    expect(confirm).not.toHaveBeenCalled();
  });
});

describe('creating a file', () => {
  const created: ProjectFileResource = {
    id: '7f8e9d0c-1b2a-4c3d-9e8f-7a6b5c4d3e2f',
    projectId: PROJECT_ID,
    name: 'utils.ts',
    language: 'typescript',
    content: '',
    createdAt: '2026-08-04T12:00:00.000Z',
    updatedAt: '2026-08-04T12:00:00.000Z',
  };

  beforeEach(() => {
    // The workspace opens a new file by selecting it, and the editor loads
    // whichever file it is given — including this one.
    api.getProjectFile.mockImplementation((_projectId: string, fileId: string) =>
      Promise.resolve(fileId === created.id ? created : fileFor(fileId)),
    );
  });

  it('creates it empty, adds it to the list, and opens it', async () => {
    api.createProjectFile.mockResolvedValue(created);

    await openWorkspace();
    setField('New file name', 'utils.ts');
    fireEvent.click(screen.getByRole('button', { name: 'Add file' }));

    await waitFor(() => {
      expect(api.createProjectFile).toHaveBeenCalledWith(PROJECT_ID, {
        name: 'utils.ts',
        language: 'typescript',
        content: '',
      });
    });
    expect(await screen.findByText('utils.ts')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByLabelText('File name')).toHaveValue('utils.ts');
    });
    expect(editorContent().value).toBe('');
  });

  it('creates it as the language that was chosen', async () => {
    api.createProjectFile.mockResolvedValue({ ...created, name: 'notes.md', language: 'markdown' });

    await openWorkspace();
    setField('New file name', 'notes.md');
    setField('New file language', 'markdown');
    fireEvent.click(screen.getByRole('button', { name: 'Add file' }));

    await waitFor(() => {
      expect(api.createProjectFile).toHaveBeenCalledWith(PROJECT_ID, {
        name: 'notes.md',
        language: 'markdown',
        content: '',
      });
    });
  });

  it('shows a duplicate name at the field it is about', async () => {
    api.createProjectFile.mockRejectedValue(
      new ApiRequestError('FILE_NAME_TAKEN', 'A file named "main.ts" already exists.', {
        status: 409,
        issues: [{ path: ['name'], message: 'Already used in this project.' }],
      }),
    );

    await openWorkspace();
    setField('New file name', 'main.ts');
    fireEvent.click(screen.getByRole('button', { name: 'Add file' }));

    expect(await screen.findByText('Already used in this project.')).toBeInTheDocument();
    expect(screen.getByLabelText('New file name')).toHaveAttribute('aria-invalid', 'true');
  });

  it('asks before it replaces an unsaved draft, and does not create when refused', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    await openWorkspace();
    type('const unsaved = true;');
    setField('New file name', 'utils.ts');
    fireEvent.click(screen.getByRole('button', { name: 'Add file' }));

    expect(api.createProjectFile).not.toHaveBeenCalled();
    expect(editorContent().value).toBe('const unsaved = true;');
  });
});

describe('deleting a file', () => {
  it('asks first, and does nothing if the answer is no', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    await openWorkspace();
    fireEvent.click(screen.getByRole('button', { name: 'Delete file' }));

    expect(api.deleteProjectFile).not.toHaveBeenCalled();
  });

  it('removes it and opens the next file', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    api.deleteProjectFile.mockResolvedValue(undefined);

    await openWorkspace();
    fireEvent.click(screen.getByRole('button', { name: 'Delete file' }));

    await waitFor(() => {
      expect(screen.getByLabelText('File name')).toHaveValue('README.md');
    });
    expect(screen.queryByText('main.ts')).not.toBeInTheDocument();
    expect(api.deleteProjectFile).toHaveBeenCalledWith(PROJECT_ID, MAIN_ID);
  });

  it('leaves the project with no files rather than refusing to delete the last one', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    api.getProject.mockResolvedValue(projectWith(MAIN));
    api.deleteProjectFile.mockResolvedValue(undefined);

    await openWorkspace();
    fireEvent.click(screen.getByRole('button', { name: 'Delete file' }));

    expect(await screen.findByText(/this project has no files/i)).toBeInTheDocument();
    expect(api.deleteProject).not.toHaveBeenCalled();
  });

  it('warns that an unsaved draft goes with it', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);

    await openWorkspace();
    type('const unsaved = true;');
    fireEvent.click(screen.getByRole('button', { name: 'Delete file' }));

    expect(confirm.mock.calls[0]?.[0]).toMatch(/unsaved changes/i);
  });

  it('reconciles the list when a file turns out to be gone already', async () => {
    api.getProjectFile.mockImplementation((_projectId: string, fileId: string) =>
      fileId === MAIN_ID ? Promise.reject(notFound('FILE_NOT_FOUND')) : Promise.resolve(NOTES),
    );

    render(<ProjectWorkspace projectId={PROJECT_ID} />);

    await waitFor(() => {
      expect(screen.getByLabelText('File name')).toHaveValue('README.md');
    });
    expect(screen.queryByText('main.ts')).not.toBeInTheDocument();
  });
});

// A write can discover that something is gone just as a read can, and either code
// can come back from either write: a file can be deleted from another tab while a
// save is in flight, and a project can be deleted while a file delete is. Both
// mean the browser is holding state the server does not have, so both reconcile
// rather than offering a retry for something that will never succeed.
describe('a write that finds the resource gone', () => {
  it('removes the file and opens the next one when a save says the file is gone', async () => {
    api.updateProjectFile.mockRejectedValue(notFound('FILE_NOT_FOUND'));

    await openWorkspace();
    type('const written = true;');
    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(screen.getByLabelText('File name')).toHaveValue('README.md');
    });
    expect(screen.queryByText('main.ts')).not.toBeInTheDocument();
    expect(screen.queryByText('Save failed')).not.toBeInTheDocument();
  });

  it('shows the empty state when a save says the only file is gone', async () => {
    api.getProject.mockResolvedValue(projectWith(MAIN));
    api.updateProjectFile.mockRejectedValue(notFound('FILE_NOT_FOUND'));

    await openWorkspace();
    type('const written = true;');
    fireEvent.click(saveButton());

    expect(await screen.findByText(/this project has no files/i)).toBeInTheDocument();
  });

  it('shows the project-not-found view when a save says the project is gone', async () => {
    api.updateProjectFile.mockRejectedValue(notFound('PROJECT_NOT_FOUND'));

    await openWorkspace();
    type('const written = true;');
    fireEvent.click(saveButton());

    expect(await screen.findByText(/no longer exists/i)).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'File name' })).not.toBeInTheDocument();
  });

  it('reconciles the file away when a delete says it is already gone', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    api.deleteProjectFile.mockRejectedValue(notFound('FILE_NOT_FOUND'));

    await openWorkspace();
    fireEvent.click(deleteFileButton());

    await waitFor(() => {
      expect(screen.getByLabelText('File name')).toHaveValue('README.md');
    });
    expect(screen.queryByText('main.ts')).not.toBeInTheDocument();
  });

  it('shows the project-not-found view when a delete says the project is gone', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    api.deleteProjectFile.mockRejectedValue(notFound('PROJECT_NOT_FOUND'));

    await openWorkspace();
    fireEvent.click(deleteFileButton());

    expect(await screen.findByText(/no longer exists/i)).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'File name' })).not.toBeInTheDocument();
  });
});

// Saving and deleting the same file are two ways of changing it, and they must
// never overlap: a delete landing mid-save makes the save's answer meaningless,
// and a save landing mid-delete writes to a row that is about to disappear.
describe('one write at a time', () => {
  it('will not start a delete while a save is in flight', async () => {
    const save = deferred<ProjectFileResource>();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    api.updateProjectFile.mockReturnValue(save.promise);

    await openWorkspace();
    type('const pending = true;');
    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Saving…');
    });

    expect(deleteFileButton()).toBeDisabled();
    fireEvent.click(deleteFileButton());

    expect(api.deleteProjectFile).not.toHaveBeenCalled();
    // Not even asked: a question whose answer would be ignored should not be put.
    expect(confirm).not.toHaveBeenCalled();

    save.resolve({ ...MAIN, content: 'const pending = true;' });

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Saved');
    });
    expect(deleteFileButton()).toBeEnabled();
  });

  it('will not start a save while a delete is in flight, even through the form', async () => {
    const remove = deferred<void>();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    api.deleteProjectFile.mockReturnValue(remove.promise);

    await openWorkspace();
    type('const pending = true;');
    fireEvent.click(deleteFileButton());

    await waitFor(() => {
      expect(saveButton()).toBeDisabled();
    });

    // Submitting the form is what pressing Enter in the name field does, so it
    // reaches the handler even though the button is disabled. The guard inside
    // `handleSave` is what has to refuse it.
    fireEvent.submit(fileForm());

    expect(api.updateProjectFile).not.toHaveBeenCalled();

    remove.resolve();

    await waitFor(() => {
      expect(screen.getByLabelText('File name')).toHaveValue('README.md');
    });
  });

  it('returns the controls to a usable state after a failed save', async () => {
    const save = deferred<ProjectFileResource>();
    api.updateProjectFile.mockReturnValue(save.promise);

    await openWorkspace();
    type('const pending = true;');
    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Saving…');
    });

    save.reject(new ApiRequestError('DATABASE_UNAVAILABLE', 'The database is unavailable.'));

    expect(await screen.findByText(/database is unavailable/i)).toBeInTheDocument();
    // No pending indicator left behind, and both writes available again.
    expect(screen.getByRole('status')).toHaveTextContent('Save failed');
    expect(saveButton()).toBeEnabled();
    expect(deleteFileButton()).toBeEnabled();
    expect(editorContent().value).toBe('const pending = true;');
  });

  it('returns the controls to a usable state after a failed delete', async () => {
    const remove = deferred<void>();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    api.deleteProjectFile.mockReturnValue(remove.promise);

    await openWorkspace();
    type('const pending = true;');
    fireEvent.click(deleteFileButton());

    await waitFor(() => {
      expect(deleteFileButton()).toBeDisabled();
    });

    remove.reject(new ApiRequestError('DATABASE_UNAVAILABLE', 'The database is unavailable.'));

    expect(await screen.findByText(/database is unavailable/i)).toBeInTheDocument();
    expect(deleteFileButton()).toBeEnabled();
    expect(saveButton()).toBeEnabled();
    // A failed delete is not a failed save, and the draft is still unsaved.
    expect(screen.getByRole('status')).toHaveTextContent('Unsaved changes');
  });

  it('never leaves a pending indicator behind when a save is followed by a delete', async () => {
    const save = deferred<ProjectFileResource>();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    api.updateProjectFile.mockReturnValue(save.promise);
    api.deleteProjectFile.mockResolvedValue(undefined);

    await openWorkspace();
    type('const pending = true;');
    fireEvent.click(saveButton());
    save.resolve({ ...MAIN, content: 'const pending = true;' });

    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('Saved');
    });

    // The delete that was refused while the save was open now goes through, which
    // is the proof that nothing stayed disabled.
    fireEvent.click(deleteFileButton());

    await waitFor(() => {
      expect(api.deleteProjectFile).toHaveBeenCalledWith(PROJECT_ID, MAIN_ID);
    });
  });
});

// A file that could not be loaded is one failed request, not a missing file. The
// selection and the file list are left exactly as they were, and the same request
// can be made again.
describe('retrying a file that failed to load', () => {
  const unavailable = () =>
    new ApiRequestError('API_UNAVAILABLE', 'DevSync could not reach its API.');

  it('offers a retry rather than only an error, and keeps the file selected', async () => {
    api.getProjectFile.mockRejectedValue(unavailable());

    render(<ProjectWorkspace projectId={PROJECT_ID} />);

    expect(await screen.findByText(/could not reach its API/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
    // Still the open file, and still in the list: nothing was reconciled away.
    expect(screen.getByRole('button', { name: /main\.ts/ })).toHaveAttribute(
      'aria-current',
      'true',
    );
  });

  it('makes a second request for the same file and opens it when that succeeds', async () => {
    api.getProjectFile.mockRejectedValueOnce(unavailable());

    render(<ProjectWorkspace projectId={PROJECT_ID} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('textbox', { name: 'File name' })).toHaveValue('main.ts');
    expect(editorContent().value).toBe('const a = 1;\n');
    expect(api.getProjectFile).toHaveBeenCalledTimes(2);
    expect(api.getProjectFile).toHaveBeenLastCalledWith(PROJECT_ID, MAIN_ID, expect.anything());
  });

  it('shows the loading state while the retry is in flight', async () => {
    const reload = deferred<ProjectFileResource>();
    api.getProjectFile.mockRejectedValueOnce(unavailable()).mockReturnValueOnce(reload.promise);

    render(<ProjectWorkspace projectId={PROJECT_ID} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));

    expect(screen.getByText(/loading the file/i)).toBeInTheDocument();

    reload.resolve(MAIN);
    expect(await screen.findByRole('textbox', { name: 'File name' })).toHaveValue('main.ts');
  });

  it('stays retryable when the retry fails too', async () => {
    api.getProjectFile.mockRejectedValue(unavailable());

    render(<ProjectWorkspace projectId={PROJECT_ID} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }));

    await waitFor(() => {
      expect(api.getProjectFile).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('offers no retry for a file that is genuinely gone, and reconciles instead', async () => {
    api.getProjectFile.mockImplementation((_projectId: string, fileId: string) =>
      fileId === MAIN_ID ? Promise.reject(notFound('FILE_NOT_FOUND')) : Promise.resolve(NOTES),
    );

    render(<ProjectWorkspace projectId={PROJECT_ID} />);

    await waitFor(() => {
      expect(screen.getByLabelText('File name')).toHaveValue('README.md');
    });
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });
});

describe('the project itself', () => {
  it('renames the project and shows the name the server answered with', async () => {
    api.renameProject.mockResolvedValue({ ...projectWith(MAIN), name: 'Alpha renamed' });

    await openWorkspace();
    fireEvent.click(screen.getByRole('button', { name: 'Rename project' }));
    setField('Project name', 'Alpha renamed');
    fireEvent.click(screen.getByRole('button', { name: 'Save name' }));

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Alpha renamed' }),
    ).toBeInTheDocument();
    expect(api.renameProject).toHaveBeenCalledWith(PROJECT_ID, { name: 'Alpha renamed' });
  });

  it('deletes the project after a confirmation and returns to the list', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    api.deleteProject.mockResolvedValue(undefined);

    await openWorkspace();
    fireEvent.click(screen.getByRole('button', { name: 'Delete project' }));

    await waitFor(() => {
      expect(api.deleteProject).toHaveBeenCalledWith(PROJECT_ID);
    });
    expect(push).toHaveBeenCalledWith('/');
  });

  it('does not delete the project when the confirmation is refused', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);

    await openWorkspace();
    fireEvent.click(screen.getByRole('button', { name: 'Delete project' }));

    expect(api.deleteProject).not.toHaveBeenCalled();
  });

  it('asks before leaving for the project list with an unsaved draft', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);

    await openWorkspace();
    type('const unsaved = true;');
    fireEvent.click(screen.getByRole('button', { name: /all projects/i }));

    expect(confirm).toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it('leaves for the project list when there is nothing unsaved', async () => {
    await openWorkspace();

    fireEvent.click(screen.getByRole('button', { name: /all projects/i }));

    expect(push).toHaveBeenCalledWith('/');
  });
});

function notFound(code: 'PROJECT_NOT_FOUND' | 'FILE_NOT_FOUND') {
  return new ApiRequestError(code, 'No such thing.', { status: 404 });
}
