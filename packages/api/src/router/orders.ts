import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod";

import { desc, eq, and, inArray, sql, createCustomerAndOrder, quoteOrder } from "@acme/db";
import type { db as Db } from "@acme/db/client";
import { metaConnection, metaWebhookEvent, order, orderItem, orderStatusHistory, transaction } from "@acme/db/schema";
import { getNotificationPreference, resolveNotificationRecipient } from "@acme/db/helpers/notification-preferences";
import { sendEmail } from "@acme/auth/email";

import { recordOrderStatusChange } from "../lib/order-audit";
import { sendMetaInboxReply } from "../lib/meta";
import { businessScopedProcedure } from "../trpc";

const ORDER_STATUSES = ["pending", "confirmed", "paid", "shipped", "delivered", "cancelled", "returned"] as const;
type OrderStatus = (typeof ORDER_STATUSES)[number];

const CHAT_PLATFORMS = new Set(["facebook_page", "instagram", "whatsapp"]);

const STATUS_MESSAGE: Partial<Record<OrderStatus, (orderNumber: string) => string>> = {
  shipped: (n) => `Good news! Your order #${n} has been shipped and is on its way to you.`,
  delivered: (n) => `Your order #${n} has been delivered. Thank you for shopping with us!`,
  cancelled: (n) => `Your order #${n} has been cancelled. Reply here if you have any questions.`,
  returned: (n) => `We've received your return for order #${n}. We'll be in touch about next steps.`,
};

/**
 * Best-effort system message back into a chat thread — shared by the order-status
 * notifier below and manual order creation. Mirrors inbox.sendReply's exact send +
 * logging pattern so the message shows up in that thread's history too. Failures are
 * swallowed (logged only): a messaging hiccup must never fail the mutation that
 * triggered it, and a thread with no real platform (channel "manual", no matching
 * connection, etc.) has nowhere to send to in the first place.
 */
