import { render, screen } from '@testing-library/react';
import type { EditorProps } from '@monaco-editor/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CodeEditor } from '@/editor/code-editor';

// jsdom is not a browser Monaco can run in — it has no canvas metrics, no layout,
// and no web workers — so the integration is mocked at its narrowest point and the
// assertions stay on what DevSync owns: what the editor is asked to open, with
// which options, and what the user sees while it is still loading. Monaco's own
// behaviour is covered by the Playwright suite against a real browser.
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

function editorProps(): EditorProps {
  const [props] = monacoIntegration.render.mock.lastCall ?? [];

  if (!props) {
    throw new Error('The Monaco integration was never rendered.');
  }

  return props;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('code editor', () => {
  it('tells the user the editor is loading before Monaco is available', () => {
    render(<CodeEditor />);

    expect(screen.getByText(/loading the editor/i)).toBeInTheDocument();
    expect(screen.queryByTestId('monaco-editor')).not.toBeInTheDocument();
  });

  it('mounts the editor once Monaco has loaded, in a region the user can identify', async () => {
    render(<CodeEditor />);

    expect(await screen.findByTestId('monaco-editor')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Code editor' })).toBeInTheDocument();
  });

  it('loads Monaco from the bundled package rather than a CDN', async () => {
    render(<CodeEditor />);
    await screen.findByTestId('monaco-editor');

    expect(monacoIntegration.config).toHaveBeenCalledWith({
      monaco: await import('monaco-editor'),
    });
  });

  it('opens a TypeScript file with sample code already in it', async () => {
    render(<CodeEditor />);
    await screen.findByTestId('monaco-editor');

    const { defaultLanguage, defaultValue } = editorProps();

    expect(defaultLanguage).toBe('typescript');
    expect(defaultValue).toMatch(/export function greet\(name: string\): string/);
  });

  it('keeps the editor sized to its container as the window changes', async () => {
    render(<CodeEditor />);
    await screen.findByTestId('monaco-editor');

    expect(editorProps().options?.automaticLayout).toBe(true);
  });

  it('names the editor for assistive technology', async () => {
    render(<CodeEditor />);
    await screen.findByTestId('monaco-editor');

    expect(editorProps().options?.ariaLabel).toBe('DevSync code editor');
  });

  it('hands a loading surface to the integration for its own start-up', async () => {
    render(<CodeEditor />);
    await screen.findByTestId('monaco-editor');

    expect(screen.getByText(/starting the editor/i)).toBeInTheDocument();
  });

  it('says so when Monaco cannot be loaded at all', async () => {
    vi.resetModules();
    vi.doMock('monaco-editor', () => {
      throw new Error('the chunk could not be fetched');
    });

    const { CodeEditor: CodeEditorWithoutMonaco } = await import('@/editor/code-editor');
    render(<CodeEditorWithoutMonaco />);

    expect(await screen.findByText(/could not be loaded/i)).toBeInTheDocument();
    expect(screen.queryByTestId('monaco-editor')).not.toBeInTheDocument();
  });
});
