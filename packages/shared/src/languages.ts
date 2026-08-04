import { z } from 'zod';

/**
 * The languages a DevSync file can be stored as.
 *
 * One list, one validator, and nothing else. The label a user reads and the file
 * name a client shows are presentation: they belong to whichever interface is
 * doing the showing, and putting them here would make this package a thing the
 * browser has to be consulted about.
 *
 * Adding a sixth language is a change to this array. It is deliberately not a
 * database enum, so it never becomes a migration and a deployment ordering
 * problem.
 */
export const SUPPORTED_LANGUAGE_IDS = [
  'typescript',
  'javascript',
  'python',
  'json',
  'markdown',
] as const;

/**
 * Exact, case-sensitive, and non-coercing: `TypeScript` is not `typescript`, and
 * nothing is inferred from a file name or from the contents of a file.
 */
export const languageIdSchema = z.enum(SUPPORTED_LANGUAGE_IDS);

export type LanguageId = z.infer<typeof languageIdSchema>;
