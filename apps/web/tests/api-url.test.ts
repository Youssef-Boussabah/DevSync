import { describe, expect, it } from 'vitest';
import { API_BASE_URL, resolveApiBaseUrl } from '@/api';

// The one value `apps/web` reads from its environment, and the check that decides
// whether the application can be built at all. Everything here is the pure
// resolver: `API_BASE_URL` itself is whatever `vitest.config.mts` configured, and
// the last test is the only one that looks at it.

describe('resolveApiBaseUrl', () => {
  it('accepts an http origin', () => {
    expect(resolveApiBaseUrl('http://127.0.0.1:3001')).toBe('http://127.0.0.1:3001');
  });

  it('accepts an https origin', () => {
    expect(resolveApiBaseUrl('https://api.devsync.example')).toBe('https://api.devsync.example');
  });

  it('normalises a trailing slash away, so a path is never appended to a double slash', () => {
    expect(resolveApiBaseUrl('http://127.0.0.1:3001/')).toBe('http://127.0.0.1:3001');
  });

  it('ignores surrounding whitespace', () => {
    expect(resolveApiBaseUrl('  http://127.0.0.1:3001  ')).toBe('http://127.0.0.1:3001');
  });

  it('refuses to guess when it is unset', () => {
    expect(() => resolveApiBaseUrl(undefined)).toThrow(/NEXT_PUBLIC_API_URL is not set/);
  });

  it('treats an empty value as unset rather than as an origin', () => {
    expect(() => resolveApiBaseUrl('   ')).toThrow(/NEXT_PUBLIC_API_URL is not set/);
  });

  it('refuses a value that is not a URL', () => {
    expect(() => resolveApiBaseUrl('127.0.0.1:3001')).toThrow(/is not a valid URL/);
  });

  it.each([['ws://127.0.0.1:3001'], ['file:///tmp'], ['postgresql://user@host:5432/devsync']])(
    'refuses %p, which no browser request can be made to',
    (value: string) => {
      expect(() => resolveApiBaseUrl(value)).toThrow(/must be an http:\/\/ or https:\/\/ origin/);
    },
  );

  it('refuses credentials, which this variable publishes to every visitor', () => {
    expect(() => resolveApiBaseUrl('http://user:secret@127.0.0.1:3001')).toThrow(
      /must not carry credentials/,
    );
  });

  it.each([['http://127.0.0.1:3001?a=1'], ['http://127.0.0.1:3001#top']])(
    'refuses %p, which is a URL rather than an origin',
    (value: string) => {
      expect(() => resolveApiBaseUrl(value)).toThrow(/must not carry a query string or a fragment/);
    },
  );

  it('refuses a path, and names the origin that was meant', () => {
    expect(() => resolveApiBaseUrl('http://127.0.0.1:3001/api')).toThrow(
      /must be an origin with no path[\s\S]*Use http:\/\/127\.0\.0\.1:3001 instead/,
    );
  });

  it('resolves the configured origin at module scope, so a bad value fails the build', () => {
    expect(API_BASE_URL).toBe('http://127.0.0.1:3001');
  });
});
