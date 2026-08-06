// @ts-check

// The parts of a Vitest setup that are not specific to one workspace.
//
// This file exists because C1 added a second Vitest workspace — `apps/web` runs
// components in jsdom, `packages/database` runs data-access code against a real
// PostgreSQL in Node — and the two agreed on exactly these three things. Plain
// values rather than a config builder: a workspace spreads what it wants and
// states the rest itself, so its config still reads as its own.
//
// What is deliberately NOT here: environments, plugins, aliases, setup files,
// and pool settings. Those are where the two workspaces genuinely differ.

/** Test files, wherever a workspace keeps them. */
export const testFileGlobs = ['**/*.{test,spec}.{ts,tsx}'];

/** Directories no workspace wants Vitest to walk into. */
export const ignoredDirectories = [
  '**/node_modules/**',
  '**/dist/**',
  '**/.next/**',
  '**/.turbo/**',
  '**/coverage/**',
];

/**
 * Coverage settings shared by every workspace that measures it. No thresholds:
 * that decision belongs to the milestone with enough application logic to hold
 * to one, not to this file.
 */
export const coverageDefaults = {
  provider: /** @type {const} */ ('v8'),
  reporter: ['text', 'html'],
  reportsDirectory: './coverage',
  exclude: testFileGlobs,
};
