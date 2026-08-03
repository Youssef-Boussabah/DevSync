'use client';

import { useState } from 'react';
import { CodeEditor } from '@/editor/code-editor';

// One fixed file identity, not a file system. There is nothing behind the name:
// no path, no directory, and no second file to disambiguate it from.
const FILE_NAME = 'main.ts';

// TypeScript until the milestone that makes the language selectable.
const FILE_LANGUAGE = 'typescript';

const INITIAL_CONTENT = `// This file lives in your browser's memory. Refreshing the page discards it.
export function greet(name: string): string {
  return \`Hello, \${name}!\`;
}

console.log(greet('DevSync'));
`;

/**
 * The single-file editing workspace. It owns the current contents in React state,
 * so the application knows what the user is editing instead of that living only
 * inside Monaco. The state is browser memory and nothing else — it is never read
 * back from storage, and remounting starts again from the sample.
 */
export function LocalEditorWorkspace() {
  const [content, setContent] = useState(INITIAL_CONTENT);

  return (
    <div className="flex flex-col gap-2">
      <p className="font-mono text-sm text-zinc-500">{FILE_NAME}</p>
      <CodeEditor value={content} language={FILE_LANGUAGE} onChange={setContent} />
    </div>
  );
}
