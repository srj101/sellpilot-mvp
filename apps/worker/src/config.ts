/**
 * Worker Configuration
 */
import { env } from "./env";

export interface WorkerConfig {
  // Queue
  queueProvider: "memory" | "redis";
  redisHost: string;
  redisPort: number;
  redisPassword?: string;

  // AI
  openaiApiKey: string;
  openaiBaseUrl?: string;
  openaiModel: string;

  // Voice transcription — separate from the chat model above so the provider can be
  // swapped via env vars only. Defaults to OpenAI's hosted transcription API.
  transcriptionBaseUrl: string;
  transcriptionApiKey: string;
  transcriptionModel: string;

  // Meta
  facebookAppSecret: string;

  // Rate Limiting
  rateLimitPerHour: number;

  // Circuit Breaker
  aiTimeoutMs: number;
  aiFallbackMessage: string;

  // Logging
  debug: boolean;
}

export function loadConfig(): WorkerConfig {
  return {
    // Queue
    queueProvider: env.QUEUE_PROVIDER,
    redisHost: env.REDIS_HOST,
    redisPort: env.REDIS_PORT,
    redisPassword: env.REDIS_PASSWORD,

    // AI
    openaiApiKey: env.OPENAI_API_KEY ?? "",
    openaiBaseUrl: env.OPENAI_BASE_URL,
    openaiModel: env.OPENAI_MODEL,

    // Voice transcription
    transcriptionBaseUrl: env.TRANSCRIPTION_BASE_URL,
    // The default endpoint is OpenAI's, so the OpenAI key is the right credential
    // unless transcription has been pointed somewhere else explicitly.
    transcriptionApiKey: env.TRANSCRIPTION_API_KEY ?? env.OPENAI_API_KEY ?? "",
    transcriptionModel: env.TRANSCRIPTION_MODEL,

    // Meta
    facebookAppSecret: env.FACEBOOK_APP_SECRET,

    // Rate Limiting
    rateLimitPerHour: env.RATE_LIMIT_PER_HOUR,

    // Circuit Breaker
    aiTimeoutMs: env.AI_TIMEOUT_MS,
    aiFallbackMessage: env.AI_FALLBACK_MESSAGE,

    // Logging
    debug: env.NODE_ENV !== "production",
  };
}
