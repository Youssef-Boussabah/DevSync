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
});
