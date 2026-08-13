import { createEnv } from "@t3-oss/env-core";
import { z } from "zod/v4";

import { env as sharedEnv } from "@acme/env";

/**
 * Worker-only vars, layered on top of @acme/env (the vars packages/api,
 * messaging, db, and ai-agent also read — APP_URL, OPENAI_*, FACEBOOK_*,
 * REDIS_*, etc). Nothing else in the repo reads these worker-specific ones,
 * so they stay local instead of bloating the shared package.
 */
export const env = createEnv({
  extends: [sharedEnv],
  server: {
    RATE_LIMIT_PER_HOUR: z.coerce.number().default(200),
    AI_TIMEOUT_MS: z.coerce.number().default(30000),
    AI_FALLBACK_MESSAGE: z
      .string()
      .default("Thanks for your message! We'll get back to you shortly."),
    // Left optional (no default) on purpose: apps/worker/src/index.ts only starts
    // the health-check HTTP server when this is explicitly set, so an unset var
    // opts out of it entirely rather than falling back to a port.
    WORKER_HEALTH_PORT: z.coerce.number().optional(),

    // Voice transcription — separate from the chat model so the provider can be
    // swapped (self-hosted Whisper now, OpenAI or anything else later) via env
    // vars only. Defaults point at the local self-hosted whisper-server
    // container from scripts/dev.sh.
    TRANSCRIPTION_BASE_URL: z
      .string()
      .default("http://localhost:9000/v1/audio/transcriptions"),
    TRANSCRIPTION_API_KEY: z.string().default("local-dev-whisper-key"),
    TRANSCRIPTION_MODEL: z.string().default("whisper-1"),
  },
  runtimeEnv: process.env,
  skipValidation:
    !!process.env.CI ||
    !!process.env.SKIP_ENV_VALIDATION ||
    process.env.npm_lifecycle_event === "lint",
});
