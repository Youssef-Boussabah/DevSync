import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

// The few things every C3 browser flow needs: a project nobody else is using, the
// way into it, and a way to clean it up afterwards.
//
// This file matches no test pattern, so Playwright never collects it as a suite.

/** Where the API this suite starts is published. `playwright.config.ts` owns the port. */
const API_BASE_URL = 'http://127.0.0.1:4311';

const PROJECT_PATH = /\/projects\/[0-9a-f-]{36}$/;

let created = 0;

/**
 * A name no other test and no previous run can have used.
 *
 * The suite runs serially against one disposable database that is reset before it
 * starts, so this is belt and braces — but a project list is shared state, and a
 * test that found two projects called "Alpha" would be a confusing failure rather
 * than an obvious one.
 */
export function uniqueProjectName(prefix: string): string {
  created += 1;

  return `${prefix} ${Date.now().toString(36)}-${created}`;
}

/** Creates a project through the real interface and returns the identifier it was given. */
export async function createProject(page: Page, name: string): Promise<string> {
  await page.goto('/');
  await page.getByLabel('New project name').fill(name);
  await page.getByRole('button', { name: 'Create project' }).click();

  await page.waitForURL(PROJECT_PATH);
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();

  return projectIdOf(page.url());
}

export function projectIdOf(url: string): string {
  const id = new URL(url).pathname.split('/').pop();

  if (id === undefined || id === '') {
    throw new Error(`No project identifier in ${url}`);
  }

  return id;
}

/**
 * Removes a project the test created, whether or not the test got as far as
 * deleting it itself. Through the API rather than the interface, because a
 * cleanup step that drove the UI would fail for the same reason the test did.
 */
export async function removeProject(page: Page, projectId: string): Promise<void> {
  const response = await page.request.delete(`${API_BASE_URL}/projects/${projectId}`);

  // 404 means the test deleted it, which is the outcome some of them assert.
  expect([204, 404]).toContain(response.status());
}

/** Monaco's rendered code surface, scoped beneath the region DevSync labels. */
export function codeSurface(page: Page) {
  return page.getByRole('region', { name: 'Code editor' }).locator('.view-lines');
}

/**
 * Replaces everything in the editor with one line.
 *
 * Typed at a person's pace: `@monaco-editor/react` rewrites the whole model
 * whenever the controlled value and the live model disagree, so characters
 * delivered faster than React commits are overwritten by a value that has already
 * gone stale. One line and no `Enter`, because Monaco's suggestion widget
 * captures it and could accept a completion nobody typed.
 */
export async function replaceEditorContent(page: Page, line: string): Promise<void> {
  await codeSurface(page).click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type(line, { delay: 50 });

  await expect(codeSurface(page)).toContainText(line);
}

/** Accepts every native confirmation, which is how the application asks about unsaved work. */
export function acceptConfirmations(page: Page): void {
  page.on('dialog', (dialog) => {
    void dialog.accept();
  });
}
