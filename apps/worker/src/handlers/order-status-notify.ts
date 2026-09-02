/**
 * Sends one confirmation message back into the customer's chat thread when COD is
 * confirmed or online payment succeeds on the /pay/[token] checkout page (see
 * packages/api/src/router/checkout.ts's confirmCod/markOrderPaid, which enqueue this job
 * via packages/api/src/lib/notify-queue.ts). Deliberately NOT wired to fail/cancel — a
 * failed payment attempt shouldn't ping the customer, they're likely mid-retry on the
 * same page already.
 */
import { and, eq } from "@acme/db";
import { db } from "@acme/db/client";
import { order, metaConnection } from "@acme/db/schema";
import { MessagingService } from "@acme/messaging";
import type { PlatformConnection, PlatformType } from "@acme/messaging";
import type { Job, OrderStatusNotifyJob } from "@acme/queue";

const messagingService = new MessagingService();

// order.channel is populated straight from ConversationContext.platform at order-creation
// time (see packages/ai-agent/src/tools/order-tools.ts's createOrderTool), so it already
// uses this exact vocabulary — no "messenger" -> "facebook_page" translation needed here,
// unlike agentSession.channel elsewhere in this codebase.
const VALID_PLATFORMS = new Set<PlatformType>(["facebook_page", "instagram", "whatsapp"]);

function formatCurrency(amount: number): string {
  return `৳${amount.toLocaleString()}`;
}

function buildNotificationText(orderRow: typeof order.$inferSelect): string | null {
  if (orderRow.paymentMethod === "cod" && orderRow.status === "confirmed") {
    return `Your order #${orderRow.orderNumber} is confirmed! Cash on delivery — pay ${formatCurrency(orderRow.total)} when it arrives.`;
  }
  if (orderRow.status === "paid") {
    return `Payment received for order #${orderRow.orderNumber}! Your order is confirmed and on its way.`;
  }
  return null; // unrecognized status/paymentMethod combo — nothing to say
}

export async function handleOrderStatusNotify(job: Job<OrderStatusNotifyJob>): Promise<void> {
  const { businessId, orderId } = job.data;

  try {
    const orderRow = await db.query.order.findFirst({ where: eq(order.id, orderId) });
    if (!orderRow || orderRow.businessId !== businessId) {
      console.warn(`[OrderStatusNotify] Order ${orderId} not found for business ${businessId}`);
      return;
    }

    if (!orderRow.channel || !orderRow.threadId) {
      console.warn(`[OrderStatusNotify] Order ${orderId} has no channel/threadId — likely created outside chat, skipping`);
      return;
    }
    if (!VALID_PLATFORMS.has(orderRow.channel as PlatformType)) {
      console.warn(`[OrderStatusNotify] Order ${orderId} has unrecognized channel: ${orderRow.channel}`);
      return;
    }
    const platform = orderRow.channel as PlatformType;

    // threadId is built as `${platform}:${senderId}` — see
    // packages/messaging/src/platforms/facebook.ts (Instagram/WhatsApp follow the same
    // convention) — so the recipient id is everything after the first colon.
    const recipientId = orderRow.threadId.slice(platform.length + 1);
    if (!recipientId) {
      console.warn(`[OrderStatusNotify] Could not parse recipientId from threadId: ${orderRow.threadId}`);
      return;
    }

    const text = buildNotificationText(orderRow);
    if (!text) return;

    const [conn] = await db
      .select()
      .from(metaConnection)
      // status: a paused channel is one the merchant disconnected — it must not send
      // proactive notifications, only keep receiving.
      .where(
        and(
          eq(metaConnection.businessId, businessId),
          eq(metaConnection.platform, platform),
          eq(metaConnection.status, "active"),
        ),
      )
      .limit(1);
    if (!conn?.accessToken) {
      console.warn(`[OrderStatusNotify] No active ${platform} connection for business ${businessId}`);
      return;
    }

    const connection: PlatformConnection = {
      id: conn.id,
      platform,
      accountId: conn.platformAccountId,
      accessToken: conn.accessToken,
      isActive: true,
      connectedAt: conn.connectedAt,
    };

    const result = await messagingService.sendMessage(connection, { platform, recipientId, text });
    if (!result.success) {
      console.warn(`[OrderStatusNotify] Failed to send for order ${orderId}: ${result.error}`);
    }
  } catch (err) {
    // Never let a notification failure surface as a job-retry storm — the underlying
    // order/payment already succeeded by the time this job runs.
    console.error(`[OrderStatusNotify] Failed for order ${orderId}:`, err);
  }
}
