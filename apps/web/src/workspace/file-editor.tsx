'use client';

import type { ProjectFileResource, ProjectFileSummaryResource } from '@devsync/shared';
import type { ChangeEvent, FormEvent } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  deleteProjectFile,
  errorMessage,
  getProjectFile,
  hasErrorCode,
  isAbortError,
  issueMessageFor,
  updateProjectFile,
} from '@/api';
import { CodeEditor } from '@/editor/code-editor';
import { LANGUAGE_OPTIONS, toLanguageId } from '@/editor/languages';
import {
  DANGER_BUTTON_CLASS,
  ERROR_TEXT_CLASS,
  FIELD_CLASS,
  LABEL_CLASS,
  MUTED_TEXT_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
} from '@/styles/controls';
import type { FileDraft } from './file-draft';
import { changedFields, sameDraft, toDraft } from './file-draft';
import { SaveStatus } from './save-status';
import type { SaveState } from './save-status';

/** Which resource a request said was gone, so the workspace can reconcile the right thing. */
export type MissingResource = 'FILE_NOT_FOUND' | 'PROJECT_NOT_FOUND';

/**
 * A failure that means the browser is holding something the server no longer has.
 * Anything else is a failure to report and retry, not stale state to reconcile.
 *
 * **Every request this component makes runs its failure through this**, and each
 * of them can produce either code: a save can find the file deleted from another
 * tab, and a delete can find the whole project gone. Reconciling only the one
 * each path "expects" would leave the other showing a retry for something that
 * will never come back.
 */
function missingResourceOf(error: unknown): MissingResource | null {
  if (hasErrorCode(error, 'FILE_NOT_FOUND')) return 'FILE_NOT_FOUND';
  if (hasErrorCode(error, 'PROJECT_NOT_FOUND')) return 'PROJECT_NOT_FOUND';

  return null;
}

export interface FileEditorProps {
  projectId: string;
  fileId: string;
  /** The server's answer after a successful save, so the file list shows the new name. */
  onSaved: (file: ProjectFileSummaryResource) => void;
  onDeleted: (fileId: string) => void;
  /** The file is named so the handler can stay stable, and so it cannot forget the wrong one. */
  onResourceMissing: (resource: MissingResource, fileId: string) => void;
  onDirtyChange: (dirty: boolean) => void;
}

type LoadStatus = 'loading' | 'ready' | 'failed';

/**
 * The write this component currently has in flight.
 *
 * One value rather than a boolean each, because saving and deleting the same file
 * are **mutually exclusive** rather than independent: a delete that lands while a
 * save is in flight makes the save's answer meaningless, and a save that lands
 * while a delete is in flight writes to a row that is about to disappear. One
 * state makes that impossible to express, and makes returning to `idle` a single
 * unconditional step — which is what stops a pending indicator from sticking.
 */
type Mutation = 'idle' | 'saving' | 'deleting';

/** Which write produced the failure on screen, so a failed delete is not called a failed save. */
interface MutationFailure {
  kind: 'save' | 'delete';
  error: unknown;
}

/**
 * One open file: what the server is holding, what the user has typed, and the one
 * action that turns the second into the first.
 *
 * **The workspace mounts this with `key={fileId}`**, so selecting another file
 * replaces the component rather than reusing it. That is what makes a draft
 * belong to exactly one file — there is no state left over to leak into the next
 * one — and the load below aborts on unmount, so a slow response for a file the
 * user has left cannot be rendered inside the file they moved to. The request
 * token guards the remaining case, where the component stays mounted and a reload
 * overtakes a write.
 */
