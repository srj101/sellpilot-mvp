# Running SellPilot

One stack, run identically in local and production:

```bash
docker compose up -d --build
```

- Web app: <http://localhost:3000>
- Worker health: <http://localhost:3001/health> (loopback only)

There is deliberately **no dev variant** — no `dev.sh`, no profiles, no override
file. Local runs the same images, the same `NODE_ENV`, the same queue and the same
object store as production. The only thing that differs is `.env`: the domain in
`APP_URL`, which AWS credentials, which Neon branch.

That is the whole point. Every dev-only substitute — an in-memory queue, a MinIO
stand-in for S3, a self-hosted Whisper container — is a place where local can pass
and production fail. They were removed rather than made switchable.

## What's in the stack

| Service | Image | Purpose |
|---|---|---|
| `web` | built from `apps/nextjs` | Dashboard, tRPC, Meta webhooks, `/pay` checkout |
| `worker` | built from `apps/worker` | AI replies, order notifications, billing sweeps |
| `redis` | `redis:7-alpine` | `product-images` indexing queue (BullMQ) |

Redis backs every queue. Note `packages/api/src/lib/queue.ts` runs the
image-indexing queue on BullMQ *directly*, outside the `@acme/queue` abstraction,
so Redis is required no matter what `QUEUE_PROVIDER` says.

## What's outside the stack — in both environments

**Postgres — Neon.** `packages/db/src/client.ts` uses `@vercel/postgres`, which
speaks Neon's WebSocket protocol and cannot reach a plain `postgres` container.
Use a **Neon branch** for local: same engine, same extensions (pgvector), same
schema, but writes don't touch production. Point `POSTGRES_URL` at the branch and
nothing else changes.

**S3 and SES — real AWS.** One IAM credential covers both. `AWS_ENDPOINT_URL`
must stay unset: it is a LocalStack escape hatch shared by every AWS client at
once, so setting it breaks real S3 and real email together.

**Transcription — OpenAI.** `TRANSCRIPTION_BASE_URL` defaults to
`https://api.openai.com/v1/audio/transcriptions` and the key falls back to
`OPENAI_API_KEY`, so voice messages transcribe through the same service in both
environments. Any OpenAI-compatible endpoint is a URL change with no code change.

## Environment

Secrets come from `.env` via compose's `env_file`, never baked into an image —
`.dockerignore` excludes `.env` from the build context.

Compose overrides only what is a property of *running in this stack*. Everything
else — `QUEUE_PROVIDER`, `APP_URL`, transcription, all credentials — comes from
`.env`, so there is one place to look and no hidden divergence.

| Overridden | Value | Why |
|---|---|---|
| `NODE_ENV` | `production` | including locally — that's the parity |
| `REDIS_HOST` | `redis` | service name, not `localhost` |
| `AWS_ACCESS_KEY_ID` | — | single credential in `.env`, used by both services for S3 and SES |
| `WORKER_HEALTH_PORT` | `3001` | `src/index.ts` starts the health server only when set |

### `NEXT_PUBLIC_*` is build-time

Next.js inlines these into the browser bundle at build time, so compose passes
them as **build args**. Changing one needs `docker compose up -d --build` — a
restart does nothing, and setting it only under `environment:` leaves the browser
with `undefined` and the Facebook/WhatsApp connect buttons silently failing.

### Going to production

Set the real values in `.env` on the host and run the same command:

```bash
APP_URL=https://your-domain.com
BETTER_AUTH_URL=https://your-domain.com
POSTGRES_URL=<production Neon branch>
SSLCOMMERZ_IS_SANDBOX=false
```

`APP_URL` is the one people forget. It builds the `/pay/{token}` links the AI
agent sends customers and the SSLCommerz `success`/`fail`/`ipn` callbacks — left
at `localhost`, customers receive payment links that resolve to nothing.

Meta webhooks additionally need a public HTTPS origin: `/api/meta/webhook`
verifies an `X-Hub-Signature-256` HMAC and must be reachable from Meta's servers,
so put a TLS-terminating reverse proxy in front of `web`.

## Image design notes

**Debian slim, not Alpine.** The toolchain pulls native modules
(`@tailwindcss/oxide`, `lightningcss`, `esbuild`) whose prebuilt binaries are
glibc-only; musl forces a source build or silently missing bindings.

**The web image ships `.next/standalone`** (~484MB). `next.config.js` sets
`output: "standalone"` plus `outputFileTracingRoot` at the workspace root — that
second setting is required in a pnpm monorepo, or tracing misses everything
resolved through `node_modules/.pnpm` and the app builds fine but crashes at boot
with `MODULE_NOT_FOUND`. Static assets and `public/` aren't traced and are copied
separately.

**The worker image uses `pnpm deploy`** (~1.15GB, down from 1.93GB). It runs under
`tsx` rather than compiled JS, because every `@acme/*` package resolves to
TypeScript source at runtime via the `"default"` condition in its `exports` map —
`tsc` would emit JavaScript that still imports `.ts` files. Getting the size down
was not obvious:

- `pnpm install --filter "@acme/worker..."` prunes each package's `node_modules`
  links but still hydrates the whole lockfile into `node_modules/.pnpm` — all 1127
  packages, Next.js and its two 132MB SWC binaries included, none of which the
  worker can reach (`pnpm why next` reports nothing).
- `turbo prune` rewrites the lockfile's `importers` but leaves its
  `packages`/`snapshots` sections intact, so pnpm materialises everything anyway.
- `pnpm deploy --legacy` resolves the actual subgraph. `--legacy` is required from
  pnpm v10 for workspaces that don't set `inject-workspace-packages`.

Both images run as the non-root `node` user with `init: true`, and `node` stays
PID 1 so `SIGTERM` reaches the worker's `queue.close()` path directly rather than
being swallowed by a wrapper.

**Build scripts are disabled during install** (`--ignore-scripts`). The root
`postinstall` shells out to `pnpm dlx sherif@latest`, a workspace linter fetched
from the network that would fail the build on any host without registry access.
`pnpm rebuild esbuild ...` afterwards restores only the build scripts that matter
at runtime. `pnpm rebuild -r` does *not* work — it re-runs workspace project
scripts and drags the sherif fetch back in.

**Build-time env placeholders.** The web Dockerfile sets `SKIP_ENV_VALIDATION=1`
so server secrets aren't needed to build. That also skips Zod's *defaults*, which
is why it additionally sets `QUEUE_PROVIDER=memory` — `next build` evaluates every
route module, and `api/meta/webhook/route.ts` calls `createQueue()` at module
scope. Nothing leaks into the output; the runtime container doesn't set
`SKIP_ENV_VALIDATION`. Any future module-scope read of a defaulted env var fails
the build the same way and needs the same one-line placeholder.

## Operations

```bash
docker compose up -d --build          # start / apply changes
docker compose up -d --scale worker=3 # scale the worker
docker compose logs -f worker
docker compose ps                     # health status
docker compose down                   # stop, keep the redis volume
docker compose down -v                # stop and delete redis data
```

The self-rescheduling sweeps use fixed job IDs so replicas converge on one chain
rather than each starting its own, and the cancel-and-restart logic in
`handlers/dm-reply.ts` uses a Redis pub/sub broadcast so a superseded reply is
aborted even when the newer message lands on a different replica.

Schema changes run from the host against Neon; there is no migration step in the
image:

```bash
pnpm db:push
```
