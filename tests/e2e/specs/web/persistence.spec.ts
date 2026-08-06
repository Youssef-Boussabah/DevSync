import { expect, test } from '@playwright/test';
import {
  acceptConfirmations,
  codeSurface,
  createProject,
  removeProject,
  replaceEditorContent,
  uniqueProjectName,
} from './support/workspace';

// The claim C3 exists to make: a person can create a project, edit a file, save
// it, reload the browser, and find their work where they left it.
//
// Everything here is real — the production web build, the compiled API, and the
// disposable PostgreSQL `tools/run-e2e.mjs` reset before any of it started.
// Nothing is mocked or stubbed at any layer, which is what makes this the only
// place the whole path from a keystroke to a row and back is exercised at once.

// A fragment of the starter file the API creates every project with. Short and
// stable, rather than the whole buffer and its whitespace.
const STARTER_FRAGMENT = 'export function greet';

test.describe('saving work and finding it again', () => {
  test('creates a project, saves an edit, and keeps it across a reload', async ({ page }) => {
    const name = uniqueProjectName('Persistence');

    await page.goto('/');
    await expect(page.getByRole('heading', { level: 2, name: 'Projects' })).toBeVisible();

    const projectId = await createProject(page, name);

    try {
      // The starter file the API wrote in the same transaction as the project.
      await expect(page.getByLabel('File name', { exact: true })).toHaveValue('main.ts');
      await expect(page.getByLabel('Language', { exact: true })).toHaveValue('typescript');
      await expect(codeSurface(page)).toContainText(STARTER_FRAGMENT);
      await expect(page.getByRole('status')).toHaveText('Saved');

      const marker = `const savedAt${Date.now().toString(36)} = 42;`;
      await replaceEditorContent(page, marker);

      await expect(page.getByRole('status')).toHaveText('Unsaved changes');

      await page.getByRole('button', { name: 'Save' }).click();
      await expect(page.getByRole('status')).toHaveText('Saved');

      await page.reload();

      // The database's answer, not the browser's: nothing is kept in this tab.
      await expect(codeSurface(page)).toContainText(marker);
      await expect(codeSurface(page)).not.toContainText(STARTER_FRAGMENT);
      await expect(page.getByLabel('File name', { exact: true })).toHaveValue('main.ts');
      await expect(page.getByLabel('Language', { exact: true })).toHaveValue('typescript');
    } finally {
      await removeProject(page, projectId);
    }
  });

  test('does not save an edit the user never asked to save', async ({ page }) => {
    const projectId = await createProject(page, uniqueProjectName('Unsaved'));

    acceptConfirmations(page);

    try {
      await replaceEditorContent(page, 'const neverSaved = true;');
      await expect(page.getByRole('status')).toHaveText('Unsaved changes');

      // Away and back, without ever pressing Save. There is no autosave and
      // nothing is kept in the browser, so the file is as the database has it.
      await page.goto(`/projects/${projectId}`);

      await expect(codeSurface(page)).toContainText(STARTER_FRAGMENT);
      await expect(codeSurface(page)).not.toContainText('neverSaved');
    } finally {
      await removeProject(page, projectId);
    }
  });
});

test.describe('project operations', () => {
  test('renames a project, finds it again in the list, and deletes it', async ({ page }) => {
    const name = uniqueProjectName('Rename');
    const renamed = `${name} renamed`;
    const projectId = await createProject(page, name);

    acceptConfirmations(page);

    try {
      await page.getByRole('button', { name: 'Rename project' }).click();
      await page.getByLabel('Project name').fill(renamed);
      await page.getByRole('button', { name: 'Save name' }).click();

      await expect(page.getByRole('heading', { level: 1, name: renamed })).toBeVisible();

      await page.getByRole('button', { name: 'All projects' }).click();
      await page.waitForURL('/');

      // The list is loaded from the API, so the new name being here is the
      // rename having reached the database rather than a heading that changed.
      await expect(page.getByRole('heading', { level: 3, name: renamed })).toBeVisible();

      await page.getByRole('link', { name: `Open ${renamed}` }).click();
      await page.waitForURL(`/projects/${projectId}`);
      await expect(page.getByRole('heading', { level: 1, name: renamed })).toBeVisible();

      await page.getByRole('button', { name: 'All projects' }).click();
      await page.waitForURL('/');

      await page.getByRole('button', { name: `Delete ${renamed}` }).click();

      await expect(page.getByRole('heading', { level: 3, name: renamed })).toBeHidden();

      // Gone from the database too, not merely from the list on screen.
      await page.reload();
      await expect(page.getByRole('heading', { level: 3, name: renamed })).toBeHidden();
    } finally {
      await removeProject(page, projectId);
    }
  });

  test('shows a project that no longer exists as gone, rather than as an empty editor', async ({
    page,
  }) => {
    await page.goto('/projects/00000000-0000-4000-8000-000000000000');

    await expect(page.getByText('That project no longer exists.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Back to your projects' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Code editor' })).toBeHidden();
  });
});
