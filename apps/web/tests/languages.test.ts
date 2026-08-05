import { SUPPORTED_LANGUAGE_IDS } from '@devsync/shared';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LANGUAGE_ID,
  LANGUAGE_OPTIONS,
  languageLabel,
  toLanguageId,
} from '@/editor/languages';

// The browser's half of the language boundary. The identifiers themselves belong
// to `@devsync/shared` and are tested there; what is tested here is that this
// workspace adds presentation to that list rather than a second copy of it.

describe('language options', () => {
  it('offers exactly the identifiers the shared package supports, in its order', () => {
    expect(LANGUAGE_OPTIONS.map((option) => option.id)).toEqual([...SUPPORTED_LANGUAGE_IDS]);
  });

  it('gives every supported identifier a label a person can read', () => {
    // Written out rather than derived, because a test that read the same metadata
    // the component renders from would only prove it agrees with itself.
    expect(LANGUAGE_OPTIONS.map((option) => option.label)).toEqual([
      'TypeScript',
      'JavaScript',
      'Python',
      'JSON',
      'Markdown',
    ]);
  });

  it('labels a stored identifier for display', () => {
    expect(languageLabel('markdown')).toBe('Markdown');
  });

  it('creates new files as the first supported language rather than a repeated string', () => {
    expect(DEFAULT_LANGUAGE_ID).toBe(SUPPORTED_LANGUAGE_IDS[0]);
  });

  it('carries no file name, because a file has a stored name of its own', () => {
    for (const option of LANGUAGE_OPTIONS) {
      expect(option).not.toHaveProperty('fileName');
      expect(Object.keys(option).sort()).toEqual(['id', 'label']);
    }
  });
});

describe('toLanguageId', () => {
  it.each([...SUPPORTED_LANGUAGE_IDS])('accepts %p', (id: string) => {
    expect(toLanguageId(id)).toBe(id);
  });

  it('rejects a language DevSync does not store', () => {
    expect(toLanguageId('rust')).toBeUndefined();
  });

  it('is case-sensitive, because the stored value is', () => {
    expect(toLanguageId('TypeScript')).toBeUndefined();
  });

  it('rejects the empty string a `<select>` reports for a value it never offered', () => {
    expect(toLanguageId('')).toBeUndefined();
  });

  it('infers nothing from a file name', () => {
    expect(toLanguageId('main.ts')).toBeUndefined();
  });
});
