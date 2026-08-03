// The languages the one open file can be read as. Monaco registers dozens more;
// these five are the ones DevSync offers, chosen deliberately rather than
// inherited from whatever the library happens to bundle.
//
// There is still exactly one file and one buffer. Selecting a language changes
// how Monaco interprets and highlights the text that is already there — the name
// below is what that file is called while it is being read that way, not a
// second file that exists somewhere.
export const EDITOR_LANGUAGES = [
  { id: 'typescript', label: 'TypeScript', fileName: 'main.ts' },
  { id: 'javascript', label: 'JavaScript', fileName: 'main.js' },
  { id: 'python', label: 'Python', fileName: 'main.py' },
  { id: 'json', label: 'JSON', fileName: 'data.json' },
  { id: 'markdown', label: 'Markdown', fileName: 'README.md' },
] as const;

export type EditorLanguage = (typeof EDITOR_LANGUAGES)[number];

// The file opens as TypeScript, which is what its sample content is written in.
export const DEFAULT_EDITOR_LANGUAGE: EditorLanguage = EDITOR_LANGUAGES[0];

// A `<select>` reports its value as a plain string, so it is resolved against the
// list above rather than asserted to be one of its members. A value that is not
// offered produces `undefined` and the caller decides what to do with it, which
// is what keeps the selected language narrowly typed without a cast.
export function findEditorLanguage(id: string): EditorLanguage | undefined {
  return EDITOR_LANGUAGES.find((language) => language.id === id);
}
