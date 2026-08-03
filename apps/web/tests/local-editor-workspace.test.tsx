import type { CodeEditorProps } from '@/editor/code-editor';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LocalEditorWorkspace } from '@/editor/local-editor-workspace';

// The editor is replaced by a plain textarea honouring the same controlled
// contract, which is enough to act as a user typing without pretending jsdom can
// run Monaco. Typing it as `CodeEditorProps` means the stand-in cannot drift away
// from the real boundary without the type-check noticing.
//
// Nothing here can hand the workspace an `undefined` value: `CodeEditorProps`
// promises a string, and `code-editor.test.tsx` covers Monaco's `undefined` being
// dropped before it ever reaches this component.
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

// The languages the workspace is expected to offer, restated here rather than
// imported: a test that read the same list the component renders from would
// agree with it whatever it contained.
const OTHER_LANGUAGES = [
  { label: 'JavaScript', id: 'javascript', fileName: 'main.js' },
  { label: 'Python', id: 'python', fileName: 'main.py' },
  { label: 'JSON', id: 'json', fileName: 'data.json' },
  { label: 'Markdown', id: 'markdown', fileName: 'README.md' },
];

function editorContent(): HTMLTextAreaElement {
  const element = screen.getByRole('textbox', { name: 'Editor content' });

  if (!(element instanceof HTMLTextAreaElement)) {
    throw new Error('The workspace did not render an editable surface.');
  }

  return element;
}

function languageSelect(): HTMLSelectElement {
  const element = screen.getByRole('combobox', { name: 'Language' });

  if (!(element instanceof HTMLSelectElement)) {
    throw new Error('The workspace did not render a language selector.');
  }

  return element;
}

function type(text: string) {
  fireEvent.change(editorContent(), { target: { value: text } });
}

function selectLanguage(id: string) {
  fireEvent.change(languageSelect(), { target: { value: id } });
}

describe('local editor workspace', () => {
  it('opens the sample file when it first renders', () => {
    render(<LocalEditorWorkspace />);

    expect(editorContent().value).toMatch(/export function greet\(name: string\): string/);
  });

  it('names the one file it has open', () => {
    render(<LocalEditorWorkspace />);

    expect(screen.getByText('main.ts')).toBeInTheDocument();
  });

  it('opens that file as TypeScript', () => {
    render(<LocalEditorWorkspace />);

    expect(screen.getByTestId('editor-language')).toHaveTextContent('typescript');
  });

  it('starts with TypeScript chosen in the selector', () => {
    render(<LocalEditorWorkspace />);

    expect(languageSelect()).toHaveValue('typescript');
  });

  it('offers the languages the file can be read as', () => {
    render(<LocalEditorWorkspace />);

    const labels = screen.getAllByRole('option').map((option) => option.textContent);

    expect(labels).toEqual(['TypeScript', 'JavaScript', 'Python', 'JSON', 'Markdown']);
  });

  it.each(OTHER_LANGUAGES)('reads the file as $label when $label is selected', (language) => {
    render(<LocalEditorWorkspace />);

    selectLanguage(language.id);

    expect(screen.getByTestId('editor-language')).toHaveTextContent(language.id);
    expect(screen.getByText(language.fileName)).toBeInTheDocument();
  });

  it('keeps the content when the language changes, because it is the same file', () => {
    render(<LocalEditorWorkspace />);

    type('const kept = true;');
    selectLanguage('python');

    expect(editorContent().value).toBe('const kept = true;');
    expect(screen.getByTestId('editor-language')).toHaveTextContent('python');
  });

  it('ignores a selection that is not one of its languages', () => {
    render(<LocalEditorWorkspace />);

    // A `<select>` reports a value its markup never offered as an empty string,
    // which is what the workspace has to reject rather than store.
    selectLanguage('cobol');

    expect(screen.getByTestId('editor-language')).toHaveTextContent('typescript');
    expect(screen.getByText('main.ts')).toBeInTheDocument();
  });

  it('keeps what the user types', () => {
    render(<LocalEditorWorkspace />);

    type('const edited = true;');

    expect(editorContent().value).toBe('const edited = true;');
  });

  it('does not lose the content when it renders again', () => {
    const { rerender } = render(<LocalEditorWorkspace />);

    type('const survives = true;');
    rerender(<LocalEditorWorkspace />);

    expect(editorContent().value).toBe('const survives = true;');
  });

  it('does not lose the selected language when it renders again', () => {
    const { rerender } = render(<LocalEditorWorkspace />);

    selectLanguage('markdown');
    rerender(<LocalEditorWorkspace />);

    expect(languageSelect()).toHaveValue('markdown');
    expect(screen.getByText('README.md')).toBeInTheDocument();
  });

  it('lets the file be emptied, because empty is valid content', () => {
    render(<LocalEditorWorkspace />);

    type('');

    expect(editorContent().value).toBe('');
  });

  it('starts again from the sample when remounted, because nothing is stored', () => {
    const { unmount } = render(<LocalEditorWorkspace />);

    type('const discarded = true;');
    unmount();

    render(<LocalEditorWorkspace />);

    expect(editorContent().value).not.toBe('const discarded = true;');
    expect(editorContent().value).toMatch(/export function greet\(name: string\): string/);
  });

  it('opens as TypeScript again when remounted, for the same reason', () => {
    const { unmount } = render(<LocalEditorWorkspace />);

    selectLanguage('python');
    unmount();

    render(<LocalEditorWorkspace />);

    expect(languageSelect()).toHaveValue('typescript');
    expect(screen.getByText('main.ts')).toBeInTheDocument();
  });
});
