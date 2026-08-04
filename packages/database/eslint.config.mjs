// @ts-check
import { createBaseConfig } from '@devsync/config/eslint/base';

export default [
  {
    // Prisma Client, regenerated from the schema on every build. It carries its
    // own `eslint-disable`, but ignoring the directory outright also stops the
    // type-aware rules walking thousands of generated lines on every run.
    ignores: ['src/generated/**'],
  },
  ...createBaseConfig({ tsconfigRootDir: import.meta.dirname }),
];
