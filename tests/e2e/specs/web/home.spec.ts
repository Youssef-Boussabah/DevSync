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

  // Monaco is a client-side component, so this is the layer that proves the editor
  // survives being server-rendered and reaches the browser at all. It asserts the
  // region the application owns rather than anything inside Monaco's own DOM;
  // typing into the real editor arrives with the last milestone of Phase B.
  test('shows the editor region', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('region', { name: 'Code editor' })).toBeVisible();
  });

  // The language selector is ordinary application markup rather than part of
  // Monaco, so it can be driven here in full. What is still deliberately absent is
  // any assertion about how Monaco renders the result: the selected value and the
  // name the file is shown under are DevSync's, the highlighting is Monaco's.
  test('opens the file as TypeScript', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByLabel('Language', { exact: true })).toHaveValue('typescript');
    await expect(page.getByText('main.ts', { exact: true })).toBeVisible();
  });

  test('reads the file as the selected language, without unmounting the editor', async ({
    page,
  }) => {
    await page.goto('/');

    await page.getByLabel('Language', { exact: true }).selectOption('python');

    await expect(page.getByLabel('Language', { exact: true })).toHaveValue('python');
    await expect(page.getByText('main.py', { exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Code editor' })).toBeVisible();
  });

  test('returns to TypeScript after a reload, because nothing is stored', async ({ page }) => {
    await page.goto('/');

    await page.getByLabel('Language', { exact: true }).selectOption('markdown');
    await expect(page.getByText('README.md', { exact: true })).toBeVisible();

    await page.reload();

    await expect(page.getByLabel('Language', { exact: true })).toHaveValue('typescript');
    await expect(page.getByText('main.ts', { exact: true })).toBeVisible();
  });
});
