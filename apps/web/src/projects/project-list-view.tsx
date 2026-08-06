'use client';

import type { ProjectDetailResource, ProjectResource } from '@devsync/shared';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { errorMessage, hasErrorCode, isAbortError, listProjects } from '@/api';
import { ERROR_TEXT_CLASS, MUTED_TEXT_CLASS, SECONDARY_BUTTON_CLASS } from '@/styles/controls';
import { CreateProjectForm } from './create-project-form';
import { ProjectListItem } from './project-list-item';

type ListStatus = 'loading' | 'ready' | 'failed';

/**
 * Every project, most recently changed first.
 *
 * The order is the API's — it moves a project to the front when a file in it is
 * edited — so nothing here re-sorts. A rename does move a project's `updatedAt`,
 * and the row stays where it was until the list is loaded again; re-sorting in
 * the browser would be a second implementation of a rule the server already owns.
 */
export function ProjectListView() {
  const router = useRouter();
  const [status, setStatus] = useState<ListStatus>('loading');
  const [projects, setProjects] = useState<readonly ProjectResource[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);

  // Nothing sets state synchronously here: `loading` is where this component
  // starts, and where "Try again" puts it back before it raises the attempt.
  useEffect(() => {
    const controller = new AbortController();
    let current = true;

    listProjects({ signal: controller.signal })
      .then((loaded) => {
        if (!current) return;

        setProjects(loaded);
        setStatus('ready');
      })
      .catch((failure: unknown) => {
        if (!current || isAbortError(failure)) return;

        setError(failure);
        setStatus('failed');
      });

    return () => {
      current = false;
      controller.abort();
    };
  }, [attempt]);

  function handleCreated(project: ProjectDetailResource) {
    // Straight into the new project: it already holds the `main.ts` the API
    // created it with, so there is something to edit the moment it opens.
    router.push(`/projects/${project.id}`);
  }

  function handleRenamed(project: ProjectResource) {
    setProjects((current) =>
      current.map((existing) => (existing.id === project.id ? project : existing)),
    );
  }

  function handleRemoved(projectId: string) {
    setProjects((current) => current.filter((project) => project.id !== projectId));
  }

  function retry() {
    setStatus('loading');
    setAttempt((value) => value + 1);
  }

  return (
    <section aria-label="Projects" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold tracking-tight">Projects</h2>
        <CreateProjectForm onCreated={handleCreated} />
      </div>

      {status === 'loading' && <p className={MUTED_TEXT_CLASS}>Loading your projects…</p>}

      {status === 'failed' && (
        <div className="flex flex-col items-start gap-2">
          <p className={ERROR_TEXT_CLASS}>
            {hasErrorCode(error, 'API_UNAVAILABLE')
              ? 'DevSync could not reach its API, so your projects could not be loaded.'
              : errorMessage(error)}
          </p>
          <button type="button" className={SECONDARY_BUTTON_CLASS} onClick={retry}>
            Try again
          </button>
        </div>
      )}

      {status === 'ready' &&
        (projects.length === 0 ? (
          <p className={MUTED_TEXT_CLASS}>
            No projects yet. Name one above and DevSync will create it with a `main.ts` to edit.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {projects.map((project) => (
              <ProjectListItem
                key={project.id}
                project={project}
                onRenamed={handleRenamed}
                onRemoved={handleRemoved}
              />
            ))}
          </ul>
        ))}
    </section>
  );
}
