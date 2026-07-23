import type { BetterAuthOptions, BetterAuthPlugin } from "better-auth";
import { expo } from "@better-auth/expo";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { oAuthProxy, admin, organization } from "better-auth/plugins";

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
    plugins: [
      oAuthProxy({
        productionURL: options.productionUrl,
      }),
      expo(),
      admin(),
      organization({
        // Org-level management (invite/remove members, org settings) uses better-auth's
        // built-in owner/admin/member roles. App-resource permissions (Orders/Products/...)
        // are a separate concern, resolved from the existing `role` table via the
        // `customRoleKey` member field below — see packages/api/src/trpc.ts's orgProcedure.
        schema: {
          member: {
            additionalFields: {
              customRoleKey: { type: "string", required: false },
            },
          },
          invitation: {
            additionalFields: {
              customRoleKey: { type: "string", required: false },
            },
          },
        },
        sendInvitationEmail: async (data) => {
          const acceptUrl = new URL("/accept-invitation", options.baseUrl);
          acceptUrl.searchParams.set("id", data.id);
          const roleLabel = (data.invitation as { customRoleKey?: string }).customRoleKey ?? data.role;

          await sendEmail({
            to: data.email,
            subject: `You've been invited to join ${data.organization.name} on SellPilot`,
            html: `<p>${data.inviter.user.name} invited you to join <strong>${data.organization.name}</strong> as ${roleLabel}.</p><p><a href="${acceptUrl.toString()}">Accept invitation</a></p>`,
            text: `${data.inviter.user.name} invited you to join ${data.organization.name} as ${roleLabel}. Accept: ${acceptUrl.toString()}`,
          });
        },
      }),
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
    trustedOrigins: ["expo://", "http://localhost:3000"],
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
