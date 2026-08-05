'use client';

import type { OnChange } from '@monaco-editor/react';
import Editor, { loader } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';

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

export type CodeEditorProps = {
  value: string;
  language: string;
  onChange: (value: string) => void;
};

// Monaco runs its language services in web workers and asks this global for them.
// It declares its own worker entry points too, but they sit inside `monaco-editor`,
// where Turbopack copies them out as static files instead of compiling them and the
// workers then fail on their first import. Pointing at entry points in application
// source is what makes Turbopack build them properly; the file extensions are part
// of that, because it only recognises a worker from a fully resolved specifier.
//
// A language whose service has a worker of its own needs a branch here: the
// fallback is the editor's own worker, which answers the generic requests every
// language makes and none of the language-specific ones. The languages without a
// branch — Python and Markdown — are tokenised in the main thread and ask for no
// worker of their own.
function registerMonacoWorkers() {
  globalThis.MonacoEnvironment = {
    getWorker(_workerId, label) {
      if (label === 'typescript' || label === 'javascript') {
        return new Worker(new URL('./workers/typescript.worker.ts', import.meta.url));
      }

      if (label === 'json') {
        return new Worker(new URL('./workers/json.worker.ts', import.meta.url));
      }

      return new Worker(new URL('./workers/editor.worker.ts', import.meta.url));
    },
  };
}

/**
 * The single editor pane the application currently has. The content belongs to
 * the caller rather than to Monaco's own model, so the application can read and
 * set what is being edited — which is what makes an explicit save possible at
 * all: the workspace above knows what the user has typed without asking Monaco.
 *
 * This component still stores nothing and sends nothing. It displays what it is
 * given and reports edits back; whether an edit reaches the database is the
 * caller's decision, and in C3 that decision is the Save button.
 */
export function CodeEditor({ value, language, onChange }: CodeEditorProps) {
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

  // Monaco reports `undefined` when it has no content to hand over — while a model
  // is being replaced, for instance. An empty file is a legitimate value and is
  // passed straight through; `undefined` is not one, so it is dropped rather than
  // allowed to overwrite what the caller is holding.
  //
  // Memoised because `@monaco-editor/react` disposes and re-registers its content
  // listener whenever this identity changes, which would otherwise happen on every
  // keystroke.
  const handleChange = useCallback<OnChange>(
    (nextValue) => {
      if (nextValue !== undefined) {
        onChange(nextValue);
      }
    },
    [onChange],
  );

  return (
    <section
      aria-label="Code editor"
      className="h-[70vh] min-h-96 overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800"
    >
      {state === 'ready' ? (
        <Editor
          language={language}
          value={value}
          onChange={handleChange}
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
