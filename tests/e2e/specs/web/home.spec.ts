import { expect, test } from '@playwright/test';

// The component test in `apps/web` renders the same page in jsdom. This one runs
// against the production build served by `next start`, so it also covers the
// things that only exist once Next.js has compiled and served the route: the HTTP
// response itself, and the document title declared by `layout.tsx` — a file the
// component test cannot import, because `next/font/google` only resolves inside
// the Next.js compiler.
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
});
