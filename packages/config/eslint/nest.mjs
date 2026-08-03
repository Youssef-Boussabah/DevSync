// @ts-check
import globals from 'globals';
import tseslint from 'typescript-eslint';
import { createBaseConfig } from './base.mjs';

/**
 * Shared config plus the things a NestJS service needs.
 *
 * @param {object} options
 * @param {string} options.tsconfigRootDir Directory ESLint resolves tsconfigs from.
 */
export function createNestConfig({ tsconfigRootDir }) {
  return tseslint.config(
    // NestJS compiles to CommonJS, so the sources are CommonJS modules written
    // with ESM syntax.
    ...createBaseConfig({ tsconfigRootDir, sourceType: 'commonjs' }),
    {
      files: ['**/*.ts'],
      languageOptions: {
        globals: globals.node,
      },
      rules: {
        // `emitDecoratorMetadata` needs an injected class to be imported as a
        // value: rewriting it to `import type` erases it, and Nest's
        // `design:paramtypes` metadata degrades to `Object`, which fails at
        // runtime rather than at compile time. ESLint cannot tell an
        // injection-relevant import from an ordinary one, so the rule is off for
        // this workspace only — it stays on everywhere else.
        '@typescript-eslint/consistent-type-imports': 'off',
      },
    },
    {
      // Declares Jest's globals on spec files and nowhere else. TypeScript, not
      // ESLint, is what actually reports an undeclared `describe` here, because
      // typescript-eslint switches `no-undef` off for typed files; this keeps the
      // environment description accurate for the rules that do read it, and stops
      // `@types/jest` from implying that service code may call `expect`.
      files: ['**/*.spec.ts', '**/*.e2e-spec.ts'],
      languageOptions: {
        globals: globals.jest,
      },
    },
  );
}
