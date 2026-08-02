# @devsync/ui

Reusable interface components shared across DevSync front-ends.

## Future responsibility

- Presentational primitives and layout components.
- Editor-adjacent interface pieces such as presence indicators and file trees.
- The shared styling contract these components assume.

## Current state

Boundary only. No components exist, and no React or styling dependencies are
installed here. A component belongs in this package once a second consumer needs
it — not before.
