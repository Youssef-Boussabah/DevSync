'use client';

import type { ProjectResource } from '@devsync/shared';
import type { FormEvent } from 'react';
import { useState } from 'react';
import { deleteProject, errorMessage, hasErrorCode, issueMessageFor, renameProject } from '@/api';
import {
  DANGER_BUTTON_CLASS,
  ERROR_TEXT_CLASS,
  FIELD_CLASS,
  PRIMARY_BUTTON_CLASS,
  SECONDARY_BUTTON_CLASS,
} from '@/styles/controls';

export interface ProjectHeaderProps {
  project: ProjectResource;
  onRenamed: (project: ProjectResource) => void;
  onDeleted: () => void;
  onProjectMissing: () => void;
  onLeave: () => void;
  /** Asked before anything that would abandon an unsaved file. False means stay. */
  confirmDiscardingDraft: () => boolean;
}

/**
 * The project's name and the two things that can be done to the project itself.
 *
 * Both actions live here rather than in the sidebar because both are about the
 * project rather than about a file, and putting them beside the name is what
 * makes it obvious which project is being renamed or deleted.
 */
export function ProjectHeader({
  project,
  onRenamed,
  onDeleted,
  onProjectMissing,
  onLeave,
  confirmDiscardingDraft,
}: ProjectHeaderProps) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(project.name);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  function startRenaming() {
    setName(project.name);
    setError(null);
    setRenaming(true);
  }

  async function handleRename(event: FormEvent) {
    event.preventDefault();

    if (pending) return;

    setPending(true);
    setError(null);

    try {
      // The heading changes only once the server has answered — an optimistic
      // rename would be the interface claiming a write that may not have landed.
      onRenamed(await renameProject(project.id, { name }));
      setRenaming(false);
    } catch (failure) {
      if (hasErrorCode(failure, 'PROJECT_NOT_FOUND')) {
        onProjectMissing();
        return;
      }

      setError(failure);
    } finally {
      setPending(false);
    }
  }

  async function handleDelete() {
    if (pending || !confirmDiscardingDraft()) return;

    if (
      !window.confirm(
        `Delete "${project.name}" and every file in it? This is permanent and cannot be undone.`,
      )
    ) {
      return;
    }

    setPending(true);
    setError(null);

    try {
      await deleteProject(project.id);
      onDeleted();
    } catch (failure) {
      // Already gone is the outcome that was asked for, so it is treated as one.
      if (hasErrorCode(failure, 'PROJECT_NOT_FOUND')) {
        onDeleted();
        return;
      }

      setError(failure);
      setPending(false);
    }
  }

  const nameIssue = issueMessageFor(error, 'name');

  return (
    <header className="flex flex-col gap-2 border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <div className="flex min-w-0 flex-col gap-1">
          <button
            type="button"
            onClick={onLeave}
            className="self-start text-sm text-zinc-500 underline underline-offset-2 hover:text-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500 dark:hover:text-zinc-200"
          >
            ← All projects
          </button>

          {renaming ? (
            <form
              onSubmit={(event) => {
                void handleRename(event);
              }}
              className="flex flex-wrap items-center gap-2"
            >
              <label htmlFor="project-name" className="sr-only">
                Project name
              </label>
              <input
                id="project-name"
                name="name"
                value={name}
                onChange={(event) => {
                  setName(event.target.value);
                }}
                className={`${FIELD_CLASS} w-64`}
                autoComplete="off"
                aria-invalid={nameIssue !== undefined}
              />
              <button type="submit" className={PRIMARY_BUTTON_CLASS} disabled={pending}>
                {pending ? 'Saving…' : 'Save name'}
              </button>
              <button
                type="button"
                className={SECONDARY_BUTTON_CLASS}
                onClick={() => {
                  setRenaming(false);
                }}
                disabled={pending}
              >
                Cancel
              </button>
            </form>
          ) : (
            <h1 className="truncate text-2xl font-semibold tracking-tight">{project.name}</h1>
          )}
        </div>

        {!renaming && (
          <div className="flex items-center gap-2">
            <button type="button" className={SECONDARY_BUTTON_CLASS} onClick={startRenaming}>
              Rename project
            </button>
            <button
              type="button"
              className={DANGER_BUTTON_CLASS}
              onClick={() => {
                void handleDelete();
              }}
              disabled={pending}
            >
              Delete project
            </button>
          </div>
        )}
      </div>

      {error !== null && <p className={ERROR_TEXT_CLASS}>{nameIssue ?? errorMessage(error)}</p>}
    </header>
  );
}
