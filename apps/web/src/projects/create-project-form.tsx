'use client';

import type { ProjectDetailResource } from '@devsync/shared';
import type { FormEvent } from 'react';
import { useState } from 'react';
import { createProject, errorMessage, issueMessageFor } from '@/api';
import {
  ERROR_TEXT_CLASS,
  FIELD_CLASS,
  LABEL_CLASS,
  PRIMARY_BUTTON_CLASS,
} from '@/styles/controls';

export interface CreateProjectFormProps {
  /** Handed the project the API answered with, `main.ts` included. */
  onCreated: (project: ProjectDetailResource) => void;
}

/**
 * Creating a project: a name, and nothing else to decide.
 *
 * The API creates the project and its first file in one transaction, so there is
 * no second request to make here and no half-created project to recover from.
 */
export function CreateProjectForm({ onCreated }: CreateProjectFormProps) {
  const [name, setName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    // A second submit while the first is in flight would create two projects with
    // one name and open only one of them.
    if (creating) return;

    setCreating(true);
    setError(null);

    try {
      onCreated(await createProject({ name }));
      setName('');
    } catch (failure) {
      setError(failure);
    } finally {
      setCreating(false);
    }
  }

  const nameIssue = issueMessageFor(error, 'name');

  return (
    <form
      onSubmit={(event) => {
        void handleSubmit(event);
      }}
      className="flex flex-col gap-2"
    >
      <label htmlFor="project-name" className={LABEL_CLASS}>
        New project name
      </label>
      <div className="flex flex-wrap items-start gap-2">
        <input
          id="project-name"
          name="name"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
          }}
          className={`${FIELD_CLASS} w-64`}
          placeholder="My project"
          autoComplete="off"
          aria-invalid={nameIssue !== undefined}
          aria-describedby={nameIssue === undefined ? undefined : 'project-name-issue'}
        />
        <button type="submit" className={PRIMARY_BUTTON_CLASS} disabled={creating}>
          {creating ? 'Creating…' : 'Create project'}
        </button>
      </div>

      {nameIssue !== undefined && (
        <p id="project-name-issue" className={ERROR_TEXT_CLASS}>
          {nameIssue}
        </p>
      )}
      {error !== null && nameIssue === undefined && (
        <p className={ERROR_TEXT_CLASS}>{errorMessage(error)}</p>
      )}
    </form>
  );
}
