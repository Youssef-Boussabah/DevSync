// @ts-check
import js from '@eslint/js';
import prettierConfig from 'eslint-config-prettier/flat';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * Generated output and dependencies. Nothing here is hand-written, so nothing here
 * should ever be reported.
 */
export const ignores = [
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/out/**',
  '**/coverage/**',
  '**/.next/**',
  '**/.turbo/**',
  '**/next-env.d.ts',
];

/** TypeScript sources. Only these receive type-aware rules. */
export const typeScriptFiles = ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'];

/** Hand-written JavaScript tooling files, which live outside every tsconfig. */
export const javaScriptFiles = ['**/*.js', '**/*.mjs', '**/*.cjs'];

/**
 * The TypeScript quality rules every DevSync workspace agrees on.
 *
 * `tseslint.configs.recommendedTypeChecked` already reports, as errors, the
 * defect classes this milestone cares about: `no-explicit-any`, the `no-unsafe-*`
 * family, `no-floating-promises`, `no-misused-promises`,
 * `no-unnecessary-type-assertion`, `require-await`, and `await-thenable`. Only the
 * genuinely additional rules are spelled out below, so this file does not drift
 * from the preset it builds on.
 *
 * @type {import('eslint').Linter.RulesRecord}
 */
const sharedTypeScriptRules = {
  // Same rule the preset enables, widened with the conventional `_` escape hatch
  // and extended to cover caught errors, which the default options ignore.
  '@typescript-eslint/no-unused-vars': [
    'error',
    {
      args: 'all',
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
      caughtErrors: 'all',
      caughtErrorsIgnorePattern: '^_',
      destructuredArrayIgnorePattern: '^_',
      ignoreRestSiblings: true,
    },
  ],

  // Keeps type-only imports erasable, which matters for `verbatimModuleSyntax`
  // and `isolatedModules`. Not enabled by any preset.
  '@typescript-eslint/consistent-type-imports': [
    'error',
    { prefer: 'type-imports', fixStyle: 'separate-type-imports' },
  ],
};

/**
 * Builds the flat ESLint config shared by every workspace.
 *
 * @param {object} options
 * @param {string} options.tsconfigRootDir Directory ESLint resolves tsconfigs from.
 *   Callers pass `import.meta.dirname` so the type-aware rules read the workspace's
 *   own tsconfig rather than one further up the tree.
 * @param {'module' | 'commonjs'} [options.sourceType] Module system of the
 *   workspace's TypeScript sources. Defaults to `module`.
 */
export function createBaseConfig({ tsconfigRootDir, sourceType = 'module' }) {
  return tseslint.config(
    { ignores },
    js.configs.recommended,
    {
      files: javaScriptFiles,
      languageOptions: {
        globals: globals.node,
        ecmaVersion: 'latest',
      },
    },
    {
      files: typeScriptFiles,
      extends: [tseslint.configs.recommendedTypeChecked],
      languageOptions: {
        sourceType,
        parserOptions: {
          // Resolves each file against the nearest tsconfig, so type-aware rules
          // work without maintaining an explicit project list per workspace.
          projectService: true,
          tsconfigRootDir,
        },
      },
      rules: sharedTypeScriptRules,
    },
    // Last, so it can switch off any stylistic rule that would argue with
    // Prettier. Prettier itself remains the only thing that formats.
    prettierConfig,
  );
}
