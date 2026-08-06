'use client';

import type { ProjectResource } from '@devsync/shared';
import Link from 'next/link';
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
import { Timestamp } from './timestamp';

export interface ProjectListItemProps {
  project: ProjectResource;
  onRenamed: (project: ProjectResource) => void;
  /** Also called when the project turns out to be gone already, so the list reconciles. */
  onRemoved: (projectId: string) => void;
}

/**
 * One project in the list, with its own request state.
 *
 * Renaming and deleting are owned here rather than by the list, so two rows are
 * never sharing one spinner or one error message — and so a failure is shown
 * beside the row it happened to.
 *
 * The identifier is never displayed. It is a UUID the persistence layer chose;
 * the name is what a person recognises the project by.
 */
export function ProjectListItem({ project, onRenamed, onRemoved }: ProjectListItemProps) {
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
      // Displayed only after the server has answered, and displayed as what the
      // server answered with — the API trims a name, so what it returns is what is
      // stored.
      onRenamed(await renameProject(project.id, { name }));
      setRenaming(false);
    } catch (failure) {
      if (hasErrorCode(failure, 'PROJECT_NOT_FOUND')) {
        onRemoved(project.id);
        return;
      }

      setError(failure);
    } finally {
      setPending(false);
    }
  }

  async function handleDelete() {
    if (pending) return;

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
      onRemoved(project.id);
    } catch (failure) {
      if (hasErrorCode(failure, 'PROJECT_NOT_FOUND')) {
        onRemoved(project.id);
        return;
      }

      setError(failure);
      setPending(false);
    }
  }

  const nameIssue = issueMessageFor(error, 'name');

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-zinc-200 px-4 py-3 dark:border-zinc-800">
      {renaming ? (
        <form
          onSubmit={(event) => {
            void handleRename(event);
          }}
          className="flex flex-wrap items-center gap-2"
        >
          <label htmlFor={`rename-${project.id}`} className="sr-only">
            New name for {project.name}
          </label>
          <input
            id={`rename-${project.id}`}
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
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <div className="flex min-w-0 flex-col">
            <h3 className="truncate text-base font-medium">{project.name}</h3>
            <p className="text-sm text-zinc-500">
              Updated <Timestamp value={project.updatedAt} />
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/projects/${project.id}`}
              aria-label={`Open ${project.name}`}
              className={PRIMARY_BUTTON_CLASS}
            >
              Open
            </Link>
            <button
              type="button"
              className={SECONDARY_BUTTON_CLASS}
              aria-label={`Rename ${project.name}`}
              onClick={startRenaming}
            >
              Rename
            </button>
            <button
              type="button"
              className={DANGER_BUTTON_CLASS}
              aria-label={`Delete ${project.name}`}
              onClick={() => {
                void handleDelete();
              }}
              disabled={pending}
            >
              Delete
            </button>
          </div>
        </div>
      )}

      {error !== null && <p className={ERROR_TEXT_CLASS}>{nameIssue ?? errorMessage(error)}</p>}
    </li>
  );
}
