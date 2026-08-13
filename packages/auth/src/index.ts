import type { BetterAuthOptions, BetterAuthPlugin } from "better-auth";
import { expo } from "@better-auth/expo";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { oAuthProxy, admin } from "better-auth/plugins";

import { db } from "@acme/db/client";

import { sendEmail } from "./email";

export function initAuth<
  TExtraPlugins extends BetterAuthPlugin[] = [],
>(options: {
  baseUrl: string;
  productionUrl: string;
  secret: string | undefined;

  googleClientId: string;
  googleClientSecret: string;
  facebookClientId: string;
  facebookClientSecret: string;
  extraPlugins?: TExtraPlugins;
}) {
  const config = {
    database: drizzleAdapter(db, {
      provider: "pg",
    }),
    baseURL: options.baseUrl,
    secret: options.secret,
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 8,
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, token }) => {
        const appResetUrl = new URL("/reset-password", options.baseUrl);
        appResetUrl.searchParams.set("token", token);

        await sendEmail({
          to: user.email,
          subject: "Reset your SellPilot password",
          html: `<p>Click the link below to reset your password:</p><p><a href="${appResetUrl.toString()}">${appResetUrl.toString()}</a></p>`,
          text: `Reset your password: ${appResetUrl.toString()}`,
        });
      },
      onPasswordReset: async ({ user }) => {
        console.info("BETTER AUTH PASSWORD RESET COMPLETE", {
          email: user.email,
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        const appVerifyUrl = new URL("/verify-email", options.baseUrl);
        appVerifyUrl.searchParams.set("url", url);
        
        await sendEmail({
          to: user.email,
          subject: "Verify your SellPilot email address",
          html: `<p>Please click the link below to verify your email address:</p><p><a href="${appVerifyUrl.toString()}">${appVerifyUrl.toString()}</a></p>`,
          text: `Verify your email: ${appVerifyUrl.toString()}`,
        });
      },
    },
    user: {
      changeEmail: {
        enabled: true,
      },
    },
    account: {
      accountLinking: {
        enabled: true,
        // Google and Facebook both only report verified emails, so it's safe to
        // treat "signed in with a different provider, same email" as the same
        // person rather than refusing with account_not_linked.
        trustedProviders: ["google", "facebook"],
      },
    },
    session: {
      additionalFields: {
        activeBusinessId: { type: "string", required: false },
      },
    },
    plugins: [
      oAuthProxy({
        productionURL: options.productionUrl,
      }),
      expo(),
      admin({ adminRoles: ["admin", "superadmin"] }),
      ...(options.extraPlugins ?? []),
    ],
    socialProviders: {
      google: {
        clientId: options.googleClientId,
        clientSecret: options.googleClientSecret,
      },
      facebook: {
        clientId: options.facebookClientId,
        clientSecret: options.facebookClientSecret,
      },
    },
    trustedOrigins: ["expo://", "http://localhost:3000", "https://tunnel.sellpilot-mvp.online"],
    onAPIError: {
      onError(error, ctx) {
        console.error("BETTER AUTH API ERROR", error, ctx);
      },
    },
  } satisfies BetterAuthOptions;

  return betterAuth(config);
}

export type Auth = ReturnType<typeof initAuth>;
export type Session = Auth["$Infer"]["Session"];
