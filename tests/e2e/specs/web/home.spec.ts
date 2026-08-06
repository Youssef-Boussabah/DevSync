import { expect, test } from '@playwright/test';

// The component test in `apps/web` renders the same page in jsdom. This one runs
// against the production build served by `next start`, so it also covers the
// things that only exist once Next.js has compiled and served the route: the HTTP
// response itself, and the document title declared by `layout.tsx` — a file the
// component test cannot import, because `next/font/google` only resolves inside
// the Next.js compiler.
//
// It writes nothing. Creating, editing, and deleting are covered by
// `persistence.spec.ts` and `files.spec.ts`.
test.describe('home page of the running web application', () => {
  test('serves a successful response', async ({ page }) => {
    const response = await page.goto('/');

    expect(response?.status()).toBe(200);
  });

  test('identifies the product as DevSync', async ({ page }) => {
    await page.goto('/');

    await expect(page).toHaveTitle('DevSync');
    await expect(page.getByRole('heading', { level: 1, name: 'DevSync' })).toBeVisible();
  });

  // The list is fetched from the API by the browser, so a rendered list — even an
  // empty one — is proof the cross-origin request was allowed and answered. A
  // page that never got past `loading` would fail here.
  test('loads the project list from the API', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 2, name: 'Projects' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create project' })).toBeVisible();
    await expect(page.getByText('Loading your projects…')).toBeHidden();
    await expect(page.getByText(/could not reach its API/i)).toBeHidden();
  });

  test('does not claim that work is discarded on refresh', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByText(/discards your changes/i)).toBeHidden();
    await expect(page.getByText(/still there after a reload/i)).toBeVisible();
  });
});
