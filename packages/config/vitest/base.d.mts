// Declarations for `base.mjs`.
//
// Hand-written because this package emits nothing: it is consumed as source, and
// the two files that import these values — `apps/web/vitest.config.mts` and
// `packages/database/vitest.config.mts` — are type-checked. Without this, a
// strict `.mts` importing a `.mjs` is an implicit `any`.

/** Test files, wherever a workspace keeps them. */
export declare const testFileGlobs: readonly string[];

/** Directories no workspace wants Vitest to walk into. */
export declare const ignoredDirectories: readonly string[];

/**
 * Coverage settings shared by every workspace that measures it.
 *
 * The arrays are declared mutable, and the reporters as their literal names,
 * because Vitest's own `CoverageOptions` will not accept a `readonly string[]`.
 */
export declare const coverageDefaults: {
  provider: 'v8';
  reporter: ('text' | 'html')[];
  reportsDirectory: string;
  exclude: string[];
};
