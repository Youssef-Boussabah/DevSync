'use client';

import Editor, { loader } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';

const INITIAL_LANGUAGE = 'typescript';

const INITIAL_CONTENT = `// This file lives in your browser's memory. Refreshing the page discards it.
export function greet(name: string): string {
  return \`Hello, \${name}!\`;
}

console.log(greet('DevSync'));
`;

const EDITOR_OPTIONS: editor.IStandaloneEditorConstructionOptions = {
  // Monaco measures its container once and does not watch it afterwards, so
  // without this the editor keeps whatever size it saw on the first paint and
  // stays wrong after a window resize. Set here rather than left to
  // `@monaco-editor/react`'s own default, so the behaviour is DevSync's to keep.
  automaticLayout: true,
  ariaLabel: 'DevSync code editor',
  fontSize: 14,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  tabSize: 2,
};

type EditorState = 'loading' | 'ready' | 'unavailable';

// Monaco runs its language services in web workers and asks this global for them.
// It declares its own worker entry points too, but they sit inside `monaco-editor`,
// where Turbopack copies them out as static files instead of compiling them and the
// workers then fail on their first import. Pointing at entry points in application
// source is what makes Turbopack build them properly; the file extensions are part
// of that, because it only recognises a worker from a fully resolved specifier.
function registerMonacoWorkers() {
  globalThis.MonacoEnvironment = {
    getWorker(_workerId, label) {
      if (label === 'typescript' || label === 'javascript') {
        return new Worker(new URL('./workers/typescript.worker.ts', import.meta.url));
      }

      return new Worker(new URL('./workers/editor.worker.ts', import.meta.url));
    },
  };
}

/**
 * The single editor pane the application currently has. Its content is held in
 * the browser and goes nowhere: nothing is saved, sent, or shared.
 */
export function CodeEditor() {
  const [state, setState] = useState<EditorState>('loading');

  useEffect(() => {
    let active = true;

    registerMonacoWorkers();

    // `monaco-editor` reads browser globals while it initialises, and a client
    // component is still rendered on the server, so it can only be imported from
    // an effect. Handing the instance to the loader also replaces
    // `@monaco-editor/react`'s default of fetching Monaco from a CDN at runtime,
    // which would leave the production image depending on a third-party host.
    import('monaco-editor')
      .then((monaco) => {
        if (!active) return;

        loader.config({ monaco });
        setState('ready');
      })
      .catch(() => {
        if (active) setState('unavailable');
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <section
      aria-label="Code editor"
      className="h-[70vh] min-h-96 overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800"
    >
      {state === 'ready' ? (
        <Editor
          defaultLanguage={INITIAL_LANGUAGE}
          defaultValue={INITIAL_CONTENT}
          options={EDITOR_OPTIONS}
          theme="vs-dark"
          loading={<EditorMessage>Starting the editor…</EditorMessage>}
        />
      ) : (
        <EditorMessage>
          {state === 'unavailable'
            ? 'The editor could not be loaded. Reload the page to try again.'
            : 'Loading the editor…'}
        </EditorMessage>
      )}
    </section>
  );
}

function EditorMessage({ children }: { children: ReactNode }) {
  return (
    <p className="flex h-full items-center justify-center px-6 text-center text-sm text-zinc-500">
      {children}
    </p>
  );
}
