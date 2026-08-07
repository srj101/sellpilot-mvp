import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";

import { and, eq, inArray } from "@acme/db";
import type { db as Db } from "@acme/db/client";
import { metaConnection } from "@acme/db/schema";

import {
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  getWhatsAppAccounts,
  getWhatsAppPhoneNumbers,
  subscribeWhatsAppWebhooks,
} from "../lib/meta";
import { assertChannelAllowed, getPlanChannels } from "../lib/plan-limits";
import { ownerOnlyProcedure, permissionProcedure } from "../trpc";

async function persistWhatsAppSignup(
  db: typeof Db,
  input: {
    userId: string;
    businessId: string;
    code: string;
    redirectUri: string;
    wabaId?: string;
    phoneNumberId?: string;
  },
) {
  const tokenData = await exchangeCodeForToken(input.code, input.redirectUri);

  if (!tokenData.access_token) {
    return { ok: false as const, error: "No access token returned" };
  }

  const longToken = await exchangeForLongLivedToken(tokenData.access_token);

  let wabaId = input.wabaId;
  let phoneNumberId = input.phoneNumberId;

  if (!wabaId) {
    try {
      const accounts = await getWhatsAppAccounts(longToken.access_token);
      if (accounts[0]) {
        wabaId = accounts[0].id;
      }
    } catch (err) {
      console.error("Failed to fetch direct WhatsApp business accounts:", err);
    }
  }

  if (wabaId && !phoneNumberId) {
    try {
      const phoneNumbers = await getWhatsAppPhoneNumbers(wabaId, longToken.access_token);
      if (phoneNumbers.data[0]) {
        phoneNumberId = phoneNumbers.data[0].id;
      }
    } catch (err) {
      console.error("Failed to fetch phone numbers for resolved WABA:", err);
    }
  }

  let displayPhoneName = "WhatsApp Business";
  let verifiedName = "";
  let displayPhoneNumber = "";

  if (wabaId) {
    try {
      const phoneNumbers = await getWhatsAppPhoneNumbers(wabaId, longToken.access_token);
      const mainNumber =
        phoneNumbers.data.find((entry) => entry.id === phoneNumberId) ?? phoneNumbers.data[0];

      if (mainNumber) {
        verifiedName = mainNumber.verified_name;
        displayPhoneNumber = mainNumber.display_phone_number;
        displayPhoneName = `${mainNumber.verified_name} (${mainNumber.display_phone_number})`;
      }
    } catch (err) {
      console.error("Failed to fetch WhatsApp phone details:", err);
    }
  }

  if (wabaId) {
    const lookupIds = [phoneNumberId, wabaId].filter((value): value is string => Boolean(value));

    const existing = await db
      .select()
      .from(metaConnection)
      .where(
        and(
          eq(metaConnection.businessId, input.businessId),
          eq(metaConnection.platform, "whatsapp"),
          inArray(metaConnection.platformAccountId, lookupIds),
        ),
      )
      .limit(1);

    let webhookSubscriptionStatus = "failed";
    let webhookSubscriptionError: string | null = null;
    try {
      const res = await subscribeWhatsAppWebhooks(wabaId, longToken.access_token);
      if (res.success) {
        webhookSubscriptionStatus = "subscribed";
      }
    } catch (error) {
      webhookSubscriptionError = error instanceof Error ? error.message : String(error);
    }

    const values = {
      platformAccountName: displayPhoneName,
      whatsappBusinessAccountId: wabaId,
      whatsappPhoneNumberId: phoneNumberId,
      whatsappAccessToken: longToken.access_token,
      accessToken: longToken.access_token,
      accessTokenExpiresAt: longToken.expires_in
        ? new Date(Date.now() + longToken.expires_in * 1000)
        : null,
      metadata: {
        phone_number_id: phoneNumberId,
        verified_name: verifiedName,
        display_phone_number: displayPhoneNumber,
      },
      webhookSubscriptionStatus,
      webhookSubscribedAt: webhookSubscriptionStatus === "subscribed" ? new Date() : null,
      webhookSubscriptionError,
    };

    if (existing[0]) {
      await db.update(metaConnection).set(values).where(eq(metaConnection.id, existing[0].id));
    } else {
      await db.insert(metaConnection).values({
        userId: input.userId,
        businessId: input.businessId,
        platform: "whatsapp",
        platformAccountId: phoneNumberId ?? wabaId,
        ...values,
      });
    }
  }

  return { ok: true as const };
}

