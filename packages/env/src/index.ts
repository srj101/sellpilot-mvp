import { createEnv } from "@t3-oss/env-core";
import { z } from "zod/v4";

/**
 * Env vars shared by non-Next.js packages/apps (packages/api, messaging, db,
 * ai-agent, queue, and apps/worker) — anything read from more than one of
 * those places used to be re-parsed with its own `process.env.X ?? default`
 * at each call site, which let the same var silently drift to different
 * fallbacks in different files. This is the single validated source for it.
 *
 * apps/nextjs has its own env.ts (Next.js needs the t3-oss/env-nextjs variant
 * for NEXT_PUBLIC_* client vars + the Vercel preset) which extends this one.
 */
export const env = createEnv({
  server: {
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),

    APP_URL: z.string().default("http://localhost:3000"),

    // The messaging/Graph-API Facebook App (Page/Instagram/WhatsApp connect +
    // webhook signature verification) — a different app from the one
    // FACEBOOK_CLIENT_ID/SECRET (packages/auth/env.ts) uses for "Sign in with
    // Facebook" on the login page. Meta always signs webhooks with the same
    // App Secret used for OAuth/Graph API calls on THIS app, so this value
    // must never drift from FACEBOOK_APP_SECRET.
    FACEBOOK_APP_ID: z.string(),
    FACEBOOK_APP_SECRET: z.string(),
    FACEBOOK_GRAPH_VERSION: z.string().default("v25.0"),

    OPENAI_API_KEY: z.string().optional(),
    OPENAI_BASE_URL: z.string().optional(),
    OPENAI_MODEL: z.string().default("gpt-5.4-mini"),

    // Image/text embeddings for image search — optional: without it, image
    // indexing/search just no-ops (see packages/api/src/lib/embeddings.ts).
    NVIDIA_API_KEY: z.string().optional(),
    NVIDIA_EMBEDDINGS_URL: z
      .string()
      .default("https://integrate.api.nvidia.com/v1/embeddings"),
    NVIDIA_EMBED_MODEL: z
      .string()
      .default("nvidia/llama-nemotron-embed-vl-1b-v2"),

    AWS_REGION: z.string().default("us-east-1"),
    AWS_ACCESS_KEY_ID: z.string().optional(),
    AWS_SECRET_ACCESS_KEY: z.string().optional(),
    AWS_S3_BUCKET: z.string().default("sellpilot-media"),
    AWS_SES_FROM_EMAIL: z.string().default("no-reply@sellpilot-mvp.online"),

    QUEUE_PROVIDER: z.enum(["memory", "redis"]).default("memory"),

    // Single source of truth for every Redis client in the repo (packages/queue's
    // BullMQ provider + pub/sub broadcast, and packages/api's image-indexing queue).
    REDIS_HOST: z.string().default("localhost"),
    REDIS_PORT: z.coerce.number().default(6379),
    REDIS_PASSWORD: z.string().optional(),
    REDIS_DB: z.coerce.number().default(0),
    REDIS_TLS: z
      .string()
      .optional()
      .transform((v) => v === "true"),

    SSLCOMMERZ_STORE_ID: z.string().optional(),
    SSLCOMMERZ_STORE_PASSWORD: z.string().optional(),
    SSLCOMMERZ_IS_SANDBOX: z
      .string()
      .optional()
      .transform((v) => v !== "false"),

    // AES-256 key source for encrypting store-connection credentials at rest.
    STORE_CONNECTION_ENCRYPTION_KEY: z.string().optional(),

    // How stale a cached contact name or avatar may get before the sweep refreshes it.
    // Names cost one Graph call per page; avatars cost one per contact, so lowering this
    // multiplies avatar traffic far faster than name traffic.
    CONTACT_REFRESH_DAYS: z.coerce.number().default(7),

    SALES_EMAIL: z.string().default("sales@sellpilot-mvp.online"),

    RBAC_ENFORCE: z
      .string()
      .optional()
      .transform((v) => v === "true"),
  },
  runtimeEnv: process.env,
  skipValidation:
    !!process.env.CI ||
    !!process.env.SKIP_ENV_VALIDATION ||
    !!process.env.VERCEL ||
    process.env.npm_lifecycle_event === "lint",
});
