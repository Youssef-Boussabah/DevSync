import { expect, test } from '@playwright/test';

// The layer that drives the real Monaco editor. Everything else in the suite
// asserts markup DevSync owns; this file is the only place that reaches into
// Monaco's rendered output, because it is the only way to prove what a keystroke
// in a real browser does. The component suites in `apps/web` cover the same state
// ownership against a stand-in for Monaco — which is exactly why they cannot prove
// this: a stand-in cannot disagree with React about who owns the text.

// One line, and one the sample could not produce by accident. Single-line on
// purpose: Monaco's suggestion widget captures `Enter`, so inserting a newline
// risks silently accepting a completion and asserting against text nobody typed.
const TYPED_LINE = 'const browserEdit = 42;';

// A short, stable fragment of the sample the workspace opens with, rather than the
// whole buffer and its whitespace.
const SAMPLE_FRAGMENT = 'export function greet';

// Typed at a person's pace rather than a machine's. `@monaco-editor/react` rewrites
// the whole model whenever the controlled `value` and the live model disagree, so
// characters delivered faster than React can commit a render are overwritten by a
// value that has already gone stale. Playwright types with no delay by default,
// which no user does; 50 ms is a fast typist, and a user's keystrokes are the
// subject of this test.
const TYPING_DELAY_MS = 50;

test.describe('editing the real editor in the running web application', () => {
  test('carries a typed edit into application state, and loses it on reload', async ({ page }) => {
    await page.goto('/');

    const editorRegion = page.getByRole('region', { name: 'Code editor' });
    const languageSelector = page.getByLabel('Language', { exact: true });

    // The one Monaco-owned selector in the suite, scoped beneath the region DevSync
    // labels so the application keeps the stable outer boundary. It has to be the
    // rendered code surface: Monaco's accessible textbox exists but is drawn
    // off-view at effectively zero size, so it can be found by role and never
    // clicked.
    const codeSurface = editorRegion.locator('.view-lines');

    await expect(codeSurface).toContainText(SAMPLE_FRAGMENT);

    await codeSurface.click();
    await page.keyboard.press('ControlOrMeta+A');
    await page.keyboard.type(TYPED_LINE, { delay: TYPING_DELAY_MS });

    await expect(codeSurface).toContainText(TYPED_LINE);

    // At this point the edit could still be nothing but Monaco's own model.
    // Changing the language rerenders the workspace and hands `CodeEditor` its
    // controlled value again — so if the keystrokes had never reached React state,
    // this is where the sample would come back.
    await languageSelector.selectOption('python');

    await expect(languageSelector).toHaveValue('python');
    await expect(page.getByText('main.py', { exact: true })).toBeVisible();
    await expect(codeSurface).toContainText(TYPED_LINE);
    await expect(codeSurface).not.toContainText(SAMPLE_FRAGMENT);

    await page.reload();

    await expect(codeSurface).toContainText(SAMPLE_FRAGMENT);
    await expect(codeSurface).not.toContainText(TYPED_LINE);
    await expect(languageSelector).toHaveValue('typescript');
    await expect(page.getByText('main.ts', { exact: true })).toBeVisible();
  });
});
