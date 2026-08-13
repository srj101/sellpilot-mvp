import { createEnv } from "@t3-oss/env-core";
import { z } from "zod/v4";

export function authEnv() {
  return createEnv({
    server: {
      AUTH_SECRET:
        process.env.NODE_ENV === "production"
          ? z.string().min(1)
          : z.string().min(1).optional(),
      NODE_ENV: z.enum(["development", "production"]).optional(),
      GOOGLE_CLIENT_ID: z.string(),
      GOOGLE_CLIENT_SECRET: z.string(),
      // A separate Facebook App from FACEBOOK_APP_ID/SECRET (@acme/env) — that
      // one is the messaging/Graph-API app (Page connect, webhook signatures);
      // this one is dedicated to "Sign in with Facebook" on the login page.
      FACEBOOK_CLIENT_ID: z.string(),
      FACEBOOK_CLIENT_SECRET: z.string(),
    },
    runtimeEnv: process.env,
    skipValidation:
      !!process.env.CI ||
      !!process.env.SKIP_ENV_VALIDATION ||
      !!process.env.VERCEL ||
      process.env.npm_lifecycle_event === "lint",
  });
}
