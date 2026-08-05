'use client';

import type { LanguageId, ProjectFileResource } from '@devsync/shared';
import type { ChangeEvent, FormEvent } from 'react';
import { useState } from 'react';
import { createProjectFile, errorMessage, hasErrorCode, issueMessageFor } from '@/api';
import { DEFAULT_LANGUAGE_ID, LANGUAGE_OPTIONS, toLanguageId } from '@/editor/languages';
import {
  ERROR_TEXT_CLASS,
  FIELD_CLASS,
  LABEL_CLASS,
  SECONDARY_BUTTON_CLASS,
} from '@/styles/controls';

export interface CreateFileFormProps {
  projectId: string;
  onCreated: (file: ProjectFileResource) => void;
  /**
   * Asked before the request, because a new file becomes the open one and the
   * current draft would go with it. Returns false when the user chose to stay.
   */
  confirmDiscardingDraft: () => boolean;
  onProjectMissing: () => void;
}

/**
 * Creating a file: a name, a language, and nothing else.
 *
 * Content is deliberately not collected. A new file is empty — that is the rule
 * the API's default already states — and a starter-content box would be a second
 * way to write a file that the editor below already does better.
 */
export function CreateFileForm({
  projectId,
  onCreated,
  confirmDiscardingDraft,
  onProjectMissing,
}: CreateFileFormProps) {
  const [name, setName] = useState('');
  const [language, setLanguage] = useState<LanguageId>(DEFAULT_LANGUAGE_ID);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<unknown>(null);

  function handleLanguageChange(event: ChangeEvent<HTMLSelectElement>) {
    const selected = toLanguageId(event.target.value);

    if (selected !== undefined) {
      setLanguage(selected);
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (creating || !confirmDiscardingDraft()) return;

    setCreating(true);
    setError(null);

    try {
      // `content: ''` is stated rather than omitted: an empty file is what a new
      // file is, and saying so keeps the request identical to what the contract
      // would have defaulted it to.
      const file = await createProjectFile(projectId, { name, language, content: '' });

      setName('');
      onCreated(file);
    } catch (failure) {
      if (hasErrorCode(failure, 'PROJECT_NOT_FOUND')) {
        onProjectMissing();
        return;
      }

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
      <div className="flex flex-col gap-1">
        <label htmlFor="new-file-name" className={LABEL_CLASS}>
          New file name
        </label>
        <input
          id="new-file-name"
          name="name"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
          }}
          className={FIELD_CLASS}
          placeholder="utils.ts"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={nameIssue !== undefined}
          aria-describedby={nameIssue === undefined ? undefined : 'new-file-name-issue'}
        />
        {nameIssue !== undefined && (
          <p id="new-file-name-issue" className={ERROR_TEXT_CLASS}>
            {nameIssue}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="new-file-language" className={LABEL_CLASS}>
          New file language
        </label>
        <select
          id="new-file-language"
          name="language"
          value={language}
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

      <button type="submit" className={SECONDARY_BUTTON_CLASS} disabled={creating}>
        {creating ? 'Adding…' : 'Add file'}
      </button>

      {error !== null && nameIssue === undefined && (
        <p className={ERROR_TEXT_CLASS}>{errorMessage(error)}</p>
      )}
    </form>
  );
}
