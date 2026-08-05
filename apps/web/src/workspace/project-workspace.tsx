'use client';

import type {
  ProjectFileResource,
  ProjectFileSummaryResource,
  ProjectResource,
} from '@devsync/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useState } from 'react';
import { errorMessage, getProject, hasErrorCode, isAbortError } from '@/api';
import { ERROR_TEXT_CLASS, MUTED_TEXT_CLASS, SECONDARY_BUTTON_CLASS } from '@/styles/controls';
import { CreateFileForm } from './create-file-form';
import { FileEditor } from './file-editor';
import type { MissingResource } from './file-editor';
import { FileList } from './file-list';
import { ProjectHeader } from './project-header';

type ProjectStatus = 'loading' | 'ready' | 'missing' | 'failed';

/**
 * The project's files and which one is open, held together.
 *
 * One piece of state rather than two, because every change touches both: removing
 * a file has to choose the next one, and creating a file has to open it. Kept
 * apart, each of those would be a pair of updates with a render in between where
 * the selected file is not in the list.
 */
interface OpenFiles {
  files: readonly ProjectFileSummaryResource[];
  activeFileId: string | null;
}

const NO_FILES: OpenFiles = { files: [], activeFileId: null };

/**
 * One project, open.
 *
 * This component owns everything the sidebar and the editor share: the project,
 * its file summaries, and which file is active. What is being typed is owned one
 * level down, by `FileEditor`, because a draft belongs to exactly one file and
 * nothing up here has any business reading it — only whether there is one, which
 * is what the unsaved guards below need.
 *
 * There is no store and no context. Two levels of props carry the data, and both
 * levels render it, so a provider would add indirection without removing a prop.
 */
