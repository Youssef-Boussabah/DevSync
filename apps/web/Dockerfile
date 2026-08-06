# syntax=docker/dockerfile:1

# Production image for @devsync/web.
#
# Build from the REPOSITORY ROOT, never from this directory:
#
#   docker build -f apps/web/Dockerfile .
#
# The context has to be the root because this is a pnpm workspace: the lockfile,
# the workspace definition, and every workspace manifest live there, and a frozen
# install cannot resolve the graph without all of them.

ARG NODE_IMAGE=node:24.13.0-alpine

# --- Base ---------------------------------------------------------------------
FROM ${NODE_IMAGE} AS base
# Recommended by Next.js for Alpine: its native binaries — and sharp, which pnpm
# is explicitly allowed to build — expect glibc symbols that musl provides here.
RUN apk add --no-cache libc6-compat
# Corepack installs the exact pnpm pinned by the root `packageManager` field, so
# the image can never disagree with the lockfile about which pnpm wrote it.
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo

# --- Dependencies -------------------------------------------------------------
# Manifests only, so this layer survives every source change.
#
# All of them are copied, deliberately: pnpm reads the whole workspace graph before
# it applies a filter, so the install should see the same graph the repository has.
#
# **A manifest missing for a workspace nothing here depends on does not necessarily
# fail the install.** C5 found `tests/restart` absent from this list and the frozen
# install resolving 10 of the repository's 11 workspace projects without a word
# about it. The omission is therefore silent, and the rule has to be kept by hand:
# **a new workspace must be added here and to `apps/api/Dockerfile`.**
#
# Copying a manifest installs nothing from that workspace — the `--filter` below is
# what decides that.
FROM base AS deps
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
# `--filter @devsync/web...` installs the web application and its dependencies and
# nothing else: no NestJS, no Jest, no Playwright. That is also why no browser is
# ever downloaded into an application image. From C3 it also installs
# `@devsync/shared`, which `apps/web` now imports the request and response
# contracts from.
RUN pnpm install --frozen-lockfile --filter @devsync/web...

# --- Build --------------------------------------------------------------------
FROM deps AS builder

# Where the browser will reach the API. **Embedded into the JavaScript this build
# emits**, so it is a build argument rather than a runtime variable: an image built
# for one API origin cannot be pointed at another by restarting it with a different
# environment. Compose passes the value; there is no default, because a wrong
# default would produce an image that looks fine and cannot save anything.
#
# It must be an address the **user's browser** can resolve. A Compose service name
# such as `http://api:3001` resolves only inside the Compose network, and the
# browser is not in it.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# `@devsync/config` owns the TypeScript configuration both workspaces extend, so
# the build needs its files and not merely its manifest. `packages/shared` is
# built first: `apps/web` resolves it through its `exports` map to `dist`, which
# does not exist until its own build has run.
COPY packages/config packages/config
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN pnpm --filter @devsync/shared build \
  && pnpm --filter @devsync/web build

# --- Runtime ------------------------------------------------------------------
# A clean Node image. No pnpm, no Corepack cache, no sources, no dev
# dependencies, no build cache — only what the server actually loads.
FROM ${NODE_IMAGE} AS runner
RUN apk add --no-cache libc6-compat
WORKDIR /repo

ENV NODE_ENV=production
# Both are read by the standalone server. HOSTNAME is what makes it listen on
# every interface: left at loopback it would be unreachable from outside the
# container, however the port is published.
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# `output: "standalone"` traces the modules the application actually reaches and
# emits a self-contained tree that carries its own `node_modules`. Static assets
# are the one thing tracing does not place, so they are copied separately. This
# application has no `public/` directory, so none is copied.
COPY --from=builder --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=builder --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static

# `node` (uid 1000) ships with the official image; nothing here needs root.
USER node
EXPOSE 3000

# Exec form, so the server is the container's own process and receives signals
# directly rather than through a shell. Compose runs it under an init process
# (`init: true`), which is what forwards SIGTERM and makes shutdown prompt.
CMD ["node", "apps/web/server.js"]
