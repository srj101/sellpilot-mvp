# syntax=docker/dockerfile:1.7
#
# Production image for the SellPilot web app (Next.js 16, App Router).
#
# Build from the REPO ROOT, not this directory — the build needs the pnpm
# workspace manifests and every packages/* source tree:
#
#   docker build -f apps/nextjs/Dockerfile -t sellpilot-web .
#
# Debian slim, not alpine, on purpose: the toolchain pulls several native
# modules (@tailwindcss/oxide, lightningcss, esbuild) whose prebuilt binaries
# are glibc-only. musl forces a source build or silently missing bindings.

ARG NODE_VERSION=22-bookworm-slim


# ---------------------------------------------------------------------------
# base — pnpm, pinned to the version in package.json#packageManager
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS base

ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NEXT_TELEMETRY_DISABLED=1

RUN corepack enable && corepack prepare pnpm@10.19.0 --activate

WORKDIR /app


# ---------------------------------------------------------------------------
# deps — install once, cached until a manifest or the lockfile changes
# ---------------------------------------------------------------------------
FROM base AS deps

# Only the manifests, so editing application source doesn't bust the install
# layer. Every workspace member listed in pnpm-workspace.yaml must appear here
# or pnpm refuses the frozen lockfile.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json ./
COPY apps/nextjs/package.json          apps/nextjs/
COPY apps/worker/package.json          apps/worker/
COPY packages/ai-agent/package.json    packages/ai-agent/
COPY packages/api/package.json         packages/api/
COPY packages/auth/package.json        packages/auth/
COPY packages/db/package.json          packages/db/
COPY packages/env/package.json         packages/env/
COPY packages/messaging/package.json   packages/messaging/
COPY packages/queue/package.json       packages/queue/
COPY packages/ui/package.json          packages/ui/
COPY packages/validators/package.json  packages/validators/
COPY tooling/eslint/package.json       tooling/eslint/
COPY tooling/github/package.json       tooling/github/
COPY tooling/prettier/package.json     tooling/prettier/
COPY tooling/tailwind/package.json     tooling/tailwind/
COPY tooling/typescript/package.json   tooling/typescript/

# --ignore-scripts suppresses the root `postinstall` (pnpm lint:ws), which
# shells out to `pnpm dlx sherif@latest` — a network fetch of a workspace
# linter that has no business running inside an image build and would fail it
# on any host without registry access.
#
# The rebuild then restores the dependency build scripts that were skipped.
# It names the packages explicitly rather than using `pnpm rebuild -r`, which
# re-runs workspace *project* scripts too and so drags the sherif fetch back in.
# These are exactly pnpm-workspace.yaml#onlyBuiltDependencies plus lightningcss
# (Tailwind v4's native CSS transformer, pinned in the root overrides).
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts \
 && pnpm rebuild esbuild @tailwindcss/oxide lightningcss


# ---------------------------------------------------------------------------
# builder — next build → .next/standalone
# ---------------------------------------------------------------------------
FROM deps AS builder

COPY . .

# NEXT_PUBLIC_* values are inlined into the client bundle at build time, so
# they are build arguments, not runtime env. Changing one requires a rebuild;
# setting it only in docker-compose's `environment` block has no effect on the
# browser bundle. They are not secrets (they ship to every visitor anyway).
ARG NEXT_PUBLIC_FACEBOOK_APP_ID=""
ARG NEXT_PUBLIC_FACEBOOK_CONFIG_ID=""
ARG NEXT_PUBLIC_INSTAGRAM_CONFIG_ID=""
ARG NEXT_PUBLIC_WHATSAPP_CONFIG_ID=""
ARG NEXT_PUBLIC_WHATSAPP_REDIRECT_URI=""

ENV NEXT_PUBLIC_FACEBOOK_APP_ID=$NEXT_PUBLIC_FACEBOOK_APP_ID \
    NEXT_PUBLIC_FACEBOOK_CONFIG_ID=$NEXT_PUBLIC_FACEBOOK_CONFIG_ID \
    NEXT_PUBLIC_INSTAGRAM_CONFIG_ID=$NEXT_PUBLIC_INSTAGRAM_CONFIG_ID \
    NEXT_PUBLIC_WHATSAPP_CONFIG_ID=$NEXT_PUBLIC_WHATSAPP_CONFIG_ID \
    NEXT_PUBLIC_WHATSAPP_REDIRECT_URI=$NEXT_PUBLIC_WHATSAPP_REDIRECT_URI

# next.config.js validates env at build time via jiti (@t3-oss/env-nextjs).
# Server secrets (POSTGRES_URL, FACEBOOK_APP_SECRET, ...) are deliberately
# absent from the build — they are injected at run time — so validation is
# skipped here. src/env.ts already honours this flag.
ENV SKIP_ENV_VALIDATION=1 \
    NODE_ENV=production

# Skipping validation also skips the Zod *defaults*, which is a sharp edge:
# `next build` evaluates every route module to collect page data, and
# src/app/api/meta/webhook/route.ts calls createQueue() at module scope. With
# QUEUE_PROVIDER unset that reads as undefined rather than its "memory"
# default and the build dies with `Unknown queue provider: undefined`.
#
# Build-time only — nothing here is baked into the output. The runtime
# container does not set SKIP_ENV_VALIDATION, so the real schema (defaults
# included) applies there and docker-compose.yml supplies QUEUE_PROVIDER=redis.
ENV QUEUE_PROVIDER=memory

# `next build` directly rather than `pnpm --filter @acme/nextjs build`: the
# package script wraps it in `dotenv -e ../../.env`, and .env is excluded from
# the build context (see .dockerignore), which would abort the build.
RUN pnpm --filter @acme/nextjs exec next build


# ---------------------------------------------------------------------------
# runner — standalone server only
# ---------------------------------------------------------------------------
FROM base AS runner

ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# The standalone bundle reproduces the monorepo layout: server entrypoint at
# apps/nextjs/server.js, with a pruned node_modules and the traced packages/*
# beside it. Static assets and public/ are NOT traced and must be copied in
# separately — miss them and the app boots but serves no CSS or JS.
COPY --from=builder --chown=node:node /app/apps/nextjs/.next/standalone ./
COPY --from=builder --chown=node:node /app/apps/nextjs/.next/static      ./apps/nextjs/.next/static
COPY --from=builder --chown=node:node /app/apps/nextjs/public            ./apps/nextjs/public

USER node

EXPOSE 3000

# No curl/wget in the slim image; Node 22 has a global fetch.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/nextjs/server.js"]
