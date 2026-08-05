import type { LanguageId, ProjectFileResource, UpdateProjectFileRequest } from '@devsync/shared';

/**
 * The difference between what the server is holding and what the user is editing.
 *
 * Keeping the two apart is what makes "unsaved changes" a fact rather than a
 * guess, and it is why nothing here writes to the server: a draft is browser
 * state until someone presses Save.
 */

export interface FileDraft {
  name: string;
  language: LanguageId;
  content: string;
}

/** The editable half of a persisted file, copied out so the original stays the snapshot. */
export function toDraft(file: ProjectFileResource): FileDraft {
  return { name: file.name, language: file.language, content: file.content };
}

export function sameDraft(one: FileDraft, other: FileDraft): boolean {
  return (
    one.name === other.name && one.language === other.language && one.content === other.content
  );
}

/**
 * What a save should send: the properties that actually differ, and no others.
 *
 * `null` means nothing differs, which is a save that should not be made — the API
 * rejects a patch carrying no property, and asking it to write a file's own
 * values back would move its timestamp for no reason.
 *
 * Assigned rather than spread because `exactOptionalPropertyTypes` is on, and a
 * property explicitly set to `undefined` is a different thing from an absent one.
 */
export function changedFields(
  persisted: ProjectFileResource,
  draft: FileDraft,
): UpdateProjectFileRequest | null {
  const changes: UpdateProjectFileRequest = {};

  if (draft.name !== persisted.name) {
    changes.name = draft.name;
  }
  if (draft.language !== persisted.language) {
    changes.language = draft.language;
  }
  // Compared, never tested for emptiness: a file the user cleared is a real
  // change, and `''` is content like any other.
  if (draft.content !== persisted.content) {
    changes.content = draft.content;
  }

  return Object.keys(changes).length === 0 ? null : changes;
}