export function ProjectWorkspace({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<ProjectStatus>('loading');
  const [loadError, setLoadError] = useState<unknown>(null);
  const [project, setProject] = useState<ProjectResource | null>(null);
  const [open, setOpen] = useState<OpenFiles>(NO_FILES);
  const [dirty, setDirty] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // The page mounts this with `key={projectId}`, so this runs once per project
  // and once per retry. Nothing sets state synchronously in here: the loading
  // state is where this component starts, and where "Try again" puts it back.
  useEffect(() => {
    const controller = new AbortController();
    let current = true;

    getProject(projectId, { signal: controller.signal })
      .then(({ files, ...detail }) => {
        if (!current) return;

        setProject(detail);
        // The first file, because a project that opens on nothing makes its
        // creator find the one thing it contains before they can start.
        setOpen({ files, activeFileId: files[0]?.id ?? null });
        setStatus('ready');
      })
      .catch((error: unknown) => {
        if (!current || isAbortError(error)) return;

        if (hasErrorCode(error, 'PROJECT_NOT_FOUND')) {
          setStatus('missing');
          return;
        }

        setLoadError(error);
        setStatus('failed');
      });

    return () => {
      current = false;
      controller.abort();
    };
  }, [projectId, attempt]);

  /**
   * The one question asked before anything that would abandon a draft. It is a
   * native confirmation on purpose: a modal component would be a dependency and a
   * focus trap to maintain for a question the platform already asks well.
   */
  const confirmDiscardingDraft = useCallback(
    () =>
      !dirty || window.confirm('This file has unsaved changes. Leave them unsaved and continue?'),
    [dirty],
  );

  const handleFileSaved = useCallback((saved: ProjectFileSummaryResource) => {
    setOpen((current) => ({
      ...current,
      files: current.files.map((file) => (file.id === saved.id ? toSummary(saved) : file)),
    }));
  }, []);

  /**
   * A file that is gone: deleted here, or found missing by a request. The next
   * file is the one that took its place, or the last one if it was at the end; a
   * project with none left shows the empty state rather than a blank editor.
   */
  const forgetFile = useCallback((fileId: string) => {
    setOpen(({ files, activeFileId }) => {
      const removedAt = files.findIndex((file) => file.id === fileId);
      const remaining = files.filter((file) => file.id !== fileId);

      if (activeFileId !== fileId) {
        return { files: remaining, activeFileId };
      }

      const nextIndex = Math.min(Math.max(removedAt, 0), remaining.length - 1);

      return { files: remaining, activeFileId: remaining[nextIndex]?.id ?? null };
    });

    setDirty(false);
  }, []);

  const handleResourceMissing = useCallback(
    (resource: MissingResource, fileId: string) => {
      if (resource === 'PROJECT_NOT_FOUND') {
        setStatus('missing');
        return;
      }

      // Deleted from somewhere else, or already gone. The list is what is stale,
      // so the list is what gets corrected.
      forgetFile(fileId);
    },
    [forgetFile],
  );

  function selectFile(fileId: string) {
    if (fileId === open.activeFileId || !confirmDiscardingDraft()) return;

    setOpen((current) => ({ ...current, activeFileId: fileId }));
    setDirty(false);
  }

  // The new file becomes the open one, and the editor loads it — one request for
  // a resource this already holds. That is deliberate: a file the editor was
  // handed rather than fetched would be a second way for it to acquire its
  // subject, and the round trip costs one empty file.
  function handleFileCreated(file: ProjectFileResource) {
    setOpen((current) => ({
      files: [...current.files, toSummary(file)],
      activeFileId: file.id,
    }));
    setDirty(false);
  }

  function leaveWorkspace() {
    if (!confirmDiscardingDraft()) return;

    router.push('/');
  }

  function retry() {
    setStatus('loading');
    setAttempt((value) => value + 1);
  }

  if (status === 'loading') {
    return <StatusPage>Loading the project…</StatusPage>;
  }

  if (status === 'missing') {
    return (
      <StatusPage>
        <span className="block text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          That project no longer exists.
        </span>
        <span className={MUTED_TEXT_CLASS}>
          It may have been deleted.{' '}
          <Link href="/" className="underline underline-offset-2">
            Back to your projects
          </Link>
          .
        </span>
      </StatusPage>
    );
  }

  if (status === 'failed' || project === null) {
    return (
      <StatusPage>
        <span className={ERROR_TEXT_CLASS}>{errorMessage(loadError)}</span>
        <button type="button" className={SECONDARY_BUTTON_CLASS} onClick={retry}>
          Try again
        </button>
      </StatusPage>
    );
  }

  return (
    <main className="flex flex-1 flex-col">
      <ProjectHeader
        project={project}
        onRenamed={setProject}
        onDeleted={() => {
          router.push('/');
        }}
        onProjectMissing={() => {
          setStatus('missing');
        }}
        onLeave={leaveWorkspace}
        confirmDiscardingDraft={confirmDiscardingDraft}
      />

      <div className="flex flex-1 flex-col gap-6 px-6 py-6 lg:flex-row">
        <aside className="flex shrink-0 flex-col gap-4 lg:w-64">
          <div className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold tracking-wide text-zinc-500 uppercase">Files</h2>
            <FileList files={open.files} activeFileId={open.activeFileId} onSelect={selectFile} />
          </div>

          <CreateFileForm
            projectId={projectId}
            onCreated={handleFileCreated}
            confirmDiscardingDraft={confirmDiscardingDraft}
            onProjectMissing={() => {
              setStatus('missing');
            }}
          />
        </aside>

        <section aria-label="Editor" className="flex min-w-0 flex-1 flex-col">
          {open.activeFileId === null ? (
            <p className={MUTED_TEXT_CLASS}>This project has no files. Add one to start editing.</p>
          ) : (
            // Keyed by the file, so selecting another one replaces this component
            // rather than reusing it: no draft, no save state, and no in-flight
            // response can carry across from the file that was open before.
            <FileEditor
              key={open.activeFileId}
              projectId={projectId}
              fileId={open.activeFileId}
              onSaved={handleFileSaved}
              onDeleted={forgetFile}
              onResourceMissing={handleResourceMissing}
              onDirtyChange={setDirty}
            />
          )}
        </section>
      </div>
    </main>
  );
}

/** A file summary, with the contents left behind: a list has no use for them. */
function toSummary(file: ProjectFileSummaryResource): ProjectFileSummaryResource {
  return {
    id: file.id,
    projectId: file.projectId,
    name: file.name,
    language: file.language,
    createdAt: file.createdAt,
    updatedAt: file.updatedAt,
  };
}

function StatusPage({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col items-start gap-3 px-6 py-12">
      {children}
    </main>
  );
}