export const integrationsRouter = {
  /** Which channels the current plan allows — the Integrations page uses this to show a
   * locked/upgrade state instead of a dead Connect button (billing plan channel gating). */
  getChannelAccess: permissionProcedure("integrations", "view").query(({ ctx }) => {
    return getPlanChannels(ctx);
  }),

  list: permissionProcedure("integrations", "view").query(async ({ ctx }) => {
    return ctx.db
      .select({
        id: metaConnection.id,
        platform: metaConnection.platform,
        platformAccountId: metaConnection.platformAccountId,
        platformAccountName: metaConnection.platformAccountName,
        webhookSubscriptionStatus: metaConnection.webhookSubscriptionStatus,
        connectedAt: metaConnection.connectedAt,
      })
      .from(metaConnection)
      .where(eq(metaConnection.businessId, ctx.businessId));
  }),

  /**
   * Given a batch of external Page/Instagram-account IDs fetched live from Meta, reports
   * which ones are already connected to a DIFFERENT business — so the picker can offer
   * "Unlink & reconnect" instead of silently letting two businesses claim the same page
   * (a single Page can only ever deliver webhooks to one business, see resolveMetaConnection
   * in the meta webhook route — the "loser" business would look connected but never
   * receive a single message). Deliberately returns only the IDs, never the other
   * business's name/id, to avoid leaking one tenant's data to another.
   */
  checkExternalConnections: permissionProcedure("integrations", "view")
    .input(
      z.object({
        platform: z.enum(["facebook_page", "instagram", "whatsapp"]),
        accountIds: z.array(z.string()).max(100),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (input.accountIds.length === 0) return { takenIds: [] as string[] };
      const rows = await ctx.db
        .select({ platformAccountId: metaConnection.platformAccountId, businessId: metaConnection.businessId })
        .from(metaConnection)
        .where(and(eq(metaConnection.platform, input.platform), inArray(metaConnection.platformAccountId, input.accountIds)));
      const takenIds = [...new Set(rows.filter((r) => r.businessId !== ctx.businessId).map((r) => r.platformAccountId))];
      return { takenIds };
    }),

  disconnectChannel: ownerOnlyProcedure
    .input(z.object({ connectionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const deleted = await ctx.db
        .delete(metaConnection)
        .where(
          and(
            eq(metaConnection.id, input.connectionId),
            eq(metaConnection.businessId, ctx.businessId),
          ),
        )
        .returning({ id: metaConnection.id });

      if (deleted.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Connection not found or already removed.",
        });
      }

      return { ok: true };
    }),

  completeWhatsAppSignup: ownerOnlyProcedure
    .input(
      z.object({
        code: z.string(),
        redirectUri: z.string(),
        wabaId: z.string().optional(),
        phoneNumberId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        await assertChannelAllowed(ctx, "whatsapp");
        return await persistWhatsAppSignup(ctx.db, {
          userId: ctx.businessOwnerId,
          businessId: ctx.businessId,
          code: input.code,
          redirectUri: input.redirectUri,
          wabaId: input.wabaId,
          phoneNumberId: input.phoneNumberId,
        });
      } catch (err) {
        console.error("WhatsApp signup error:", err);
        return {
          ok: false as const,
          error: err instanceof Error ? err.message : "Unknown error",
        };
      }
    }),
} satisfies TRPCRouterRecord;
