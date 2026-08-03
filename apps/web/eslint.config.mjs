// @ts-check
import { createBaseConfig } from '@devsync/config/eslint/base';
import { defineConfig } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

// The Next.js presets come first and the shared config last, so that where the two
// overlap the repository-wide rules win. `eslint-config-next` keeps ownership of
// what it is uniquely able to check: the App Router and Core Web Vitals rules.
//
// Ignores for `.next`, `out`, `build`, and `next-env.d.ts` come from the shared
// config, which is why this file no longer restates them.
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  ...createBaseConfig({ tsconfigRootDir: import.meta.dirname }),
]);

export default eslintConfig;
