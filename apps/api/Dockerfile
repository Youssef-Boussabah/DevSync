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
#
# Every workspace manifest is copied, deliberately: pnpm reads the whole workspace
# graph before it applies a filter, so the install should see the same graph the
# repository has.
#
# **A manifest missing for a workspace nothing here depends on does not necessarily
# fail the install.** C5 found `tests/restart` absent from this list and the frozen
# install resolving 10 of the repository's 11 workspace projects without a word
# about it. The omission is therefore silent, and the rule has to be kept by hand:
# **a new workspace must be added here and to `apps/web/Dockerfile`.**
#
# Copying a manifest installs nothing from that workspace. The `--filter` on each
# install below is what decides what is installed, and it is what keeps every
# unrelated workspace's dependencies and source out of the image.
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
COPY tests/restart/package.json tests/restart/

# --- Build dependencies -------------------------------------------------------
# The full set for `@devsync/api` and everything it depends on, including the dev
# dependencies `nest build` and `prisma generate` need. Nothing from `apps/web`
# or `tests/e2e` is installed.
FROM manifests AS build-deps
RUN pnpm install --frozen-lockfile --filter @devsync/api...

# --- Build --------------------------------------------------------------------
FROM build-deps AS builder
# `@devsync/config` owns the TypeScript configuration every workspace extends —
# including `emitDecoratorMetadata`, without which Nest's dependency injection
# fails at runtime — so the build needs its files and not merely its manifest.
COPY packages/config packages/config
COPY packages/database packages/database
COPY packages/shared packages/shared
COPY apps/api apps/api

# Both packages before the application, and the Prisma client before the data
# layer: `apps/api` compiles against `packages/database/dist` and
# `packages/shared/dist`, neither of which exists until its own build has run.
# Generation reads the schema and nothing else, so no database is involved in a
# build.
RUN pnpm --filter @devsync/database run generate \
  && pnpm --filter @devsync/database run build \
  && pnpm --filter @devsync/shared run build \
  && pnpm --filter @devsync/api run build

# --- Runtime dependencies -----------------------------------------------------
# Resolved from the same lockfile, but `--prod`, so the compiler, the Nest CLI,
# Jest, and Supertest never reach the runtime image.
#
# Explicit filters rather than the `...` suffix the build stage uses. That suffix
# would pull in every workspace package on a dependency edge of any kind,
# including the dev-only one to `@devsync/config` — and with it that package's own
# dependencies: `typescript-eslint`, and through it tens of megabytes of
# TypeScript that nothing at runtime can even resolve. Naming the three packages
# that genuinely run in production keeps the image both smaller and honest.
#
# `@devsync/shared` joined the list in C2, and brings Zod with it: the API
# validates every request against the schemas that package publishes.
#
# `--no-optional` is what keeps the Prisma CLI and the TypeScript compiler out.
# `@prisma/client` declares both as *optional peer dependencies*, and because
# `packages/database` legitimately has both as devDependencies — it runs
# `prisma generate` and `tsc` — pnpm resolves those peers and records them in the
# lockfile as `optionalDependencies` of the `@prisma/client` snapshot:
#
#   '@prisma/client@7.9.1(prisma@7.9.1(…)(typescript@5.9.3))(typescript@5.9.3)':
#     optionalDependencies:
#       prisma: 7.9.1(…)
#       typescript: 5.9.3
#
# `@prisma/client` is a production dependency, so `--prod` alone installs that
# snapshot and its optional edges with it. Declining the optional edges is the
# supported way to say "the runtime does not need them", and it takes ~140
# packages with them — the Prisma CLI, its schema engine, Prisma Studio and the
# React, d3, and visx tree behind it, plus the mysql2, postgres, and pglite
# drivers this project does not use. `pg-cloudflare` goes too; it is a Cloudflare
# Workers socket shim that `pg` loads in a try/catch and never needs on Node.
#
# This flag is deliberately scoped to the production install. Setting
# `autoInstallPeers: false` repository-wide does nothing here — the peers are
# declared rather than missing, so pnpm resolves them either way — and the
# development install must keep both packages, because that is where they are used.
FROM manifests AS prod-deps
RUN pnpm install --frozen-lockfile --prod --no-optional \
  --filter @devsync/api \
  --filter @devsync/database \
  --filter @devsync/shared

# --- Migration ----------------------------------------------------------------
# The one-shot service Compose runs before the API starts. It is deliberately not
# the runtime image: it carries the Prisma CLI and the schema engine, which the
# API has no use for and should not ship.
#
# No `--prod` and no `--no-optional` here, and that is the point — this is the one
# stage that is supposed to have the CLI.
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
# A clean Node image: no pnpm, no Corepack cache, no TypeScript source, no
# compiler, no Prisma CLI, and no test runner — not on PATH, not linked into a
# workspace, and not sitting unreferenced in the pnpm store either. The
# `--no-optional` above is what makes that true rather than approximately true.
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
# the layout is preserved. `apps/api/node_modules/@devsync/database` and
# `…/@devsync/shared` are two of those links, and they point at the compiled
# packages copied in below. `packages/shared/node_modules` is where Zod is linked.
COPY --from=prod-deps --chown=node:node /repo/node_modules /repo/node_modules
COPY --from=prod-deps --chown=node:node /repo/apps/api/node_modules ./node_modules
COPY --from=prod-deps --chown=node:node /repo/packages/database/node_modules /repo/packages/database/node_modules
COPY --from=prod-deps --chown=node:node /repo/packages/database/package.json /repo/packages/database/package.json
COPY --from=prod-deps --chown=node:node /repo/packages/shared/node_modules /repo/packages/shared/node_modules
COPY --from=prod-deps --chown=node:node /repo/packages/shared/package.json /repo/packages/shared/package.json

# Compiled JavaScript only, for all three workspaces. `packages/database/dist`
# contains the generated Prisma Client, compiled with the rest of the package, and
# `packages/shared/dist` the request and response schemas — no `.ts` file is ever
# loaded at runtime.
COPY --from=builder --chown=node:node /repo/packages/database/dist /repo/packages/database/dist
COPY --from=builder --chown=node:node /repo/packages/shared/dist /repo/packages/shared/dist
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
