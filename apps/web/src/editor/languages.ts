import { SUPPORTED_LANGUAGE_IDS, languageIdSchema, parseContract } from '@devsync/shared';
import type { LanguageId } from '@devsync/shared';

/**
 * How the five stored languages are shown to a user.
 *
 * **The identifiers are not defined here.** `@devsync/shared` owns them, the API
 * validates every request against them, and this file only says what each one is
 * called on screen. That split is the whole point: a label is presentation and
 * belongs to whichever interface is doing the showing, while the value a file is
 * persisted as has to be the same string on both sides of the wire.
 *
 * Nothing here derives a file name. A file has a stored name of its own from C3 —
 * renaming it does not change its language, and changing its language does not
 * rename it.
 */

interface LanguagePresentation {
  label: string;
}

// `satisfies` rather than a type annotation, so a language added to the shared
// list without a label here is a type error naming the missing one — and so the
// object keeps its exact keys instead of widening to `Record<LanguageId, …>`.
const LANGUAGE_METADATA = {
  typescript: { label: 'TypeScript' },
  javascript: { label: 'JavaScript' },
  python: { label: 'Python' },
  json: { label: 'JSON' },
  markdown: { label: 'Markdown' },
} satisfies Record<LanguageId, LanguagePresentation>;

export interface LanguageOption {
  id: LanguageId;
  label: string;
}

/**
 * The options a selector offers, in the shared list's order. Built from
 * `SUPPORTED_LANGUAGE_IDS` rather than written out again, so there is exactly one
 * place that decides which languages exist and in what order.
 */
export const LANGUAGE_OPTIONS: readonly LanguageOption[] = SUPPORTED_LANGUAGE_IDS.map((id) => ({
  id,
  label: LANGUAGE_METADATA[id].label,
}));

/** What a new file is created as until the person creating it says otherwise. */
export const DEFAULT_LANGUAGE_ID: LanguageId = SUPPORTED_LANGUAGE_IDS[0];

export function languageLabel(id: LanguageId): string {
  return LANGUAGE_METADATA[id].label;
}

/**
 * A `<select>` reports its value as a plain string, so it is checked against the
 * shared validator rather than asserted to be one of the five. A value that was
 * never offered produces `undefined` and the caller decides what to do with it,
 * which is what keeps the selected language narrowly typed without a cast.
 */
export function toLanguageId(value: string): LanguageId | undefined {
  const result = parseContract(languageIdSchema, value);

  return result.ok ? result.value : undefined;
}
