import { createEnv } from "@t3-oss/env-nextjs";
import { vercel } from "@t3-oss/env-nextjs/presets-zod";
import { z } from "zod/v4";

import { authEnv } from "@acme/auth/env";

export const env = createEnv({
  extends: [authEnv(), vercel()],
  shared: {
    NODE_ENV: z
      .enum(["development", "production", "test"])
      .default("development"),
  },
  /**
   * Specify your server-side environment variables schema here.
   * This way you can ensure the app isn't built with invalid env vars.
   */
  server: {
    POSTGRES_URL: z.url(),
    GOOGLE_CLIENT_ID: z.string(),
    GOOGLE_CLIENT_SECRET: z.string(),
    FACEBOOK_APP_ID: z.string(),
    FACEBOOK_APP_SECRET: z.string(),
    META_APP_SECRET: z.string(),
    META_WEBHOOK_VERIFY_TOKEN: z.string(),
    META_CHANNEL_REDIRECT_URI: z.string().optional(),
    WHATSAPP_REDIRECT_URI: z.string().optional(),
    FACEBOOK_GRAPH_VERSION: z.string().default("v25.0"),
    BETTER_AUTH_URL: z.string().optional(),
    CLOUDFLARE_ACCOUNT_ID: z.string().optional(),
    CLOUDFLARE_API_TOKEN: z.string().optional(),
    CLOUDFLARE_AGENT_MODEL: z.string().default("@cf/zai-org/glm-5.2"),
    AGENT_SERVICE_URL: z.string().default("http://localhost:8787"),
    CHROMA_URL: z.string().default("http://localhost:8000"),
    CHROMA_AUTH_TOKEN: z.string().optional(),
    REDIS_URL: z.string().default("redis://localhost:6379"),
    OPENWA_URL: z.string().default("http://localhost:2785"),
    OPENWA_API_KEY: z.string().default("owa_k1_302b9cd435a44a92c4c1190b123a586d1f29e9c94572e2ce20e5048e975ec063"),
  },

  /**
   * Specify your client-side environment variables schema here.
   * For them to be exposed to the client, prefix them with `NEXT_PUBLIC_`.
   */
  client: {
    NEXT_PUBLIC_FACEBOOK_APP_ID: z.string().optional(),
    NEXT_PUBLIC_WHATSAPP_CONFIG_ID: z.string().optional(),
    NEXT_PUBLIC_WHATSAPP_REDIRECT_URI: z.string().optional(),
  },
  /**
   * Destructure all variables from `process.env` to make sure they aren't tree-shaken away.
   */
  experimental__runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_FACEBOOK_APP_ID: process.env.NEXT_PUBLIC_FACEBOOK_APP_ID,
    NEXT_PUBLIC_WHATSAPP_CONFIG_ID: process.env.NEXT_PUBLIC_WHATSAPP_CONFIG_ID,
    NEXT_PUBLIC_WHATSAPP_REDIRECT_URI:
      process.env.NEXT_PUBLIC_WHATSAPP_REDIRECT_URI,
  },
  skipValidation:
    !!process.env.CI || process.env.npm_lifecycle_event === "lint",
});
