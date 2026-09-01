# syntax=docker/dockerfile:1.7
#
# Production image for the SellPilot background worker — the process that
# consumes the BullMQ queue and actually runs the AI agent (DM replies, comment
# replies, order notifications, and the self-rescheduling billing sweeps).
#
# Build from the REPO ROOT, not this directory:
#
#   docker build -f apps/worker/Dockerfile -t sellpilot-worker .
#
# There is no compile step. Every @acme/* package resolves to TypeScript source
# at runtime (see the "default" condition in each package.json#exports), so a
# `tsc` build would emit JavaScript that still imports .ts files and could not
# be loaded by bare node. The worker runs under tsx instead — exactly what
# `pnpm --filter @acme/worker start` already does.

ARG NODE_VERSION=22-bookworm-slim


# ---------------------------------------------------------------------------
# base
# ---------------------------------------------------------------------------
FROM node:${NODE_VERSION} AS base

ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH

RUN corepack enable && corepack prepare pnpm@10.19.0 --activate

WORKDIR /app


# ---------------------------------------------------------------------------
# builder — full install, then extract a self-contained worker tree
# ---------------------------------------------------------------------------
FROM base AS builder

COPY . .

# `pnpm deploy` is what keeps this image from being ~1.9GB. Neither of the
# obvious alternatives works here:
#
#   * `pnpm install --filter "@acme/worker..."` prunes each package's
#     node_modules links but still hydrates the entire lockfile into
#     node_modules/.pnpm — all 1127 packages, including Next.js and its two
#     132MB SWC binaries, which no worker code path can even reach
#     (`pnpm why next` reports nothing).
#   * `turbo prune` rewrites the lockfile's `importers` but leaves its
#     `packages`/`snapshots` sections intact, so pnpm materialises everything
#     regardless.
#
# deploy resolves the worker's actual subgraph and copies it into one
# self-contained directory: 598MB instead of 1.2GB. --legacy is required from
# pnpm v10 onward for workspaces that don't set inject-workspace-packages.
#
# --ignore-scripts on both commands suppresses the root postinstall
# (`pnpm dlx sherif@latest`), a workspace linter fetched from the network that
# has no business running in an image build and fails it on any host without
# registry access. The rebuild then restores the one dependency build script
# that matters at runtime: esbuild, which tsx shells out to.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --ignore-scripts \
 && pnpm deploy --legacy --filter @acme/worker --prod --ignore-scripts /prod/worker \
 && cd /prod/worker && pnpm rebuild esbuild


# ---------------------------------------------------------------------------
# runner
# ---------------------------------------------------------------------------
FROM base AS runner

ENV NODE_ENV=production

# The deployed tree is already flattened: src/ at the root, with every @acme/*
# package resolved into its own node_modules. Nothing from the builder's full
# 1.2GB install comes along.
COPY --from=builder --chown=node:node /prod/worker ./

USER node

# src/index.ts starts the health server only when WORKER_HEALTH_PORT is set
# (see the schema comment in src/env.ts). docker-compose.yml sets it to 3001.
EXPOSE 3001

# No curl/wget in the slim image; Node 22 has a global fetch. Exits 0 when the
# health server is disabled, so an unset port reports healthy rather than
# flapping the container.
HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
    CMD node -e "const p=process.env.WORKER_HEALTH_PORT; if(!p) process.exit(0); fetch('http://127.0.0.1:'+p+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# `node --import tsx` rather than the tsx CLI or `pnpm exec`: it keeps node as
# PID 1 so SIGTERM reaches the process directly. The worker's graceful shutdown
# (queue.close()) hangs off SIGTERM/SIGINT, and a wrapper process swallowing
# them would turn every deploy into a hard kill mid-job.
CMD ["node", "--import", "tsx", "src/index.ts"]
