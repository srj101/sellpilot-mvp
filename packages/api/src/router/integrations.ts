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
import {
  createSession,
  deleteSession,
  getQrCode,
  getSessionStatus,
  listSessions,
  logoutSession,
  registerOpenWAWebhook,
  startSession,
  stopSession,
} from "../lib/openwa";
import { protectedProcedure } from "../trpc";

function sessionName(userId: string) {
  return `user-${userId}`;
}

async function cleanupExistingSession(name: string) {
  const sessions = await listSessions();
  const existingSessions = sessions.filter((session) => session.name === name);
  if (!existingSessions.length) return;

  for (const existing of existingSessions) {
    try {
      await logoutSession(existing.id);
    } catch (err) {
      console.warn("[OpenWA] cleanupExistingSession logoutSession failed:", err);
    }
    try {
      await stopSession(existing.id);
    } catch (err) {
      console.warn("[OpenWA] cleanupExistingSession stopSession failed:", err);
    }
    try {
      await deleteSession(existing.id);
    } catch (err) {
      console.warn("[OpenWA] cleanupExistingSession deleteSession failed:", err);
    }
  }
}

async function getOpenWASessionIdForUser(db: typeof Db, userId: string) {
  const connection = await db.query.metaConnection.findFirst({
    where: and(eq(metaConnection.userId, userId), eq(metaConnection.platform, "whatsapp")),
    columns: { metadata: true },
  });

  if (!connection?.metadata || typeof connection.metadata !== "object") {
    return null;
  }

  const sessionId = connection.metadata.sessionId;
  return typeof sessionId === "string" ? sessionId : null;
}

async function persistWhatsAppSignup(
  db: typeof Db,
  input: {
    userId: string;
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
          eq(metaConnection.userId, input.userId),
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
        platform: "whatsapp",
        platformAccountId: phoneNumberId ?? wabaId,
        ...values,
      });
    }
  }

  return { ok: true as const };
}

