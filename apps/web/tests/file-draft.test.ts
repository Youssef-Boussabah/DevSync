import type { ProjectFileResource } from '@devsync/shared';
import { describe, expect, it } from 'vitest';
import { changedFields, sameDraft, toDraft } from '@/workspace/file-draft';

// What a save sends, and what "unsaved changes" means. Both are decided here, so
// both are tested here rather than through a component that would only observe
// them indirectly.

const FILE: ProjectFileResource = {
  id: 'f0a4c9e2-9a2c-4a91-8a0b-0d16a1f4e2c7',
  projectId: '2b1cb2a4-1d0d-4a0e-9f0a-6b3f4f9d4c11',
  name: 'main.ts',
  language: 'typescript',
  content: 'const a = 1;\n',
  createdAt: '2026-08-04T10:00:00.000Z',
  updatedAt: '2026-08-04T11:00:00.000Z',
};

describe('toDraft', () => {
  it('takes the three editable properties and nothing else', () => {
    expect(toDraft(FILE)).toEqual({
      name: 'main.ts',
      language: 'typescript',
      content: 'const a = 1;\n',
    });
  });
});

describe('sameDraft', () => {
  it('is true for a draft nothing has changed', () => {
    expect(sameDraft(toDraft(FILE), toDraft(FILE))).toBe(true);
  });

  it.each([
    ['name', { name: 'other.ts' }],
    ['language', { language: 'python' as const }],
    ['content', { content: 'const a = 2;\n' }],
  ])('is false when the %s differs', (_property, change) => {
    expect(sameDraft(toDraft(FILE), { ...toDraft(FILE), ...change })).toBe(false);
  });

  it('is false when the content was emptied, because empty is a real edit', () => {
    expect(sameDraft(toDraft(FILE), { ...toDraft(FILE), content: '' })).toBe(false);
  });
});

describe('changedFields', () => {
  it('is null when nothing changed, so no request is made', () => {
    expect(changedFields(FILE, toDraft(FILE))).toBeNull();
  });

  it('sends only the name when only the name changed', () => {
    expect(changedFields(FILE, { ...toDraft(FILE), name: 'renamed.ts' })).toEqual({
      name: 'renamed.ts',
    });
  });

  it('sends only the language when only the language changed, leaving the name alone', () => {
    expect(changedFields(FILE, { ...toDraft(FILE), language: 'python' })).toEqual({
      language: 'python',
    });
  });

  it('sends only the content when only the content changed', () => {
    expect(changedFields(FILE, { ...toDraft(FILE), content: 'next' })).toEqual({ content: 'next' });
  });

  it('sends empty content as a change rather than treating the file as absent', () => {
    expect(changedFields(FILE, { ...toDraft(FILE), content: '' })).toEqual({ content: '' });
  });

  it('sends all three when all three changed', () => {
    expect(
      changedFields(FILE, { name: 'notes.md', language: 'markdown', content: '# Notes' }),
    ).toEqual({ name: 'notes.md', language: 'markdown', content: '# Notes' });
  });
});
