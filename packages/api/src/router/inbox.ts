import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod/v4";

import {
  and,
  desc,
  eq,
  inArray,
  notInArray,
  generateAndSaveConversationSummary,
  createNotification,
} from "@acme/db";
import { getNotificationPreference } from "@acme/db/helpers/notification-preferences";
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
import { getPresignedUploadUrl, getPublicUrl } from "../lib/s3";
import { enqueueActivityLog } from "../lib/activity-queue";
import { buildInboxData } from "../lib/meta-inbox";
import { getQueueStatus } from "../lib/queue-status";
import { resolveContactNames } from "../lib/resolve-contact-names";
import { permissionProcedure } from "../trpc";

const CLOSED_ORDER_STATUSES = ["delivered", "cancelled", "returned"];
const STATUS_VALUES = ["open", "ticket", "resolved", "archived"] as const;

export const inboxRouter = {
  /** FR-INB-04 — polled by the Inbox page (not pushed live) since a busy signal has no
   * need for sub-second latency; see queue-status.ts for why this is platform-wide. */
  getQueueStatus: permissionProcedure("inbox", "view").query(() => getQueueStatus()),

  getInboxData: permissionProcedure("inbox", "view")
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
        thread.summary = meta?.summary ?? null;
        thread.summaryGeneratedAt = meta?.summaryGeneratedAt ?? null;
        thread.tags = thread.customerId ? (tagsByCustomerId.get(thread.customerId) ?? []) : [];
      }

      const selectedThread =
        data.threads.find((t) => t.id === input.threadId) ?? null;

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

  /**
   * Presigned upload for an image a staff member wants to send to a customer.
   *
   * Returns a key, not a URL, and sendReply takes the key — so the send path can only
   * ever reference something uploaded to our own bucket, never an arbitrary host supplied
   * by a caller.
   */
  getReplyImageUploadUrl: permissionProcedure("inbox", "edit")
    .input(z.object({ contentType: z.string().regex(/^image\/(png|jpe?g|webp)$/) }))
    .mutation(async ({ ctx, input }) => {
      const ext = input.contentType.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
      const key = `inbox-replies/${ctx.businessId}/${crypto.randomUUID()}.${ext}`;
      const uploadUrl = await getPresignedUploadUrl(key, input.contentType);
      return { uploadUrl, key };
    }),

  sendReply: permissionProcedure("inbox", "edit")
    .input(
      z.object({
        threadId: z.string(),
        platform: z.enum(["facebook_page", "instagram", "whatsapp"]),
        accountId: z.string(),
        recipientId: z.string(),
        message: z.string(),
        /** S3 key of an image to send alongside the text, from getReplyImageUploadUrl.
         * A key rather than a URL so a caller cannot make us fetch an arbitrary host. */
        imageKey: z.string().max(500).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const businessId = ctx.businessId;

      // An image on its own is a valid message — a shop owner sending a photo of a
      // product should not have to type something to go with it.
      if (!input.message.trim() && !input.imageKey) {
        return { ok: false as const, reason: "Nothing to send." };
      }

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

      // A staff member cannot hand-send on a disconnected channel either. "Disconnect"
      // has to mean the customer hears nothing from this business until it is reconnected
      // — an AI-only pause that still let humans reply would make the button a lie.
      if (connection.status === "paused") {
        return {
          ok: false as const,
          reason:
            "This channel is disconnected. Reconnect it from Integrations to send messages again.",
        };
      }

      const accessToken =
        connection.accessToken ?? connection.facebookPageAccessToken ?? connection.whatsappAccessToken;
      if (!accessToken) {
        return { ok: false as const, reason: "Missing access token for this channel." };
      }

      const imageUrl = input.imageKey ? getPublicUrl(input.imageKey) : undefined;

      const sent = await sendMetaInboxReply({
        platform: input.platform,
        accessToken,
        accountId: input.platform === "instagram" ? (connection.facebookPageId ?? input.accountId) : input.accountId,
        recipientId: input.recipientId,
        text: input.message,
        imageUrl,
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
          // Read back by meta-inbox.ts's outbound branch so the photo appears in the
          // merchant's own thread, not just in the customer's chat.
          imageUrl,
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
        .values({ businessId, threadId: input.threadId, handlingMode: "human" })
        .onConflictDoUpdate({
          target: [conversationMeta.businessId, conversationMeta.threadId],
          set: { handlingMode: "human" },
        });

      await enqueueActivityLog({
        businessId,
        actorUserId: ctx.session.user.id,
        actorName: ctx.session.user.name ?? "Staff Member",
        actorType: "staff",
        action: "inbox.reply_manual",
        entityType: "conversation",
        entityId: input.threadId,
        summary: `${ctx.session.user.name ?? "Staff"} manually messaged customer on ${input.platform}`,
      });

      return { ok: true as const };
    }),

  setStatus: permissionProcedure("inbox", "edit")
    .input(z.object({ threadId: z.string(), status: z.enum(STATUS_VALUES) }))
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select({ status: conversationMeta.status })
        .from(conversationMeta)
        .where(
          and(
            eq(conversationMeta.businessId, ctx.businessId),
            eq(conversationMeta.threadId, input.threadId),
          ),
        )
        .limit(1);

      const prevStatus = existing?.status ?? "open";

      // A non-open status closes the thread: the AI auto-reply worker only fires while a
      // thread is "ai"-handled, so flipping the thread to human mode stops the AI from
      // talking over a closed/flagged conversation. Reopening (status back to "open") or
      // resolving (status back to "resolved") hands control back to the AI. Only flipped
      // when the status actually changes, so re-clicking "Mark as Open" on an
      // already-open thread never undoes a real takeover.
      let handlingMode: "ai" | "human" | undefined;
      if (input.status !== prevStatus) {
        handlingMode = input.status === "open" || input.status === "resolved" ? "ai" : "human";
      }

      await ctx.db
        .insert(conversationMeta)
        .values({
          businessId: ctx.businessId,
          threadId: input.threadId,
          status: input.status,
          ...(handlingMode ? { handlingMode } : {}),
        })
        .onConflictDoUpdate({
          target: [conversationMeta.businessId, conversationMeta.threadId],
          set: {
            status: input.status,
            ...(handlingMode ? { handlingMode } : {}),
          },
        });

      // Flagging a conversation as a ticket surfaces it to the team on the Support page
      // AND alerts them via the bell — best-effort, never blocking the status change.
      if (input.status === "ticket" && prevStatus !== "ticket") {
        const { inAppEnabled } = await getNotificationPreference(ctx.businessId, "ticket_created");
        if (inAppEnabled) {
          await createNotification({
            businessId: ctx.businessId,
            type: "ticket_created",
            title: "New support ticket",
            body: "A conversation was flagged as a support ticket and needs attention.",
            link: `/dashboard/inbox?thread=${input.threadId}`,
          }).catch((err) => console.error("[setStatus] Failed to create ticket notification:", err));
        }
      }

      await enqueueActivityLog({
        businessId: ctx.businessId,
        actorUserId: ctx.session.user.id,
        actorName: ctx.session.user.name,
        actorType: "staff",
        action: "inbox.update_status",
        entityType: "conversation",
        entityId: input.threadId,
        summary: handlingMode
          ? `${ctx.session.user.name} set conversation status to ${input.status} and switched handling to ${handlingMode}`
          : `${ctx.session.user.name} set conversation status to ${input.status}`,
      });

      return { ok: true as const };
    }),

  toggleStar: permissionProcedure("inbox", "edit")
    .input(z.object({ threadId: z.string(), starred: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .insert(conversationMeta)
        .values({ businessId: ctx.businessId, threadId: input.threadId, starred: input.starred })
        .onConflictDoUpdate({
          target: [conversationMeta.businessId, conversationMeta.threadId],
          set: { starred: input.starred },
        });
      return { ok: true as const };
    }),

  /** Take a thread over from the AI, or hand it back (spec FR-AGT-15). While "human", the
   * DM-reply worker skips generating an AI reply entirely — see dm-reply.ts. */
  setHandlingMode: permissionProcedure("inbox", "edit")
    .input(z.object({ threadId: z.string(), handlingMode: z.enum(["ai", "human"]) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .insert(conversationMeta)
        .values({ businessId: ctx.businessId, threadId: input.threadId, handlingMode: input.handlingMode })
        .onConflictDoUpdate({
          target: [conversationMeta.businessId, conversationMeta.threadId],
          set: { handlingMode: input.handlingMode },
        });
      await enqueueActivityLog({
        businessId: ctx.businessId,
        actorUserId: ctx.session.user.id,
        actorName: ctx.session.user.name ?? "Staff Member",
        actorType: "staff",
        action: "inbox.update_handling",
        entityType: "conversation",
        entityId: input.threadId,
        summary: `${ctx.session.user.name ?? "Staff"} ${input.handlingMode === "human" ? "took over thread from AI" : "handed thread back to AI"}`,
      });

      return { ok: true as const };
    }),

  getContactDetails: permissionProcedure("inbox", "view")
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

  listTags: permissionProcedure("inbox", "view").query(async ({ ctx }) => {
    return ctx.db.select().from(tag).where(eq(tag.businessId, ctx.businessId)).orderBy(tag.label);
  }),

  createTag: permissionProcedure("inbox", "edit")
    .input(z.object({ label: z.string().min(1), color: z.string().default("slate") }))
    .mutation(async ({ ctx, input }) => {
      const [created] = await ctx.db
        .insert(tag)
        .values({ businessId: ctx.businessId, label: input.label, color: input.color })
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

  deleteTag: permissionProcedure("inbox", "edit")
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(tag).where(and(eq(tag.id, input.id), eq(tag.businessId, ctx.businessId)));
      return { ok: true as const };
    }),

  tagCustomer: permissionProcedure("inbox", "edit")
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

  untagCustomer: permissionProcedure("inbox", "edit")
    .input(z.object({ customerId: z.string(), tagId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(customerTag)
        .where(and(eq(customerTag.customerId, input.customerId), eq(customerTag.tagId, input.tagId)));
      return { ok: true as const };
    }),

  listNotes: permissionProcedure("inbox", "view")
    .input(z.object({ customerId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select()
        .from(customerNote)
        .where(and(eq(customerNote.businessId, ctx.businessId), eq(customerNote.customerId, input.customerId)))
        .orderBy(desc(customerNote.createdAt));
    }),

  addNote: permissionProcedure("inbox", "edit")
    .input(z.object({ customerId: z.string(), body: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const [created] = await ctx.db
        .insert(customerNote)
        .values({
          businessId: ctx.businessId,
          customerId: input.customerId,
          authorLabel: ctx.session.user.name ?? "You",
          body: input.body,
        })
        .returning();
      return created;
    }),

  /** On-demand refresh — the same summary is also kept fresh automatically in the
   * background by the worker after every AI reply (see generateAndSaveConversationSummary
   * in @acme/db/helpers/aiHelpers, which this reuses rather than duplicating the OpenAI
   * call here). Reads straight from this thread's own message history in the DB rather
   * than trusting whatever the client currently has loaded. */
  generateSummary: permissionProcedure("inbox", "edit")
    .input(z.object({ threadId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const summary = await generateAndSaveConversationSummary(ctx.businessId, input.threadId);
      return { summary: summary ?? "Unable to generate a summary right now." };
    }),
} satisfies TRPCRouterRecord;
