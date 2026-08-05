/**
 * Where the browser reaches `apps/api`.
 *
 * This is the one place the value is read and the one place it is checked. It is
 * a **public** variable: `NEXT_PUBLIC_*` values are inlined into the JavaScript
 * `next build` emits, so whatever is set here is visible to anyone who opens the
 * page. That is correct for an API origin and is exactly why no database URL, and
 * nothing else server-only, may ever be given a `NEXT_PUBLIC_` name.
 *
 * Because the value is embedded at build time, a build made against one API
 * origin cannot be reused against another — which is why `NEXT_PUBLIC_API_URL` is
 * part of the `build` task's environment hash in `turbo.json`.
 */

const VARIABLE = 'NEXT_PUBLIC_API_URL';

const BROWSER_PROTOCOLS = new Set(['http:', 'https:']);

const EXAMPLE = 'http://127.0.0.1:3001';

/**
 * The API origin, or an explanation of why the configured value is not one.
 *
 * DevSync's API mounts at the root — no global prefix, no version segment — so
 * this is an origin and not a base path. A value carrying a path, a query, a
 * fragment, or credentials means whoever set it was describing something else,
 * and silently trimming it would hide the mistake until a request 404ed.
 */
export function resolveApiBaseUrl(value: string | undefined): string {
  if (value === undefined || value.trim() === '') {
    throw new Error(
      `${VARIABLE} is not set, and DevSync will not guess where its API is. Set it to the API ` +
        `origin — ${EXAMPLE} for local development — and rebuild: the value is embedded at ` +
        'build time. See `.env.example`.',
    );
  }

  const trimmed = value.trim();
  let url: URL;

  try {
    url = new URL(trimmed);
  } catch {
    throw new Error(`${VARIABLE} is not a valid URL. Received: ${trimmed}`);
  }

  if (!BROWSER_PROTOCOLS.has(url.protocol)) {
    throw new Error(`${VARIABLE} must be an http:// or https:// origin. Received: ${trimmed}`);
  }

  if (url.username !== '' || url.password !== '') {
    throw new Error(
      `${VARIABLE} must not carry credentials. Anything in it is published to every visitor.`,
    );
  }

  if (url.search !== '' || url.hash !== '') {
    throw new Error(
      `${VARIABLE} must not carry a query string or a fragment. Received: ${trimmed}`,
    );
  }

  if (url.pathname !== '/') {
    throw new Error(
      `${VARIABLE} must be an origin with no path — the DevSync API serves its routes from the ` +
        `root. Received: ${trimmed}. Use ${url.origin} instead.`,
    );
  }

  // `URL.origin` has no trailing slash, so every request path can be appended
  // directly and `http://127.0.0.1:3001/` and `http://127.0.0.1:3001` are one
  // value rather than two that differ by a double slash.
  return url.origin;
}

/**
 * Read as a static member access on purpose: that literal expression is what
 * Next.js replaces with the configured value when it compiles, and a dynamic
 * lookup such as `process.env[name]` is left alone and arrives `undefined` in the
 * browser.
 *
 * Resolved at module scope, so a missing or malformed value fails the build while
 * the page is being prerendered rather than becoming a broken request later.
 */
export const API_BASE_URL = resolveApiBaseUrl(process.env.NEXT_PUBLIC_API_URL);
