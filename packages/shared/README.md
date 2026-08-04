# @devsync/shared

The contracts `apps/web` and `apps/api` have to agree on.

Every runtime schema here and the TypeScript type beside it come from **one** Zod
definition, so the check that runs and the type that compiles cannot drift apart.
That is the whole reason this package exists: client and server disagreeing about a
wire format is the failure the monorepo was chosen to prevent.

**C2 filled it.** `apps/api` is the first consumer, and validates every request
against these schemas. `apps/web` becomes the second in C3 — it consumes nothing
from here yet.

## What it exports

| Area            | Exports                                                                                                                                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Languages**   | `SUPPORTED_LANGUAGE_IDS`, `languageIdSchema`, `LanguageId`                                                                                                                                                          |
| **Identifiers** | `projectIdSchema`, `fileIdSchema`, `projectParamsSchema`, `projectFileParamsSchema`, `ProjectParams`, `ProjectFileParams`                                                                                           |
| **Requests**    | `createProjectRequestSchema`, `updateProjectRequestSchema`, `createProjectFileRequestSchema`, `updateProjectFileRequestSchema`, and the type inferred from each                                                     |
| **Resources**   | `projectResourceSchema`, `projectListSchema`, `projectDetailResourceSchema`, `projectFileSummaryResourceSchema`, `projectFileSummaryListSchema`, `projectFileResourceSchema`, `utcTimestampSchema`, and their types |
| **Errors**      | `API_ERROR_CODES`, `apiErrorCodeSchema`, `apiIssuePathSegmentSchema`, `apiIssuePathSchema`, `apiIssueSchema`, `apiErrorResourceSchema`, and their types                                                             |
| **Parsing**     | `parseContract`, `ContractSchema`, `ContractValue`, `ContractResult`                                                                                                                                                |

```ts
import { createProjectRequestSchema, parseContract } from '@devsync/shared';

const result = parseContract(createProjectRequestSchema, body);

if (!result.ok) {
  // result.issues is already the shape an error response carries.
}
```

`parseContract` is the only way a consumer needs to run a schema. It returns the
parsed value or the issues, never throwing, and it converts Zod's own issue objects
into the `{ path, message }` shape the error contract publishes — so Zod stays an
implementation detail of this package rather than a dependency every consumer has
to install, pin, and keep in step.

## What is deliberately not here

- **No server-only code.** No environment loading, no database, no NestJS, no
  React. This package ships in the browser bundle from C3, and a package that reads
  configuration cannot safely do that.
- **No presentation.** Language identifiers, yes; the labels a user reads
  (`TypeScript`) and the file names a client shows (`main.ts`) belong to whichever
  interface is doing the showing.
- **No dependency on another workspace.** It imports nothing from `apps/*` or from
  `@devsync/database`.
- **No response envelope.** Routes answer with resources and arrays directly. A
  `{ data: … }` wrapper would be a shape invented for a problem nobody has.

## Format

The package **builds**, to CommonJS, and its `exports` map points at
`dist/index.js` and the emitted declarations — not at `src/index.ts`, the way the
reserved packages are consumed.

Both halves are forced by the consumer rather than chosen. It has to build because
it runs inside the API's production container, where there is no compiler. It has
to be CommonJS because `apps/api` compiles to CommonJS and its ts-jest suite loads
modules through a CommonJS registry that cannot `require` an ES module. It is the
same reasoning that made `@devsync/database` a built CommonJS package in C1, and it
extends `@devsync/config/tsconfig.library.json` for the same reason.

CommonJS is fine for the Next.js consumer that arrives in C3; a second output
format waits for a consumer that proves it necessary.

## Testing

```bash
pnpm --filter @devsync/shared test
```

100 Vitest tests, in Node, over the schemas themselves — trimming, length
boundaries, defaults, strictness, the language list, the identifier format, the
timestamp format, and the error contract. They start nothing and build nothing, so
they run in `pnpm test`.
