import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod/v4";

import { and, desc, eq, inArray, notInArray } from "@acme/db";
import {
  customer,
  customerNote,
  customerTag,
  metaConnection,
  metaWebhookEvent,
  order,
  tag,
  conversationMeta,
} from "@acme/db/schema";

import { sendMetaInboxReply } from "../lib/meta";
import { buildInboxData } from "../lib/meta-inbox";
import { resolveContactNames } from "../lib/resolve-contact-names";
import { businessScopedProcedure } from "../trpc";

const CLOSED_ORDER_STATUSES = ["delivered", "cancelled", "returned"];
const STATUS_VALUES = ["open", "ticket", "resolved", "archived"] as const;

export const inboxRouter = {
  getInboxData: businessScopedProcedure
    .input(z.object({ threadId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const businessId = ctx.businessId;

      const [events, connections, activeOrders, metas] = await Promise.all([
        ctx.db
          .select()
          .from(metaWebhookEvent)
          .where(eq(metaWebhookEvent.businessId, businessId))
          .orderBy(desc(metaWebhookEvent.receivedAt))
          .limit(300),
        ctx.db
          .select()
          .from(metaConnection)
          .where(eq(metaConnection.businessId, businessId))
          .orderBy(desc(metaConnection.connectedAt)),
        ctx.db
          .select({ threadId: order.threadId })
          .from(order)
          .where(and(eq(order.businessId, businessId), notInArray(order.status, CLOSED_ORDER_STATUSES))),
        ctx.db.select().from(conversationMeta).where(eq(conversationMeta.businessId, businessId)),
      ]);

      const resolvedNames = await resolveContactNames(events, connections);
      const data = buildInboxData({ events, connections, resolvedNames });

      const activeOrderThreadIds = new Set(
        activeOrders.map((o) => o.threadId).filter((id): id is string => Boolean(id)),
      );
      const metaByThread = new Map(metas.map((m) => [m.threadId, m]));
      const linkedCustomerIds = metas.map((m) => m.customerId).filter((id): id is string => Boolean(id));
      const tagRows =
        linkedCustomerIds.length > 0
          ? await ctx.db
              .select({ customerId: customerTag.customerId, id: tag.id, label: tag.label, color: tag.color })
              .from(customerTag)
              .innerJoin(tag, eq(customerTag.tagId, tag.id))
              .where(inArray(customerTag.customerId, linkedCustomerIds))
          : [];
      const tagsByCustomerId = new Map<string, { id: string; label: string; color: string }[]>();
      for (const row of tagRows) {
        const list = tagsByCustomerId.get(row.customerId) ?? [];
        list.push({ id: row.id, label: row.label, color: row.color });
        tagsByCustomerId.set(row.customerId, list);
      }

      for (const thread of data.threads) {
        thread.hasOrderRequest = activeOrderThreadIds.has(thread.id);
        const meta = metaByThread.get(thread.id);
        thread.status = meta?.status ?? "open";
        thread.starred = meta?.starred ?? false;
        thread.customerId = meta?.customerId ?? null;
        thread.assignedMemberId = meta?.assignedMemberId ?? null;
        thread.handlingMode = meta?.handlingMode ?? "ai";
        thread.tags = thread.customerId ? (tagsByCustomerId.get(thread.customerId) ?? []) : [];
      }

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

  sendReply: businessScopedProcedure
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
      const businessId = ctx.businessId;

      const [connection] = await ctx.db
        .select()
        .from(metaConnection)
        .where(
          and(
            eq(metaConnection.businessId, businessId),
            eq(metaConnection.platform, input.platform),
            eq(metaConnection.platformAccountId, input.accountId),
          ),
        )
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
        userId: ctx.businessOwnerId,
        businessId,
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
        sentBy: "human",
        processedAt: new Date(),
      });

      // A manual reply implies the staff member is now handling this thread, even if they
      // never clicked the explicit "Take over" button — otherwise the AI could still reply
      // to the customer's next message right alongside them.
      await ctx.db
        .insert(conversationMeta)
        .values({ userId: ctx.businessOwnerId, businessId, threadId: input.threadId, handlingMode: "human" })
        .onConflictDoUpdate({
          target: [conversationMeta.businessId, conversationMeta.threadId],
          set: { handlingMode: "human" },
        });

      return { ok: true as const };
    }),

  setStatus: businessScopedProcedure
    .input(z.object({ threadId: z.string(), status: z.enum(STATUS_VALUES) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .insert(conversationMeta)
        .values({ userId: ctx.businessOwnerId, businessId: ctx.businessId, threadId: input.threadId, status: input.status })
        .onConflictDoUpdate({
          target: [conversationMeta.businessId, conversationMeta.threadId],
          set: { status: input.status },
        });
      return { ok: true as const };
    }),

  toggleStar: businessScopedProcedure
    .input(z.object({ threadId: z.string(), starred: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .insert(conversationMeta)
        .values({ userId: ctx.businessOwnerId, businessId: ctx.businessId, threadId: input.threadId, starred: input.starred })
        .onConflictDoUpdate({
          target: [conversationMeta.businessId, conversationMeta.threadId],
          set: { starred: input.starred },
        });
      return { ok: true as const };
    }),

  assignMember: businessScopedProcedure
    .input(z.object({ threadId: z.string(), memberId: z.string().nullable() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .insert(conversationMeta)
        .values({ userId: ctx.businessOwnerId, businessId: ctx.businessId, threadId: input.threadId, assignedMemberId: input.memberId })
        .onConflictDoUpdate({
          target: [conversationMeta.businessId, conversationMeta.threadId],
          set: { assignedMemberId: input.memberId },
        });
      return { ok: true as const };
    }),

  /** Take a thread over from the AI, or hand it back (spec FR-AGT-15). While "human", the
   * DM-reply worker skips generating an AI reply entirely — see dm-reply.ts. */
  setHandlingMode: businessScopedProcedure
    .input(z.object({ threadId: z.string(), handlingMode: z.enum(["ai", "human"]) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .insert(conversationMeta)
        .values({ userId: ctx.businessOwnerId, businessId: ctx.businessId, threadId: input.threadId, handlingMode: input.handlingMode })
        .onConflictDoUpdate({
          target: [conversationMeta.businessId, conversationMeta.threadId],
          set: { handlingMode: input.handlingMode },
        });
      return { ok: true as const };
    }),

  getContactDetails: businessScopedProcedure
    .input(z.object({ customerId: z.string() }))
    .query(async ({ ctx, input }) => {
      const businessId = ctx.businessId;

      const [cust] = await ctx.db
        .select()
        .from(customer)
        .where(and(eq(customer.id, input.customerId), eq(customer.businessId, businessId)))
        .limit(1);
      if (!cust) return null;

      const [recentOrders, tagRows] = await Promise.all([
        ctx.db
          .select()
          .from(order)
          .where(and(eq(order.businessId, businessId), eq(order.customerId, cust.id)))
          .orderBy(desc(order.createdAt))
          .limit(10),
        ctx.db
          .select({ id: tag.id, label: tag.label, color: tag.color })
          .from(customerTag)
          .innerJoin(tag, eq(customerTag.tagId, tag.id))
          .where(eq(customerTag.customerId, cust.id)),
      ]);

      return { customer: cust, recentOrders, tags: tagRows };
    }),

  listTags: businessScopedProcedure.query(async ({ ctx }) => {
    return ctx.db.select().from(tag).where(eq(tag.businessId, ctx.businessId)).orderBy(tag.label);
  }),

  createTag: businessScopedProcedure
    .input(z.object({ label: z.string().min(1), color: z.string().default("slate") }))
    .mutation(async ({ ctx, input }) => {
      const [created] = await ctx.db
        .insert(tag)
        .values({ userId: ctx.businessOwnerId, businessId: ctx.businessId, label: input.label, color: input.color })
        .onConflictDoNothing()
        .returning();
      if (created) return created;
      const [existing] = await ctx.db
        .select()
        .from(tag)
        .where(and(eq(tag.businessId, ctx.businessId), eq(tag.label, input.label)))
        .limit(1);
      return existing ?? null;
    }),

  deleteTag: businessScopedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(tag).where(and(eq(tag.id, input.id), eq(tag.businessId, ctx.businessId)));
      return { ok: true as const };
    }),

  tagCustomer: businessScopedProcedure
    .input(z.object({ customerId: z.string(), tagId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Verify both the customer and the tag actually belong to this store before linking them —
      // otherwise a caller could tag another store's customer using a tagId/customerId they
      // happen to know (both are plain UUIDs, not otherwise guessable, but defense in depth).
      const [[cust], [tagRow]] = await Promise.all([
        ctx.db.select({ id: customer.id }).from(customer).where(and(eq(customer.id, input.customerId), eq(customer.businessId, ctx.businessId))).limit(1),
        ctx.db.select({ id: tag.id }).from(tag).where(and(eq(tag.id, input.tagId), eq(tag.businessId, ctx.businessId))).limit(1),
      ]);
      if (!cust || !tagRow) {
        return { ok: false as const };
      }
      await ctx.db.insert(customerTag).values(input).onConflictDoNothing();
      return { ok: true as const };
    }),

  untagCustomer: businessScopedProcedure
    .input(z.object({ customerId: z.string(), tagId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(customerTag)
        .where(and(eq(customerTag.customerId, input.customerId), eq(customerTag.tagId, input.tagId)));
      return { ok: true as const };
    }),

  listNotes: businessScopedProcedure
    .input(z.object({ customerId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select()
        .from(customerNote)
        .where(and(eq(customerNote.businessId, ctx.businessId), eq(customerNote.customerId, input.customerId)))
        .orderBy(desc(customerNote.createdAt));
    }),

  addNote: businessScopedProcedure
    .input(z.object({ customerId: z.string(), body: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const [created] = await ctx.db
        .insert(customerNote)
        .values({
          userId: ctx.businessOwnerId,
          businessId: ctx.businessId,
          customerId: input.customerId,
          authorLabel: ctx.session.user.name ?? "You",
          body: input.body,
        })
        .returning();
      return created;
    }),

  generateSummary: businessScopedProcedure
    .input(z.object({ threadId: z.string(), messages: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string() })) }))
    .mutation(async ({ ctx, input }) => {
      if (input.messages.length === 0) {
        return { summary: "No messages in this conversation yet." };
      }

      const transcript = input.messages
        .map((m) => `${m.role === "user" ? "Customer" : "Agent"}: ${m.text}`)
        .join("\n")
        .slice(0, 8000);

      let summary = "Unable to generate a summary right now.";
      try {
        const apiKey = process.env.OPENAI_API_KEY ?? "";
        const baseUrl = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
        const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

        const res = await fetch(`${baseUrl}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model,
            max_tokens: 200,
            messages: [
              {
                role: "system",
                content:
                  "Summarize this customer service conversation in 2-3 short sentences for a merchant dashboard. Focus on what the customer wants and the current status.",
              },
              { role: "user", content: transcript },
            ],
          }),
        });
        if (res.ok) {
          const data = (await res.json()) as { choices: { message: { content: string } }[] };
          summary = data.choices[0]?.message?.content?.trim() ?? summary;
        }
      } catch {
        // fall through to default summary above
      }

      await ctx.db
        .insert(conversationMeta)
        .values({ userId: ctx.businessOwnerId, businessId: ctx.businessId, threadId: input.threadId, summary, summaryGeneratedAt: new Date() })
        .onConflictDoUpdate({
          target: [conversationMeta.businessId, conversationMeta.threadId],
          set: { summary, summaryGeneratedAt: new Date() },
        });

      return { summary };
    }),
} satisfies TRPCRouterRecord;