async function sendThreadMessage(
  db: typeof Db,
  businessId: string,
  channel: string | null,
  threadId: string | null,
  text: string,
  dedupeKey: string,
): Promise<void> {
  if (!channel || !threadId) return;
  if (channel !== "facebook_page" && channel !== "instagram" && channel !== "whatsapp") return;

  const platform = channel;
  const separatorIndex = threadId.indexOf(":");
  const recipientId = separatorIndex >= 0 ? threadId.slice(separatorIndex + 1) : null;
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

    const sent = await sendMetaInboxReply({
      platform,
      accessToken,
      accountId: platform === "instagram" ? (connection.facebookPageId ?? connection.platformAccountId) : connection.platformAccountId,
      recipientId,
      text,
    });

    await db.insert(metaWebhookEvent).values({
      dedupeKey,
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
        threadKey: threadId,
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
    console.error(`[sendThreadMessage] Failed to send to thread ${threadId}:`, err);
  }
}

async function notifyCustomerOfStatus(
  db: typeof Db,
  businessId: string,
  orderRow: { channel: string | null; threadId: string | null; orderNumber: string },
  status: OrderStatus,
): Promise<void> {
  const build = STATUS_MESSAGE[status];
  if (!build) return;
  await sendThreadMessage(
    db,
    businessId,
    orderRow.channel,
    orderRow.threadId,
    build(orderRow.orderNumber),
    `order-status:${orderRow.threadId}:${status}:${Date.now()}:${crypto.randomUUID()}`,
  );
}

/** Order confirmation message sent into the chat right after a staff member manually
 * creates an order from the inbox (orders.create below) — the AI already announces its
 * own orders as part of its normal reply, but a manually-created one needs the same
 * "here's what I just ordered for you" moment since no AI turn produced it. */
function buildOrderCreatedMessage(
  orderNumber: string,
  items: { name: string; variantTitle: string | null; qty: number }[],
  total: number,
  paymentMethod: "cod" | "online",
  paymentUrl: string | null | undefined,
): string {
  const lines = items.map((i) => `- ${i.qty}x ${i.name}${i.variantTitle ? ` (${i.variantTitle})` : ""}`);
  const base = `Your order #${orderNumber} has been placed!\n${lines.join("\n")}\nTotal: ৳${total.toLocaleString()}`;
  return paymentMethod === "cod"
    ? `${base}\nCash on delivery — pay when it arrives.`
    : `${base}\nComplete your payment here: ${paymentUrl}`;
}

export const ordersRouter = {
  /** Live price/stock preview for the manual order form — same pricing logic the AI agent
   * uses. The form itself is still single-product + one optional combo item (see
   * create-order-sheet.tsx); translated to quoteOrder's items[] shape here so the
   * underlying pricing helper only has one calling convention to support. */
  quote: businessScopedProcedure
    .input(
      z.object({
        productId: z.string(),
        variantId: z.string().optional(),
        quantity: z.number().min(1),
        district: z.string().optional(),
        offerCode: z.string().optional(),
        comboProductId: z.string().optional(),
        comboVariantId: z.string().optional(),
        comboQuantity: z.number().min(1).optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { productId, variantId, quantity, comboProductId, comboVariantId, comboQuantity, district, offerCode } = input;
      const items = [
        { productId, variantId, quantity },
        ...(comboProductId ? [{ productId: comboProductId, variantId: comboVariantId, quantity: comboQuantity ?? 1 }] : []),
      ];
      return quoteOrder({ businessId: ctx.businessId, items, district, offerCode });
    }),

  /**
   * Manual order creation — for when a human agent (not the AI) handled the chat and needs
   * to place the order themselves. Reuses the exact same customer-upsert/pricing/inventory
   * logic as the AI's automatic checkout (createCustomerAndOrder), just triggered by a person
   * — including combo/bundle items and payment method, same as the AI supports. customerName/
   * phone/address are optional here too: if this thread already has a linked customer (from
   * an earlier order), omitted fields are filled in from that record automatically.
   */
  create: businessScopedProcedure
    .input(
      z.object({
        threadId: z.string(),
        channel: z.string().default("manual"),
        productId: z.string(),
        variantId: z.string().optional(),
        quantity: z.number().min(1),
        customerName: z.string().optional(),
        phone: z.string().optional(),
        address: z.string().optional(),
        district: z.string().optional(),
        offerCode: z.string().optional(),
        comboProductId: z.string().optional(),
        comboVariantId: z.string().optional(),
        comboQuantity: z.number().min(1).optional(),
        paymentMethod: z.enum(["cod", "online"]).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // A manual order placed from an open inbox thread should be tagged with that
      // thread's real platform (threadId is always `${platform}:${senderId}`, per
      // packages/messaging/src/platforms/facebook.ts) rather than the generic "manual"
      // default — otherwise there's no way to send the confirmation message below, or
      // any later COD/payment notification (order-status-notify), back into the chat.
      const threadPlatform = input.threadId.split(":")[0] ?? "";
      const channel = CHAT_PLATFORMS.has(threadPlatform) ? threadPlatform : input.channel;
      const { productId, variantId, quantity, comboProductId, comboVariantId, comboQuantity, ...rest } = input;
      const items = [
        { productId, variantId, quantity },
        ...(comboProductId ? [{ productId: comboProductId, variantId: comboVariantId, quantity: comboQuantity ?? 1 }] : []),
      ];

      const result = await createCustomerAndOrder({
        userId: ctx.businessOwnerId,
        businessId: ctx.businessId,
        ...rest,
        items,
        channel,
      });

      if (result.success && result.orderId) {
        const items = await ctx.db.select().from(orderItem).where(eq(orderItem.orderId, result.orderId));
        const text = buildOrderCreatedMessage(
          result.orderNumber,
          items.map((i) => ({ name: i.name, variantTitle: i.variantTitle, qty: i.qty })),
          result.total,
          result.paymentMethod,
          result.paymentUrl,
        );
        await sendThreadMessage(ctx.db, ctx.businessId, channel, input.threadId, text, `order-created:${result.orderId}`);

        // FR-SET-04: send new_order email if emailEnabled
        const { emailEnabled } = await getNotificationPreference(ctx.businessId, "new_order");
        if (emailEnabled) {
          const recipientEmail = await resolveNotificationRecipient(ctx.businessId);
          if (recipientEmail) {
            const appUrl = process.env.APP_URL ?? "http://localhost:3000";
            const orderUrl = `${appUrl}/${ctx.businessId}/dashboard/orders`;
            await sendEmail({
              to: recipientEmail,
              subject: `New order #${result.orderNumber} — ৳${result.total.toLocaleString()}`,
              html: `<p>New order <strong>#${result.orderNumber}</strong> placed for <strong>৳${result.total.toLocaleString()}</strong>. <a href="${orderUrl}">View order</a></p>`,
              text: `New order #${result.orderNumber} placed for ৳${result.total.toLocaleString()}. View: ${orderUrl}`,
            }).catch((err) => console.error("[orders.create] Failed to send new_order email:", err));
          }
        }

        // FR-SET-04: send low_stock emails if any variants crossed threshold
        if (result.lowStockAlerts?.length) {
          const { emailEnabled: lowStockEmailEnabled } = await getNotificationPreference(ctx.businessId, "low_stock");
          const { inAppEnabled: lowStockInAppEnabled } = await getNotificationPreference(ctx.businessId, "low_stock");
          if (lowStockEmailEnabled) {
            const recipientEmail = await resolveNotificationRecipient(ctx.businessId);
            if (recipientEmail) {
              const alerts = result.lowStockAlerts.map((a) => `${a.name} (${a.remaining} left, threshold: ${a.threshold})`).join(", ");
              const appUrl = process.env.APP_URL ?? "http://localhost:3000";
              await sendEmail({
                to: recipientEmail,
                subject: `⚠️ Low stock alert — ${result.lowStockAlerts.length} product(s) running low`,
                html: `<p>Low stock: ${alerts}. <a href="${appUrl}/${ctx.businessId}/dashboard/products">View products</a></p>`,
                text: `Low stock: ${alerts}. View: ${appUrl}/${ctx.businessId}/dashboard/products`,
              }).catch((err) => console.error("[orders.create] Failed to send low_stock email:", err));
            }
          }
        }
      }

      return result;
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
        note: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const businessId = ctx.businessId;

      const [existingOrder] = await ctx.db
        .select({ status: order.status })
        .from(order)
        .where(and(eq(order.id, input.id), eq(order.businessId, businessId)))
        .limit(1);

      const [updated] = await ctx.db
        .update(order)
        .set({
          status: input.status,
          // COALESCE, not an unconditional overwrite — a later re-confirm of "delivered"
          // (or any other field edit after delivery) must never reset the review-request
          // sweep's delay window.
          deliveredAt: input.status === "delivered" ? sql`COALESCE(${order.deliveredAt}, NOW())` : undefined,
        })
        .where(and(eq(order.id, input.id), eq(order.businessId, businessId)))
        .returning({ channel: order.channel, threadId: order.threadId, orderNumber: order.orderNumber });
      if (!updated) return { success: false };

      // Record audit history log (FR-ORD-03)
      void recordOrderStatusChange({
        businessId,
        orderId: input.id,
        fromStatus: existingOrder?.status ?? null,
        toStatus: input.status,
        changedBy: "merchant",
        changedById: ctx.session.user.id,
        changedByName: ctx.session.user.name,
        note: input.note,
      });

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

  getStatusHistory: businessScopedProcedure
    .input(z.object({ orderId: z.string() }))
    .query(async ({ ctx, input }) => {
      const history = await ctx.db
        .select()
        .from(orderStatusHistory)
        .where(and(eq(orderStatusHistory.businessId, ctx.businessId), eq(orderStatusHistory.orderId, input.orderId)))
        .orderBy(desc(orderStatusHistory.createdAt));
      return history;
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
