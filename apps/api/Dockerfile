# syntax=docker/dockerfile:1

# Production image for @devsync/api.
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
# Shared by both installs below, so the manifest layer is fetched and cached once.
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
# The full set for `@devsync/api`, including the dev dependencies `nest build`
# needs. Nothing from `apps/web` or `tests/e2e` is installed.
FROM manifests AS build-deps
RUN pnpm install --frozen-lockfile --filter @devsync/api...

# --- Build --------------------------------------------------------------------
FROM build-deps AS builder
# `@devsync/config` owns the TypeScript configuration `apps/api` extends —
# including `emitDecoratorMetadata`, without which Nest's dependency injection
# fails at runtime — so the build needs its files and not merely its manifest.
COPY packages/config packages/config
COPY apps/api apps/api
RUN pnpm --filter @devsync/api build

# --- Runtime dependencies -----------------------------------------------------
# Resolved from the same lockfile, but `--prod`, so the compiler, the Nest CLI,
# Jest, and Supertest never reach the runtime image.
#
# No `...` suffix here, unlike the build stage above. That suffix pulls in the
# workspace packages `@devsync/api` depends on, and it does so regardless of
# whether the edge is a dev dependency — which drags `@devsync/config` in, and
# with it that package's own dependencies: `typescript-eslint`, and through it
# 22 MB of TypeScript that nothing at runtime can even resolve. `@devsync/api`
# has no workspace dependency it needs in production, so the plain filter is both
# smaller and more honest.
FROM manifests AS prod-deps
RUN pnpm install --frozen-lockfile --prod --filter @devsync/api

# --- Runtime ------------------------------------------------------------------
# A clean Node image: no pnpm, no Corepack cache, no TypeScript sources.
FROM ${NODE_IMAGE} AS runner
WORKDIR /repo/apps/api

ENV NODE_ENV=production
# The existing configuration contract, unchanged: `main.ts` reads `API_PORT` and
# falls back to 3001. Compose passes it explicitly rather than relying on a `.env`
# file, because this repository still loads none.
ENV API_PORT=3001

# Both trees are needed and both must keep their original relative positions:
# pnpm links `apps/api/node_modules/*` to the content-addressed store under
# `/repo/node_modules/.pnpm` with relative symlinks, which only resolve if the
# layout is preserved.
COPY --from=prod-deps --chown=node:node /repo/node_modules /repo/node_modules
COPY --from=prod-deps --chown=node:node /repo/apps/api/node_modules ./node_modules
COPY --from=builder --chown=node:node /repo/apps/api/dist ./dist
COPY --chown=node:node apps/api/package.json ./package.json

# `node` (uid 1000) ships with the official image; nothing here needs root.
USER node
EXPOSE 3001

# Exec form, so the service is the container's own process and receives signals
# directly rather than through a shell. Compose runs it under an init process
# (`init: true`), which is what forwards SIGTERM and makes shutdown prompt.
CMD ["node", "dist/main.js"]
