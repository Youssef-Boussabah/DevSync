'use client';

import type { ChangeEvent } from 'react';
import { useState } from 'react';
import { CodeEditor } from '@/editor/code-editor';
import { DEFAULT_EDITOR_LANGUAGE, EDITOR_LANGUAGES, findEditorLanguage } from '@/editor/languages';

const INITIAL_CONTENT = `// This file lives in your browser's memory. Refreshing the page discards it.
export function greet(name: string): string {
  return \`Hello, \${name}!\`;
}

console.log(greet('DevSync'));
`;

/**
 * The single-file editing workspace. It owns the current contents and the
 * language they are read as, so the application knows what the user is editing
 * instead of that living only inside Monaco. Both are browser memory and nothing
 * else — neither is read back from storage, and remounting starts again from the
 * TypeScript sample.
 */
export function LocalEditorWorkspace() {
  const [content, setContent] = useState(INITIAL_CONTENT);
  const [language, setLanguage] = useState(DEFAULT_EDITOR_LANGUAGE);

  function handleLanguageChange(event: ChangeEvent<HTMLSelectElement>) {
    const selected = findEditorLanguage(event.target.value);

    // A value the markup below never offered is ignored rather than thrown on:
    // leaving the current language alone is a better answer than failing the
    // render, and it keeps the state to the languages that actually exist.
    if (selected) {
      setLanguage(selected);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        {/* The name follows the language rather than the other way round: nothing
            resolves it, and there is no second file to tell it apart from. */}
        <p className="font-mono text-sm text-zinc-500">{language.fileName}</p>

        <div className="flex items-center gap-2">
          <label htmlFor="editor-language" className="text-sm text-zinc-500">
            Language
          </label>
          <select
            id="editor-language"
            value={language.id}
            onChange={handleLanguageChange}
            className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          >
            {EDITOR_LANGUAGES.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* The content is not touched here, so changing the language re-reads what
          the user already has rather than replacing it. */}
      <CodeEditor value={content} language={language.id} onChange={setContent} />
    </div>
  );
}
