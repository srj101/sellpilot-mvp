import { createEnv } from "@t3-oss/env-nextjs";
import { vercel } from "@t3-oss/env-nextjs/presets-zod";
import { z } from "zod/v4";

import { authEnv } from "@acme/auth/env";
import { env as sharedEnv } from "@acme/env";

export const env = createEnv({
  // authEnv (AUTH_SECRET/GOOGLE_*/FACEBOOK_APP_ID+SECRET for better-auth) and
  // sharedEnv (@acme/env — everything packages/api, messaging, db, ai-agent,
  // queue, and apps/worker also read) are the single source of truth for
  // every var they cover; don't re-declare those below.
  extends: [authEnv(), sharedEnv, vercel()],
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
    META_WEBHOOK_VERIFY_TOKEN: z.string(),
    META_CHANNEL_REDIRECT_URI: z.string().optional(),
    BETTER_AUTH_URL: z.string().optional(),
    CRON_SECRET: z.string().optional(),
  },

  /**
   * Specify your client-side environment variables schema here.
   * For them to be exposed to the client, prefix them with `NEXT_PUBLIC_`.
   */
  client: {
    NEXT_PUBLIC_FACEBOOK_APP_ID: z.string().optional(),
    NEXT_PUBLIC_FACEBOOK_CONFIG_ID: z.string().optional(),
    NEXT_PUBLIC_WHATSAPP_CONFIG_ID: z.string().optional(),
    NEXT_PUBLIC_WHATSAPP_REDIRECT_URI: z.string().optional(),
  },
  /**
   * Destructure all variables from `process.env` to make sure they aren't tree-shaken away.
   */
  experimental__runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_FACEBOOK_APP_ID: process.env.NEXT_PUBLIC_FACEBOOK_APP_ID,
    NEXT_PUBLIC_FACEBOOK_CONFIG_ID: process.env.NEXT_PUBLIC_FACEBOOK_CONFIG_ID,
    NEXT_PUBLIC_WHATSAPP_CONFIG_ID: process.env.NEXT_PUBLIC_WHATSAPP_CONFIG_ID,
    NEXT_PUBLIC_WHATSAPP_REDIRECT_URI:
      process.env.NEXT_PUBLIC_WHATSAPP_REDIRECT_URI,
  },
  skipValidation:
    !!process.env.CI ||
    !!process.env.SKIP_ENV_VALIDATION ||
    !!process.env.VERCEL ||
    process.env.npm_lifecycle_event === "lint",
});
