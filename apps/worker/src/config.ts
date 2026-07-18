/**
 * Worker Configuration
 */

export interface WorkerConfig {
  // Queue
  queueProvider: "memory" | "redis" | "sqs";
  redisHost: string;
  redisPort: number;
  redisPassword?: string;

  // AI
  openaiApiKey: string;
  openaiBaseUrl?: string;
  openaiModel: string;

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
    queueProvider: (process.env.QUEUE_PROVIDER as WorkerConfig["queueProvider"]) ?? "memory",
    redisHost: process.env.REDIS_HOST ?? "localhost",
    redisPort: parseInt(process.env.REDIS_PORT ?? "6379"),
    redisPassword: process.env.REDIS_PASSWORD,

    // AI
    openaiApiKey: process.env.OPENAI_API_KEY ?? "",
    openaiBaseUrl: process.env.OPENAI_BASE_URL,
    openaiModel: process.env.OPENAI_MODEL ?? "gpt-4o-mini",

    // Meta
    facebookAppSecret: process.env.FACEBOOK_APP_SECRET ?? "",

    // Rate Limiting
    rateLimitPerHour: parseInt(process.env.RATE_LIMIT_PER_HOUR ?? "200"),

    // Circuit Breaker
    aiTimeoutMs: parseInt(process.env.AI_TIMEOUT_MS ?? "30000"),
    aiFallbackMessage:
      process.env.AI_FALLBACK_MESSAGE ??
      "Thanks for your message! We'll get back to you shortly.",

    // Logging
    debug: process.env.NODE_ENV !== "production",
  };
}
