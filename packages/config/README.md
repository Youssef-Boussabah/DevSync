# @devsync/config

The shared development configuration for the DevSync workspaces: one place to change
a rule, rather than eight copies to keep in sync.

This package is private, is never published, and contains no runtime code. Everything
it exports is consumed at build, lint, or type-check time.

## TypeScript

Six configurations, layered so that a framework only overrides what it genuinely
owns.

| File                       | Extends              | Used by                                                     |
| -------------------------- | -------------------- | ----------------------------------------------------------- |
| `tsconfig.base.json`       | —                    | The five configs below; not extended directly by workspaces |
| `tsconfig.package.json`    | `tsconfig.base.json` | Every `packages/*` library that emits nothing               |
| `tsconfig.library.json`    | `tsconfig.base.json` | `packages/database`                                         |
| `tsconfig.nest.json`       | `tsconfig.base.json` | `apps/api`                                                  |
| `tsconfig.next.json`       | `tsconfig.base.json` | `apps/web`                                                  |
| `tsconfig.playwright.json` | `tsconfig.base.json` | `tests/e2e`                                                 |

`tsconfig.base.json` carries **only** correctness settings — `strict`,
`exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noImplicitOverride`,
`noFallthroughCasesInSwitch`, `noUnusedLocals`, `noUnusedParameters`,
`useUnknownInCatchVariables`, `isolatedModules`, `esModuleInterop`,
`forceConsistentCasingInFileNames`, and `skipLibCheck`. It deliberately says nothing
about `target`, `lib`, `module`, or emit, because those are exactly the settings
Next.js and NestJS have real opinions about.

`exactOptionalPropertyTypes` is on because it was verified to pass lint, type-check,
tests, and both production builds with no workarounds — not because it is stricter.
Worth knowing when revisiting it: today's application code is small and has very few
optional properties, so this flag has not yet met the React prop-spreading patterns
that most often make it expensive.

Two deviations are intentional and load-bearing:

- **`tsconfig.nest.json` does not set `verbatimModuleSyntax`.** That flag erases
  type-only imports, and `emitDecoratorMetadata` needs an injected class to survive
  as a value — otherwise `design:paramtypes` degrades to `Object` and dependency
  injection fails at runtime rather than at compile time. `tsconfig.package.json`
  does set it.
- **`tsconfig.nest.json` does not set `lib`.** It inherits the default library for
  its `target`, which is what `@types/express` and `@types/node` are checked
  against today.

`tsconfig.library.json` arrived with C1, when `@devsync/database` became the first
`packages/*` workspace that runs in production rather than being compiled by whoever
imports it. It emits declarations and source maps, and it deliberately omits
`verbatimModuleSyntax` for a different reason than `tsconfig.nest.json` does: the
package emits **CommonJS**, and that flag rejects ESM syntax in a file TypeScript has
decided is CommonJS. CommonJS is the right output because the only consumer is
`apps/api`, which compiles to CommonJS and whose Jest suite loads modules through
ts-jest's CommonJS registry — a registry that cannot `require` an ES module.
`tsconfig.package.json` remains correct for the four reserved packages, which still
emit nothing.

`tsconfig.playwright.json` exists because `tests/e2e` cannot extend
`tsconfig.package.json`: Playwright transpiles `.ts` files itself and resolves imports the way
a bundler does, whereas `verbatimModuleSyntax` there rejects ESM syntax in a CommonJS package,
which is what a Playwright workspace is by default. It sets `moduleResolution: "bundler"`, which
describes Playwright's loader accurately, and inherits every strictness setting from the base.

### Consuming it

```jsonc
// packages/<name>/tsconfig.json
{
  "extends": "@devsync/config/tsconfig.package.json",
  "include": ["src"],
}
```

`apps/web` keeps `paths` and the `next` language-service plugin in its own
`tsconfig.json`: `paths` resolve relative to the file that declares them, so moving
`@/*` here would point it at this package.

## ESLint

Flat config only. This package exports two builders rather than static arrays, so
each workspace can pass its own `tsconfigRootDir` and the type-aware rules read that
workspace's tsconfig instead of one further up the tree.

