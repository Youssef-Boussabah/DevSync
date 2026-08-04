# syntax=docker/dockerfile:1

# Production image for @devsync/api, and the one-shot migration image beside it.
#
# Build from the REPOSITORY ROOT, never from this directory:
#
#   docker build -f apps/api/Dockerfile .
#
# The context has to be the root because this is a pnpm workspace: the lockfile,
# the workspace definition, and every workspace manifest live there, and a frozen
# install cannot resolve the graph without all of them.

ARG NODE_IMAGE=node:24.13.0-alpine

# --- Base ---------------------------------------------------------------------
FROM ${NODE_IMAGE} AS base
# Corepack installs the exact pnpm pinned by the root `packageManager` field, so
# the image can never disagree with the lockfile about which pnpm wrote it.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo

# --- Manifests ----------------------------------------------------------------
# Shared by every install below, so the manifest layer is fetched and cached once.
# All manifests are copied because pnpm resolves the whole workspace graph before
# it can honour a filter, and a missing one fails the install rather than being
# ignored.
FROM base AS manifests
COPY pnpm-lock.yaml pnpm-workspace.yaml .npmrc package.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/collaboration/package.json packages/collaboration/
COPY packages/config/package.json packages/config/
COPY packages/database/package.json packages/database/
COPY packages/shared/package.json packages/shared/
COPY packages/test-utils/package.json packages/test-utils/
COPY packages/ui/package.json packages/ui/
COPY tests/e2e/package.json tests/e2e/

# --- Build dependencies -------------------------------------------------------
# The full set for `@devsync/api` and everything it depends on, including the dev
# dependencies `nest build` and `prisma generate` need. Nothing from `apps/web`
# or `tests/e2e` is installed.
FROM manifests AS build-deps
RUN pnpm install --frozen-lockfile --filter @devsync/api...

# --- Build --------------------------------------------------------------------
FROM build-deps AS builder
# `@devsync/config` owns the TypeScript configuration both workspaces extend —
# including `emitDecoratorMetadata`, without which Nest's dependency injection
# fails at runtime — so the build needs its files and not merely its manifest.
COPY packages/config packages/config
COPY packages/database packages/database
COPY apps/api apps/api

# The data layer first, and its client before that: `apps/api` compiles against
# `packages/database/dist`, which does not exist until both have run. Generation
# reads the schema and nothing else, so no database is involved in a build.
RUN pnpm --filter @devsync/database run generate \
  && pnpm --filter @devsync/database run build \
  && pnpm --filter @devsync/api run build

# --- Runtime dependencies -----------------------------------------------------
# Resolved from the same lockfile, but `--prod`, so the compiler, the Nest CLI,
# the Prisma CLI, Jest, and Supertest never reach the runtime image.
#
# Two explicit filters rather than the `...` suffix the build stage uses. That
# suffix would pull in every workspace package on a dependency edge of any kind,
# including the dev-only one to `@devsync/config` — and with it that package's own
# dependencies: `typescript-eslint`, and through it tens of megabytes of
# TypeScript that nothing at runtime can even resolve. Naming the two packages
# that genuinely run in production keeps the image both smaller and honest.
FROM manifests AS prod-deps
RUN pnpm install --frozen-lockfile --prod --filter @devsync/api --filter @devsync/database

# --- Migration ----------------------------------------------------------------
# The one-shot service Compose runs before the API starts. It is deliberately not
# the runtime image: it carries the Prisma CLI and the schema engine, which the
# API has no use for and should not ship.
FROM manifests AS migrate-deps
RUN pnpm install --frozen-lockfile --filter @devsync/database

FROM migrate-deps AS migrate
# Only what `prisma migrate deploy` reads: the schema, the committed migrations,
# and the CLI configuration that points at both.
COPY packages/database/prisma packages/database/prisma
COPY packages/database/prisma.config.ts packages/database/
COPY packages/database/tools packages/database/tools
WORKDIR /repo/packages/database
USER node
# `deploy`, never `dev`: it applies committed migrations and creates none. A
# non-zero exit is what stops the API from starting against a schema that is not
# there.
CMD ["pnpm", "exec", "prisma", "migrate", "deploy"]

# --- Runtime ------------------------------------------------------------------
# A clean Node image: no pnpm, no Corepack cache, no TypeScript sources, no
# Prisma CLI.
FROM ${NODE_IMAGE} AS runner
WORKDIR /repo/apps/api

ENV NODE_ENV=production
# The existing configuration contract, unchanged: the API reads `API_PORT` and
# falls back to 3001. `DATABASE_URL` has no fallback and is passed by Compose;
# without it the process refuses to start.
ENV API_PORT=3001

# Every `node_modules` tree is needed, and each must keep its original relative
# position: pnpm links a package's dependencies to the content-addressed store
# under `/repo/node_modules/.pnpm` with relative symlinks, which only resolve if
# the layout is preserved. `apps/api/node_modules/@devsync/database` is one of
# those links, and it points at the compiled package copied in below.
COPY --from=prod-deps --chown=node:node /repo/node_modules /repo/node_modules
COPY --from=prod-deps --chown=node:node /repo/apps/api/node_modules ./node_modules
COPY --from=prod-deps --chown=node:node /repo/packages/database/node_modules /repo/packages/database/node_modules
COPY --from=prod-deps --chown=node:node /repo/packages/database/package.json /repo/packages/database/package.json

# Compiled JavaScript only, for both workspaces. `packages/database/dist`
# contains the generated Prisma Client, compiled with the rest of the package —
# no `.ts` file is ever loaded at runtime.
COPY --from=builder --chown=node:node /repo/packages/database/dist /repo/packages/database/dist
COPY --from=builder --chown=node:node /repo/apps/api/dist ./dist
COPY --chown=node:node apps/api/package.json ./package.json

# `node` (uid 1000) ships with the official image; nothing here needs root.
USER node
EXPOSE 3001

# Exec form, so the service is the container's own process and receives signals
# directly rather than through a shell. Compose runs it under an init process
# (`init: true`), which is what forwards SIGTERM and makes shutdown prompt — and
# what gives the application time to close its connection pool.
CMD ["node", "dist/main.js"]