export const integrationsRouter = {
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select({
        id: metaConnection.id,
        platform: metaConnection.platform,
        platformAccountId: metaConnection.platformAccountId,
        platformAccountName: metaConnection.platformAccountName,
        webhookSubscriptionStatus: metaConnection.webhookSubscriptionStatus,
        connectedAt: metaConnection.connectedAt,
        accessToken: metaConnection.accessToken,
      })
      .from(metaConnection)
      .where(eq(metaConnection.userId, ctx.session.user.id));
  }),

  disconnectChannel: protectedProcedure
    .input(z.object({ connectionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const deleted = await ctx.db
        .delete(metaConnection)
        .where(
          and(
            eq(metaConnection.id, input.connectionId),
            eq(metaConnection.userId, ctx.session.user.id),
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

  completeWhatsAppSignup: protectedProcedure
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
        return await persistWhatsAppSignup(ctx.db, {
          userId: ctx.session.user.id,
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

  startOpenWASession: protectedProcedure.mutation(async ({ ctx }) => {
    const name = sessionName(ctx.session.user.id);

    try {
      await cleanupExistingSession(name);
      const created = await createSession(name);
      const started = await startSession(created.id);
      return { ok: true as const, sessionId: started.id };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (
        message.includes("409") ||
        message.includes("already exists") ||
        message.includes("already")
      ) {
        try {
          const s = await getSessionStatus(name);
          return { ok: true as const, sessionId: s.id };
        } catch (innerErr) {
          console.error("[OpenWA] startOpenWASession fallback failed:", innerErr);
        }
      }
      return { ok: false as const, error: message };
    }
  }),

  fetchOpenWAQr: protectedProcedure.mutation(async ({ ctx }) => {
    const name = sessionName(ctx.session.user.id);
    try {
      const qr = await getQrCode(name);
      return { ok: true as const, qrCode: qr.qrCode, status: qr.status };
    } catch (err) {
      console.error("[OpenWA] fetchOpenWAQr error:", err);
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : "QR not available yet",
      };
    }
  }),

  checkOpenWAStatus: protectedProcedure.mutation(async ({ ctx }) => {
    const name = sessionName(ctx.session.user.id);
    try {
      const s = await getSessionStatus(name);
      return { ok: true as const, status: s.status, phone: s.phone, pushName: s.pushName };
    } catch (err) {
      console.error("[OpenWA] checkOpenWAStatus error:", err);
      return { ok: false as const, error: err instanceof Error ? err.message : "Unknown" };
    }
  }),

  saveOpenWAConnection: protectedProcedure.mutation(async ({ ctx }) => {
    const name = sessionName(ctx.session.user.id);

    try {
      const s = await getSessionStatus(name);
      if (s.status !== "ready") {
        return { ok: false as const, error: "Session is not ready yet" };
      }

      const phone = s.phone ?? "unknown";
      const displayName = s.pushName ?? phone;

      const existing = await ctx.db.query.metaConnection.findFirst({
        where: and(
          eq(metaConnection.userId, ctx.session.user.id),
          eq(metaConnection.platform, "whatsapp"),
        ),
      });

      if (existing) {
        await ctx.db
          .update(metaConnection)
          .set({
            platformAccountId: phone,
            platformAccountName: displayName,
            accessToken: name,
            whatsappAccessToken: "openwa",
            whatsappPhoneNumberId: phone,
            webhookSubscriptionStatus: "subscribed",
            webhookSubscribedAt: new Date(),
            metadata: { provider: "openwa", sessionId: s.id, phone },
          })
          .where(eq(metaConnection.id, existing.id));
      } else {
        await ctx.db.insert(metaConnection).values({
          userId: ctx.session.user.id,
          platform: "whatsapp",
          platformAccountId: phone,
          platformAccountName: displayName,
          accessToken: name,
          whatsappAccessToken: "openwa",
          whatsappPhoneNumberId: phone,
          webhookSubscriptionStatus: "subscribed",
          webhookSubscribedAt: new Date(),
          metadata: { provider: "openwa", sessionId: s.id, phone },
        });
      }

      const baseUrl = process.env.BETTER_AUTH_URL ?? "http://localhost:3000";
      const webhookUrl = `${baseUrl}/api/openwa/webhook`;
      const secret = process.env.OPENWA_WEBHOOK_SECRET ?? process.env.META_WEBHOOK_VERIFY_TOKEN ?? "";

      try {
        await registerOpenWAWebhook(s.id, webhookUrl, secret);
      } catch (err) {
        console.warn("[OpenWA] Webhook registration failed (non-fatal):", err);
      }

      return { ok: true as const };
    } catch (err) {
      console.error("[OpenWA] saveOpenWAConnection error:", err);
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }),

  disconnectOpenWA: protectedProcedure.mutation(async ({ ctx }) => {
    const name = sessionName(ctx.session.user.id);
    const storedSessionId = await getOpenWASessionIdForUser(ctx.db, ctx.session.user.id);

    try {
      if (storedSessionId) {
        try {
          await logoutSession(storedSessionId);
        } catch (err) {
          console.warn("[OpenWA] logoutSession failed during disconnect (stored sessionId):", err);
        }
        try {
          await stopSession(storedSessionId);
        } catch (err) {
          console.warn("[OpenWA] stopSession failed during disconnect (stored sessionId):", err);
        }
        try {
          await deleteSession(storedSessionId);
        } catch (err) {
          console.warn("[OpenWA] deleteSession failed during disconnect (stored sessionId):", err);
        }
      }

      try {
        const sessions = await listSessions();
        const namedSessions = sessions.filter((session) => session.name === name);
        for (const session of namedSessions) {
          try {
            await logoutSession(session.id);
          } catch (err) {
            console.warn("[OpenWA] logoutSession failed during disconnect (named session):", err);
          }
          try {
            await stopSession(session.id);
          } catch (err) {
            console.warn("[OpenWA] stopSession failed during disconnect (named session):", err);
          }
          try {
            await deleteSession(session.id);
          } catch (err) {
            console.warn("[OpenWA] deleteSession failed during disconnect (named session):", err);
          }
        }
      } catch (err) {
        console.warn("[OpenWA] delete by name cleanup failed:", err);
      }

      await ctx.db
        .delete(metaConnection)
        .where(
          and(
            eq(metaConnection.userId, ctx.session.user.id),
            eq(metaConnection.platform, "whatsapp"),
          ),
        );

      return { ok: true as const };
    } catch (err) {
      console.error("[OpenWA] disconnectOpenWA error:", err);
      return {
        ok: false as const,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }),
} satisfies TRPCRouterRecord;
