import "server-only";

import { cache } from "react";
import { headers } from "next/headers";
import { nextCookies } from "better-auth/next-js";

import { initAuth } from "@acme/auth";

import { env } from "~/env";

const baseUrl =
  env.VERCEL_ENV === "production"
    ? `https://${env.VERCEL_PROJECT_PRODUCTION_URL}`
    : env.VERCEL_ENV === "preview"
      ? `https://${env.VERCEL_URL}`
      : "http://localhost:3000";

export const auth = initAuth({
  baseUrl,
  productionUrl: `https://${env.VERCEL_PROJECT_PRODUCTION_URL ?? "turbo.t3.gg"}`,
  secret: env.AUTH_SECRET,
  googleClientId: env.GOOGLE_CLIENT_ID as string,
  googleClientSecret: env.GOOGLE_CLIENT_SECRET as string,
  facebookClientId: env.FACEBOOK_APP_ID as string,
  facebookClientSecret: env.FACEBOOK_APP_SECRET as string,
  extraPlugins: [nextCookies()],
});

export const getSession = cache(async () =>
  auth.api.getSession({ headers: await headers() }),
);
