// The single source of truth for formatting in this repository.
//
// Prettier resolves configuration by walking upwards from each file, and no
// workspace declares its own, so every file in the monorepo is formatted by this
// one config. Formatting is applied only by `pnpm format`; `pnpm format:check` is
// read-only, and ESLint deliberately does not run Prettier as a lint rule, so
// there is exactly one thing that reformats code.

/** @type {import('prettier').Config} */
const config = {
  semi: true,
  singleQuote: true,
  trailingComma: 'all',
  printWidth: 100,
  tabWidth: 2,
  // Paired with `* text=auto eol=lf` in .gitattributes, so checkouts and format
  // checks behave the same on Windows, macOS, and Linux.
  endOfLine: 'lf',
};

export default config;