export function FileEditor({
  projectId,
  fileId,
  onSaved,
  onDeleted,
  onResourceMissing,
  onDirtyChange,
}: FileEditorProps) {
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [loadError, setLoadError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const [persisted, setPersisted] = useState<ProjectFileResource | null>(null);
  const [draft, setDraft] = useState<FileDraft | null>(null);
  const [mutation, setMutation] = useState<Mutation>('idle');
  const [failure, setFailure] = useState<MutationFailure | null>(null);

  // Incremented by every request this component starts. A response whose stamp is
  // no longer the current one belongs to a request something newer has replaced,
  // and is dropped rather than allowed to overwrite what has happened since.
  // Writes cannot overtake each other — see `Mutation` — so what this actually
  // guards is a reload landing on top of a write.
  const requestToken = useRef(0);

  // Runs on mount and on each retry. Nothing sets state synchronously in here:
  // `loading` is where this component starts, and where `retryLoad` puts it back.
  useEffect(() => {
    const controller = new AbortController();
    const token = ++requestToken.current;

    getProjectFile(projectId, fileId, { signal: controller.signal })
      .then((file) => {
        if (token !== requestToken.current) return;

        setPersisted(file);
        setDraft(toDraft(file));
        setStatus('ready');
      })
      .catch((error: unknown) => {
        if (token !== requestToken.current || isAbortError(error)) return;

        const missing = missingResourceOf(error);

        if (missing !== null) {
          onResourceMissing(missing, fileId);
          return;
        }

        setLoadError(error);
        setStatus('failed');
      });

    return () => {
      controller.abort();
    };
  }, [projectId, fileId, onResourceMissing, attempt]);

  const dirty = persisted !== null && draft !== null && !sameDraft(toDraft(persisted), draft);

  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);

  // The browser's own warning, for the ways out of a page the application does not
  // control: the tab close, the address bar, the back button. Registered only
  // while there is something to lose, so an idle tab never asks.
  useEffect(() => {
    if (!dirty) return;

    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };

    window.addEventListener('beforeunload', warn);

    return () => {
      window.removeEventListener('beforeunload', warn);
    };
  }, [dirty]);

  // Memoised: `@monaco-editor/react` disposes and re-registers its content
  // listener whenever this identity changes, which would otherwise happen on
  // every keystroke.
  const handleContentChange = useCallback((content: string) => {
    setDraft((current) => (current === null ? current : { ...current, content }));
  }, []);

  function handleNameChange(event: ChangeEvent<HTMLInputElement>) {
    const { value } = event.target;

    setDraft((current) => (current === null ? current : { ...current, name: value }));
  }

  function handleLanguageChange(event: ChangeEvent<HTMLSelectElement>) {
    const language = toLanguageId(event.target.value);

    // A value the markup never offered is ignored rather than stored, which is
    // what keeps the draft narrowly typed without a cast. Changing the language
    // touches neither the name nor the content: they are independent properties
    // of a stored file.
    if (language !== undefined) {
      setDraft((current) => (current === null ? current : { ...current, language }));
    }
  }

  /**
   * Another attempt at the same file. The workspace's selection is untouched, so
   * the file stays open and stays in the list — a failure to load is a failure of
   * one request, not evidence that the file is gone. The effect above creates a
   * fresh `AbortController` and stamps a new token, which is what abandons the
   * request that failed.
   */
  function retryLoad() {
    setStatus('loading');
    setLoadError(null);
    setAttempt((value) => value + 1);
  }

  async function handleSave(event: FormEvent) {
    event.preventDefault();

    // `mutation !== 'idle'` rather than a check for saving alone: pressing Enter
    // in the name field submits this form, so the guard has to hold even when the
    // disabled button below cannot be clicked.
    if (persisted === null || draft === null || mutation !== 'idle') return;

    const changes = changedFields(persisted, draft);

    if (changes === null) return;

    const requested = draft;
    const token = ++requestToken.current;

    setMutation('saving');
    setFailure(null);

    try {
      const saved = await updateProjectFile(projectId, fileId, changes);

      if (token !== requestToken.current) return;

      setPersisted(saved);
      // Adopted as the draft only if nothing was typed while the request was in
      // flight. The server trims a name, so this is also what stops a trailing
      // space from leaving the file permanently "unsaved" — and what stops a
      // keystroke made during the save from being thrown away.
      setDraft((current) =>
        current !== null && sameDraft(current, requested) ? toDraft(saved) : current,
      );
      onSaved(saved);
    } catch (error) {
      if (token !== requestToken.current) return;

      const missing = missingResourceOf(error);

      // The file deleted elsewhere, or the whole project gone. Either way the
      // browser is holding something the server does not have, and a retry would
      // never succeed — so this reconciles rather than offering one.
      if (missing !== null) {
        onResourceMissing(missing, fileId);
        return;
      }

      // The draft is deliberately untouched. A failed save is a reason to try
      // again, not a reason to lose what the user wrote.
      setFailure({ kind: 'save', error });
    } finally {
      // Unconditional, and outside every early return above. Only one write can
      // be in flight, so there is no later one whose state this could clobber —
      // and a controls-disabling flag that depends on a condition to be cleared is
      // exactly how one gets stuck.
      setMutation('idle');
    }
  }

  async function handleDelete() {
    // The button below is already disabled while either write is in flight, and
    // there is no keyboard path to this the way `submit` is one for saving — so
    // this is the same rule stated twice on purpose, and it is checked **before**
    // the confirmation, so a user is never asked a question whose answer would be
    // ignored.
    if (persisted === null || mutation !== 'idle') return;

    const question = dirty
      ? `Delete "${persisted.name}"? It has unsaved changes, and deleting it is permanent.`
      : `Delete "${persisted.name}"? This cannot be undone.`;

    if (!window.confirm(question)) return;

    const token = ++requestToken.current;

    setMutation('deleting');
    setFailure(null);

    try {
      await deleteProjectFile(projectId, fileId);
      onDeleted(fileId);
    } catch (error) {
      if (token !== requestToken.current) return;

      const missing = missingResourceOf(error);

      // A file that is already gone is the outcome that was asked for, and a
      // project that is gone took this file with it. Both are reconciled by the
      // workspace rather than shown as something to try again.
      if (missing !== null) {
        onResourceMissing(missing, fileId);
        return;
      }

      setFailure({ kind: 'delete', error });
    } finally {
      setMutation('idle');
    }
  }

  if (status === 'loading') {
    return <p className={MUTED_TEXT_CLASS}>Loading the file…</p>;
  }

  if (status === 'failed' || persisted === null || draft === null) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className={ERROR_TEXT_CLASS}>{errorMessage(loadError)}</p>
        <button type="button" className={SECONDARY_BUTTON_CLASS} onClick={retryLoad}>
          Try again
        </button>
      </div>
    );
  }

  const busy = mutation !== 'idle';
  const nameIssue = issueMessageFor(failure?.error, 'name');
  const saveState: SaveState =
    mutation === 'saving'
      ? 'saving'
      : failure?.kind === 'save'
        ? 'failed'
        : dirty
          ? 'unsaved'
          : 'saved';

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3">
      <form
        onSubmit={(event) => {
          void handleSave(event);
        }}
        className="flex flex-wrap items-end gap-x-4 gap-y-3"
      >
        <div className="flex min-w-48 flex-1 flex-col gap-1">
          <label htmlFor="file-name" className={LABEL_CLASS}>
            File name
          </label>
          <input
            id="file-name"
            name="name"
            value={draft.name}
            onChange={handleNameChange}
            className={FIELD_CLASS}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={nameIssue !== undefined}
            aria-describedby={nameIssue === undefined ? undefined : 'file-name-issue'}
          />
          {nameIssue !== undefined && (
            <p id="file-name-issue" className={ERROR_TEXT_CLASS}>
              {nameIssue}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="file-language" className={LABEL_CLASS}>
            Language
          </label>
          <select
            id="file-language"
            name="language"
            value={draft.language}
            onChange={handleLanguageChange}
            className={FIELD_CLASS}
          >
            {LANGUAGE_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-3">
          <SaveStatus state={saveState} />
          {/* Both disabled while either write is in flight: they are two ways of
              changing the same file, and only one of them can be true. */}
          <button type="submit" className={PRIMARY_BUTTON_CLASS} disabled={!dirty || busy}>
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              void handleDelete();
            }}
            className={DANGER_BUTTON_CLASS}
            disabled={busy}
          >
            Delete file
          </button>
        </div>
      </form>

      {failure !== null && nameIssue === undefined && (
        <p className={ERROR_TEXT_CLASS}>{errorMessage(failure.error)}</p>
      )}

      <CodeEditor value={draft.content} language={draft.language} onChange={handleContentChange} />
    </div>
  );
}
