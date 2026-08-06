import { describe, expect, it } from 'vitest';
import { SUPPORTED_LANGUAGE_IDS, languageIdSchema } from '../src';
import { accepted, rejected } from './support/contract';

// The one list and the one validator. What matters is that they agree with each
// other and that the validator is exact — an identifier is stored and later read
// back by a client, so "close enough" would be a file that opens as the wrong
// language.

describe('the supported languages', () => {
  it('are exactly the five DevSync offers', () => {
    expect([...SUPPORTED_LANGUAGE_IDS]).toEqual([
      'typescript',
      'javascript',
      'python',
      'json',
      'markdown',
    ]);
  });

  it.each([...SUPPORTED_LANGUAGE_IDS])('accepts %s', (languageId) => {
    expect(accepted(languageIdSchema, languageId)).toBe(languageId);
  });

  it('rejects a language nobody offers', () => {
    expect(rejected(languageIdSchema, 'rust')).toHaveLength(1);
  });

  it('is case-sensitive, so a display label is not an identifier', () => {
    expect(rejected(languageIdSchema, 'TypeScript')).toHaveLength(1);
  });

  it('does not coerce a non-string', () => {
    expect(rejected(languageIdSchema, 1)).toHaveLength(1);
    expect(rejected(languageIdSchema, null)).toHaveLength(1);
  });

  it('rejects an empty identifier rather than defaulting to one', () => {
    expect(rejected(languageIdSchema, '')).toHaveLength(1);
  });
});
