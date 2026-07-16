import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod/v4";

import { and, desc, eq, inArray } from "@acme/db";
import { metaConnection, metaWebhookEvent } from "@acme/db/schema";

import { sendMetaInboxReply } from "../lib/meta";
import { buildInboxData } from "../lib/meta-inbox";
import { resolveContactNames } from "../lib/resolve-contact-names";
import { protectedProcedure } from "../trpc";

export const inboxRouter = {
  getInboxData: protectedProcedure
    .input(z.object({ threadId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const [events, connections] = await Promise.all([
        ctx.db
          .select()
          .from(metaWebhookEvent)
          .where(eq(metaWebhookEvent.userId, userId))
          .orderBy(desc(metaWebhookEvent.receivedAt))
          .limit(300),
        ctx.db
          .select()
          .from(metaConnection)
          .where(eq(metaConnection.userId, userId))
          .orderBy(desc(metaConnection.connectedAt)),
      ]);

      const resolvedNames = await resolveContactNames(events, connections);
      const data = buildInboxData({ events, connections, resolvedNames });

      const selectedThread =
        data.threads.find((t) => t.id === input.threadId) ?? data.threads[0] ?? null;

      let markedRead = false;
      if (selectedThread) {
        const unreadEventIds = selectedThread.messages
          .filter((m) => m.direction === "inbound" && !m.isRead)
          .map((m) => m.id);

        if (unreadEventIds.length > 0) {
          await ctx.db
            .update(metaWebhookEvent)
            .set({ isRead: true })
            .where(inArray(metaWebhookEvent.id, unreadEventIds));

          for (const m of selectedThread.messages) {
            if (unreadEventIds.includes(m.id)) m.isRead = true;
          }
          markedRead = true;
        }
      }

      return { threads: data.threads, selectedThread, connections, markedRead };
    }),

  sendReply: protectedProcedure
    .input(
      z.object({
        threadId: z.string(),
        platform: z.enum(["facebook_page", "instagram", "whatsapp"]),
        accountId: z.string(),
        recipientId: z.string(),
        message: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const [connection] = await ctx.db
        .select()
        .from(metaConnection)
        .where(and(eq(metaConnection.userId, userId), eq(metaConnection.platform, input.platform)))
        .limit(1);

      if (!connection) {
        return { ok: false as const, reason: "No connection found for this channel." };
      }

      const accessToken =
        connection.accessToken ?? connection.facebookPageAccessToken ?? connection.whatsappAccessToken;
      if (!accessToken) {
        return { ok: false as const, reason: "Missing access token for this channel." };
      }

      const sent = await sendMetaInboxReply({
        platform: input.platform,
        accessToken,
        accountId: input.platform === "instagram" ? (connection.facebookPageId ?? input.accountId) : input.accountId,
        recipientId: input.recipientId,
        text: input.message,
      });

      await ctx.db.insert(metaWebhookEvent).values({
        dedupeKey: `outbound:${input.threadId}:${Date.now()}:${crypto.randomUUID()}`,
        platform: input.platform,
        object:
          input.platform === "whatsapp"
            ? "whatsapp_business_account"
            : input.platform === "instagram"
              ? "instagram"
              : "page",
        eventType: "outbound",
        metaConnectionId: connection.id,
        userId,
        platformAccountId: input.accountId,
        sourceId: sent.messageId ?? null,
        rawPayload: {
          direction: "outbound",
          threadKey: input.threadId,
          recipientId: input.recipientId,
          accountId: input.accountId,
          platform: input.platform,
          text: input.message,
          response: sent.raw,
        },
        headers: {},
        status: "sent",
        processedAt: new Date(),
      });

      return { ok: true as const };
    }),
} satisfies TRPCRouterRecord;
