import type { EditorProps } from '@monaco-editor/react';
import { render, screen } from '@testing-library/react';
import type { editor } from 'monaco-editor';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CodeEditor } from '@/editor/code-editor';

// jsdom is not a browser Monaco can run in — it has no canvas metrics, no layout,
// and no web workers — so the integration is mocked at its narrowest point and the
// assertions stay on what DevSync owns: what the editor is told to display, with
// which options, what it reports back, and what the user sees while it is still
// loading. Monaco's own behaviour is covered by the Playwright suite.
const monacoIntegration = vi.hoisted(() => ({
  render: vi.fn<(props: EditorProps) => void>(),
  config: vi.fn(),
}));

vi.mock('@monaco-editor/react', () => ({
  default: (props: EditorProps) => {
    monacoIntegration.render(props);
    return <div data-testid="monaco-editor">{props.loading}</div>;
  },
  loader: { config: monacoIntegration.config },
}));

vi.mock('monaco-editor', () => ({ editor: {} }));

// Monaco hands the change event over alongside the value. Nothing in DevSync reads
// it, so the tests pass a bare stand-in rather than rebuilding Monaco's shape.
const contentChanged = {} as editor.IModelContentChangedEvent;

const FILE_CONTENT = 'export const answer = 42;\n';

function editorProps(): EditorProps {
  const [props] = monacoIntegration.render.mock.lastCall ?? [];

  if (!props) {
    throw new Error('The Monaco integration was never rendered.');
  }

  return props;
}

function renderEditor() {
  const onChange = vi.fn<(value: string) => void>();

  render(<CodeEditor value={FILE_CONTENT} language="typescript" onChange={onChange} />);

  return onChange;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('code editor', () => {
  it('tells the user the editor is loading before Monaco is available', () => {
    renderEditor();

    expect(screen.getByText(/loading the editor/i)).toBeInTheDocument();
    expect(screen.queryByTestId('monaco-editor')).not.toBeInTheDocument();
  });

  it('mounts the editor once Monaco has loaded, in a region the user can identify', async () => {
    renderEditor();

    expect(await screen.findByTestId('monaco-editor')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Code editor' })).toBeInTheDocument();
  });

  it('loads Monaco from the bundled package rather than a CDN', async () => {
    renderEditor();
    await screen.findByTestId('monaco-editor');

    expect(monacoIntegration.config).toHaveBeenCalledWith({
      monaco: await import('monaco-editor'),
    });
  });

  it('shows the content it was given, in the language it was given', async () => {
    renderEditor();
    await screen.findByTestId('monaco-editor');

    const { value, language } = editorProps();

    expect(value).toBe(FILE_CONTENT);
    expect(language).toBe('typescript');
  });

  it('reports an edit back to the caller', async () => {
    const onChange = renderEditor();
    await screen.findByTestId('monaco-editor');

    editorProps().onChange?.('export const answer = 43;\n', contentChanged);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('export const answer = 43;\n');
  });

  it('reports an emptied file, which is a real edit', async () => {
    const onChange = renderEditor();
    await screen.findByTestId('monaco-editor');

    editorProps().onChange?.('', contentChanged);

    expect(onChange).toHaveBeenCalledWith('');
  });

  it('ignores a change Monaco reports without a value', async () => {
    const onChange = renderEditor();
    await screen.findByTestId('monaco-editor');

    editorProps().onChange?.(undefined, contentChanged);

    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps the editor sized to its container as the window changes', async () => {
    renderEditor();
    await screen.findByTestId('monaco-editor');

    expect(editorProps().options?.automaticLayout).toBe(true);
  });

  it('names the editor for assistive technology', async () => {
    renderEditor();
    await screen.findByTestId('monaco-editor');

    expect(editorProps().options?.ariaLabel).toBe('DevSync code editor');
  });

  it('hands a loading surface to the integration for its own start-up', async () => {
    renderEditor();
    await screen.findByTestId('monaco-editor');

    expect(screen.getByText(/starting the editor/i)).toBeInTheDocument();
  });

  it('says so when Monaco cannot be loaded at all', async () => {
    vi.resetModules();
    vi.doMock('monaco-editor', () => {
      throw new Error('the chunk could not be fetched');
    });

    const { CodeEditor: CodeEditorWithoutMonaco } = await import('@/editor/code-editor');
    render(
      <CodeEditorWithoutMonaco value={FILE_CONTENT} language="typescript" onChange={vi.fn()} />,
    );

    expect(await screen.findByText(/could not be loaded/i)).toBeInTheDocument();
    expect(screen.queryByTestId('monaco-editor')).not.toBeInTheDocument();
  });
});
