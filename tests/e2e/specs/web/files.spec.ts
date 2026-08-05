import { expect, test } from '@playwright/test';
import {
  acceptConfirmations,
  codeSurface,
  createProject,
  removeProject,
  replaceEditorContent,
  uniqueProjectName,
} from './support/workspace';

// The file half of the workspace, through the real browser: a second file, its
// own name and its own stored language, and the two changed independently of one
// another.

const EMPTY_PROJECT = 'This project has no files. Add one to start editing.';

test.describe('files in a project', () => {
  test('adds a second file, keeps its name, language, and content, and deletes it', async ({
    page,
  }) => {
    const projectId = await createProject(page, uniqueProjectName('Files'));

    acceptConfirmations(page);

    try {
      await page.getByLabel('New file name').fill('notes.md');
      await page.getByLabel('New file language').selectOption('markdown');
      await page.getByRole('button', { name: 'Add file' }).click();

      // Created empty and opened, with the language that was chosen for it.
      await expect(page.getByLabel('File name', { exact: true })).toHaveValue('notes.md');
      await expect(page.getByLabel('Language', { exact: true })).toHaveValue('markdown');

      const marker = `A note written at ${Date.now().toString(36)}`;
      await replaceEditorContent(page, marker);
      await page.getByRole('button', { name: 'Save' }).click();
      await expect(page.getByRole('status')).toHaveText('Saved');

      // Back to the starter file: its own content, untouched by any of the above.
      await page.getByRole('button', { name: /main\.ts/ }).click();
      await expect(page.getByLabel('File name', { exact: true })).toHaveValue('main.ts');
      await expect(page.getByLabel('Language', { exact: true })).toHaveValue('typescript');
      await expect(codeSurface(page)).toContainText('export function greet');

      // And back again, loaded from the database rather than from anything the
      // browser kept.
      await page.getByRole('button', { name: /notes\.md/ }).click();
      await expect(page.getByLabel('File name', { exact: true })).toHaveValue('notes.md');
      await expect(page.getByLabel('Language', { exact: true })).toHaveValue('markdown');
      await expect(codeSurface(page)).toContainText(marker);

      // A rename changes the name and nothing else.
      await page.getByLabel('File name', { exact: true }).fill('guide.md');
      await page.getByRole('button', { name: 'Save' }).click();
      await expect(page.getByRole('status')).toHaveText('Saved');
      await expect(page.getByLabel('Language', { exact: true })).toHaveValue('markdown');
      await expect(page.getByRole('button', { name: /guide\.md/ })).toBeVisible();

      // And a language change changes the language and nothing else.
      await page.getByLabel('Language', { exact: true }).selectOption('python');
      await page.getByRole('button', { name: 'Save' }).click();
      await expect(page.getByRole('status')).toHaveText('Saved');
      await expect(page.getByLabel('File name', { exact: true })).toHaveValue('guide.md');

      // All three survive a reload, which is the only proof that they were stored
      // rather than remembered.
      await page.reload();
      await expect(page.getByLabel('File name', { exact: true })).toHaveValue('main.ts');
      await page.getByRole('button', { name: /guide\.md/ }).click();
      await expect(page.getByLabel('Language', { exact: true })).toHaveValue('python');
      await expect(codeSurface(page)).toContainText(marker);

      // Deleting it leaves the project with the file it started with.
      await page.getByRole('button', { name: 'Delete file' }).click();
      await expect(page.getByLabel('File name', { exact: true })).toHaveValue('main.ts');
      await expect(page.getByRole('button', { name: /guide\.md/ })).toBeHidden();
    } finally {
      await removeProject(page, projectId);
    }
  });

  test('allows the last file to be deleted, leaving the project empty', async ({ page }) => {
    const projectId = await createProject(page, uniqueProjectName('Empty'));

    acceptConfirmations(page);

    try {
      await page.getByRole('button', { name: 'Delete file' }).click();

      await expect(page.getByText(EMPTY_PROJECT)).toBeVisible();
      await expect(page.getByRole('region', { name: 'Code editor' })).toBeHidden();

      // The project is still there, which is the point: deleting its last file is
      // not deleting the project.
      await page.reload();
      await expect(page.getByText(EMPTY_PROJECT)).toBeVisible();

      // And a new file can be added to it.
      await page.getByLabel('New file name').fill('again.ts');
      await page.getByRole('button', { name: 'Add file' }).click();

      await expect(page.getByLabel('File name', { exact: true })).toHaveValue('again.ts');
    } finally {
      await removeProject(page, projectId);
    }
  });

  test('refuses a file name the project already uses, and says which field is wrong', async ({
    page,
  }) => {
    const projectId = await createProject(page, uniqueProjectName('Conflict'));

    try {
      await page.getByLabel('New file name').fill('main.ts');
      await page.getByRole('button', { name: 'Add file' }).click();

      // The API's `409 FILE_NAME_TAKEN`, shown as a field-level issue rather than
      // as a status code or a raw body.
      await expect(page.getByText('Already used in this project.')).toBeVisible();
      await expect(page.getByLabel('New file name')).toHaveAttribute('aria-invalid', 'true');

      // Nothing was created: the project still holds exactly the starter file.
      await page.reload();
      await expect(page.getByRole('button', { name: /main\.ts/ })).toHaveCount(1);
    } finally {
      await removeProject(page, projectId);
    }
  });
});
