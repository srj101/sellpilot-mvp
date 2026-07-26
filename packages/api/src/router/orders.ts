import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod";

import { desc, eq, and, inArray, createCustomerAndOrder, quoteOrder } from "@acme/db";
import type { db as Db } from "@acme/db/client";
import { metaConnection, metaWebhookEvent, order, orderItem, transaction } from "@acme/db/schema";

import { sendMetaInboxReply } from "../lib/meta";
import { businessScopedProcedure } from "../trpc";

const ORDER_STATUSES = ["pending", "confirmed", "paid", "shipped", "delivered", "cancelled", "returned"] as const;
type OrderStatus = (typeof ORDER_STATUSES)[number];

const STATUS_MESSAGE: Partial<Record<OrderStatus, (orderNumber: string) => string>> = {
  shipped: (n) => `Good news! Your order #${n} has been shipped and is on its way to you.`,
  delivered: (n) => `Your order #${n} has been delivered. Thank you for shopping with us!`,
  cancelled: (n) => `Your order #${n} has been cancelled. Reply here if you have any questions.`,
  returned: (n) => `We've received your return for order #${n}. We'll be in touch about next steps.`,
};

/**
 * Best-effort notification back into the original chat thread when an order's
 * fulfillment status changes — mirrors inbox.sendReply's exact send + logging pattern so
 * the message shows up in that thread's history too. Failures are swallowed (logged only):
 * a messaging hiccup must never fail the status update itself, and a manually-created
 * order (channel "manual", no real thread) has nowhere to send to in the first place.
 */
async function notifyCustomerOfStatus(
  db: typeof Db,
  businessId: string,
  orderRow: { channel: string | null; threadId: string | null; orderNumber: string },
  status: OrderStatus,
): Promise<void> {
  const build = STATUS_MESSAGE[status];
  if (!build) return;
  if (!orderRow.channel || !orderRow.threadId) return;
  if (orderRow.channel !== "facebook_page" && orderRow.channel !== "instagram" && orderRow.channel !== "whatsapp") return;

  const platform = orderRow.channel;
  const separatorIndex = orderRow.threadId.indexOf(":");
  const recipientId = separatorIndex >= 0 ? orderRow.threadId.slice(separatorIndex + 1) : null;
  if (!recipientId) return;

  try {
    const [connection] = await db
      .select()
      .from(metaConnection)
      .where(and(eq(metaConnection.businessId, businessId), eq(metaConnection.platform, platform)))
      .limit(1);
    if (!connection) return;

    const accessToken = connection.accessToken ?? connection.facebookPageAccessToken ?? connection.whatsappAccessToken;
    if (!accessToken) return;

    const text = build(orderRow.orderNumber);
    const sent = await sendMetaInboxReply({
      platform,
      accessToken,
      accountId: platform === "instagram" ? (connection.facebookPageId ?? connection.platformAccountId) : connection.platformAccountId,
      recipientId,
      text,
    });

    await db.insert(metaWebhookEvent).values({
      dedupeKey: `order-status:${orderRow.threadId}:${status}:${Date.now()}:${crypto.randomUUID()}`,
      platform,
      object: platform === "instagram" ? "instagram" : "page",
      eventType: "outbound",
      metaConnectionId: connection.id,
      userId: connection.userId,
      businessId,
      platformAccountId: connection.platformAccountId,
      sourceId: sent.messageId ?? null,
      rawPayload: {
        direction: "outbound",
        threadKey: orderRow.threadId,
        recipientId,
        accountId: connection.platformAccountId,
        platform,
        text,
        response: sent.raw,
      },
      headers: {},
      status: "sent",
      sentBy: "system",
      processedAt: new Date(),
    });
  } catch (err) {
    console.error(`[orders.updateStatus] Failed to notify customer for order ${orderRow.orderNumber}:`, err);
  }
}

export const ordersRouter = {
  /** Live price/stock preview for the manual order form — same pricing logic the AI agent uses. */
  quote: businessScopedProcedure
    .input(
      z.object({
        productId: z.string(),
        variantId: z.string().optional(),
        quantity: z.number().min(1),
        district: z.string().optional(),
        offerCode: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return quoteOrder({ businessId: ctx.businessId, ...input });
    }),

  /**
   * Manual order creation — for when a human agent (not the AI) handled the chat and needs
   * to place the order themselves. Reuses the exact same customer-upsert/pricing/inventory
   * logic as the AI's automatic checkout (createCustomerAndOrder), just triggered by a person.
   */
  create: businessScopedProcedure
    .input(
      z.object({
        threadId: z.string(),
        channel: z.string().default("manual"),
        productId: z.string(),
        variantId: z.string().optional(),
        quantity: z.number().min(1),
        customerName: z.string().min(1),
        phone: z.string().min(1),
        address: z.string().min(1),
        district: z.string().optional(),
        offerCode: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return createCustomerAndOrder({ userId: ctx.businessOwnerId, businessId: ctx.businessId, ...input });
    }),

  list: businessScopedProcedure.query(async ({ ctx }) => {
    const businessId = ctx.businessId;
    const orders = await ctx.db
      .select()
      .from(order)
      .where(eq(order.businessId, businessId))
      .orderBy(desc(order.createdAt));

    const items =
      orders.length > 0
        ? await ctx.db.select().from(orderItem).where(inArray(orderItem.orderId, orders.map((o) => o.id)))
        : [];

    return { orders, items };
  }),

  getById: businessScopedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const businessId = ctx.businessId;

      const [ord] = await ctx.db
        .select()
        .from(order)
        .where(and(eq(order.id, input.id), eq(order.businessId, businessId)))
        .limit(1);

      if (!ord) return null;

      const items = await ctx.db
        .select()
        .from(orderItem)
        .where(eq(orderItem.orderId, input.id));

      return { ...ord, items };
    }),

  updateStatus: businessScopedProcedure
    .input(
      z.object({
        id: z.string(),
        status: z.enum(ORDER_STATUSES),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const businessId = ctx.businessId;

      const [updated] = await ctx.db
        .update(order)
        .set({ status: input.status })
        .where(and(eq(order.id, input.id), eq(order.businessId, businessId)))
        .returning({ channel: order.channel, threadId: order.threadId, orderNumber: order.orderNumber });
      if (!updated) return { success: false };

      // COD money is only actually collected at the doorstep — flip the ledger entry from
      // "pending" to "success" once delivery is confirmed, so the Payments page's Pending
      // COD vs Total Collected split reflects reality, not just order status.
      if (input.status === "delivered") {
        await ctx.db
          .update(transaction)
          .set({ status: "success" })
          .where(and(eq(transaction.orderId, input.id), eq(transaction.method, "cod"), eq(transaction.status, "pending")));
      }
      if (input.status === "cancelled" || input.status === "returned") {
        await ctx.db
          .update(transaction)
          .set({ status: "failed" })
          .where(and(eq(transaction.orderId, input.id), eq(transaction.method, "cod"), eq(transaction.status, "pending")));
      }

      // Fire-and-forget from the caller's perspective — awaited here so failures are
      // caught by the try/catch inside, but never throws past this point.
      await notifyCustomerOfStatus(ctx.db, businessId, updated, input.status);

      return { success: true };
    }),

  delete: businessScopedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const businessId = ctx.businessId;

      // Delete order items first (cascade should handle, but be explicit)
      await ctx.db
        .delete(orderItem)
        .where(eq(orderItem.orderId, input.id));

      await ctx.db
        .delete(order)
        .where(and(eq(order.id, input.id), eq(order.businessId, businessId)));

      return { success: true };
    }),
} satisfies TRPCRouterRecord;
