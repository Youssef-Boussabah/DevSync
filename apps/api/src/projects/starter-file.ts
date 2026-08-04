import type { NewProjectFile } from '@devsync/database';
import type { LanguageId } from '@devsync/shared';

/**
 * What a new project is created with.
 *
 * This is a product decision and it lives in the API. `@devsync/database` writes
 * both rows in one transaction and holds no opinion about what the first file is
 * called, what language it opens as, or what it says — a persistence layer with
 * one would have to be edited every time the product changed its mind.
 *
 * An empty project is a dead end: the first thing its creator sees is a view with
 * nothing to open. Creating the file client-side, as a second request, would
 * leave an empty project behind every time that request failed.
 */

const STARTER_LANGUAGE: LanguageId = 'typescript';

// The sample `apps/web` opens with today. Its comment stops being true for a
// project that persists; the client that says it is what C3 replaces, and this
// content follows whatever that milestone decides a new project should say.
const STARTER_CONTENT = `// This file lives in your browser's memory. Refreshing the page discards it.
export function greet(name: string): string {
  return \`Hello, \${name}!\`;
}

console.log(greet('DevSync'));
`;

export const STARTER_FILE: NewProjectFile = {
  name: 'main.ts',
  language: STARTER_LANGUAGE,
  content: STARTER_CONTENT,
};