| Export                        | Builds on     | Used by                      |
| ----------------------------- | ------------- | ---------------------------- |
| `@devsync/config/eslint/base` | —             | `packages/*`, and `apps/web` |
| `@devsync/config/eslint/nest` | `eslint/base` | `apps/api`                   |

```js
// packages/<name>/eslint.config.mjs
import { createBaseConfig } from '@devsync/config/eslint/base';

export default createBaseConfig({ tsconfigRootDir: import.meta.dirname });
```

`createBaseConfig` layers, in order: `@eslint/js` recommended, a Node-globals block
for hand-written `.js`/`.mjs`/`.cjs` tooling files, `typescript-eslint`'s
`recommendedTypeChecked` scoped to TypeScript files only, and finally
`eslint-config-prettier` to switch off anything stylistic.

Only two rules are configured beyond the preset, so this package cannot silently
drift from what `recommendedTypeChecked` already reports as errors
(`no-explicit-any`, the `no-unsafe-*` family, `no-floating-promises`,
`no-misused-promises`, `no-unnecessary-type-assertion`, `require-await`):

- `@typescript-eslint/no-unused-vars`, widened with the conventional `^_` escape
  hatch and extended to caught errors.
- `@typescript-eslint/consistent-type-imports`, which no preset enables.

Type-aware rules apply to `**/*.ts(x)` only. Config files such as
`eslint.config.mjs` and `postcss.config.mjs` sit outside every tsconfig, so they are
linted with the default parser and Node globals — handled deliberately, not ignored.

`createNestConfig` adds NestJS's CommonJS module system, Node globals, and Jest
globals scoped to `*.spec.ts`. It switches `consistent-type-imports` **off for
`apps/api` only**, for the `emitDecoratorMetadata` reason described above; the rule
stays on everywhere else.

`apps/web` composes `eslint-config-next` itself and applies `createBaseConfig`
afterwards, so the repository-wide rules win where the two overlap. Keeping
`eslint-config-next` in `apps/web` avoids pinning this package to a Next.js version.

The shared `ignores` list is where generated output is excluded once for every
workspace: dependencies, build output, `.next`, `.turbo`, coverage, and the
Playwright artefact directories (`test-results`, `playwright-report`,
`blob-report`). A workspace should never need to restate any of them.

## What this package does not own

**Prettier.** Formatting is configured once, at the repository root, in
`prettier.config.mjs`. Prettier already resolves configuration by walking upwards
from each file, so routing it through this package would add indirection without a
second consumer. ESLint does not run Prettier as a rule, so exactly one tool
reformats code.

**Jest configuration.** `apps/api/jest.config.mjs` is self-contained and has exactly
one consumer, so a shared base would add indirection while removing no duplication —
the same argument as for Prettier above.

## Vitest

C1 added the second Vitest workspace — `packages/database`, running data-access code
against a real PostgreSQL in Node, alongside `apps/web` rendering components in jsdom
— which is the trigger this README recorded for moving the runner-agnostic parts
here.

`@devsync/config/vitest/base` exports three values and no builder: the test-file
globs, the directories to skip, and the coverage defaults. A workspace spreads what
it wants and states the rest itself, so its config still reads as its own.

```js
import { coverageDefaults, ignoredDirectories, testFileGlobs } from '@devsync/config/vitest/base';
```

What is deliberately not here: environments, plugins, aliases, setup files, and pool
settings. Those are exactly where the two workspaces differ, and a shared file that
tried to express both would be harder to read than either.

`base.mjs` ships a hand-written `base.d.mts` beside it. This package emits nothing
and is consumed as source, and both importers are type-checked `.mts` files — without
the declarations, a strict `.mts` importing a `.mjs` is an implicit `any`.

**`base.mjs` is named in `files` in `tsconfig.json`, not left to the `vitest/**/*.mjs`
wildcard.** A wildcard drops a `.mjs` whose `.d.mts` sits beside it, because the
declaration wins on extension priority — so until C5 the implementation was the one
file here the compiler never read, and its `// @ts-check` meant nothing outside an
editor. `files` entries are literal and are not subject to that rule, so both are in
the program: the declarations describe the module to its importers, and the
implementation is checked against them. `packages/database` and `tests/restart` each
carry the same entry for the same reason; removing one silently stops checking a file.
