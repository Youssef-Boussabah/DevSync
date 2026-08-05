'use client';

import type { ProjectFileSummaryResource } from '@devsync/shared';
import { languageLabel } from '@/editor/languages';
import { MUTED_TEXT_CLASS } from '@/styles/controls';

export interface FileListProps {
  files: readonly ProjectFileSummaryResource[];
  activeFileId: string | null;
  onSelect: (fileId: string) => void;
}

/**
 * The files in the project, and which one is open.
 *
 * A list with one selected entry rather than a tab strip: a tab bar is a second
 * place a file's name appears and a second thing to keep in step with a rename,
 * and nothing in Phase C opens two files at once. There is no tree either —
 * Phase C names are flat, with no folder to nest one under.
 */
export function FileList({ files, activeFileId, onSelect }: FileListProps) {
  if (files.length === 0) {
    return <p className={MUTED_TEXT_CLASS}>No files yet.</p>;
  }

  return (
    <ul className="flex flex-col gap-1">
      {files.map((file) => {
        const active = file.id === activeFileId;

        return (
          <li key={file.id}>
            <button
              type="button"
              onClick={() => {
                onSelect(file.id);
              }}
              // Announced as the current item rather than only coloured, so the
              // selection is available to a screen reader too.
              aria-current={active ? 'true' : undefined}
              className={`flex w-full flex-col rounded-md px-2 py-1.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500 ${
                active ? 'bg-zinc-200 dark:bg-zinc-800' : 'hover:bg-zinc-100 dark:hover:bg-zinc-900'
              }`}
            >
              <span className="truncate font-mono text-sm text-zinc-900 dark:text-zinc-100">
                {file.name}
              </span>
              <span className="text-xs text-zinc-500">{languageLabel(file.language)}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
