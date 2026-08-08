/**
 * Post-delivery review-request sweep (spec §6 "Review & Feedback Collection" — Growth &
 * Pro; Starter gets none). Finds orders that have sat "delivered" for a fixed window and
 * asks once for feedback — a simple templated message, not LLM-personalized (the pricing
 * doc doesn't tier this feature's message quality, only its availability, unlike
 * abandoned-cart recovery). A customer's reply is captured by the agent's submitReview
 * tool (packages/ai-agent/src/tools/order-tools.ts), not by this sweep.
 */
import { and, eq, inArray, isNull, lt } from "@acme/db";
import { db } from "@acme/db/client";
import { order, orderItem, metaConnection } from "@acme/db/schema";
import { createNotification } from "@acme/db/helpers/aiHelpers";
import { MessagingService } from "@acme/messaging";
import type { PlatformConnection, PlatformType } from "@acme/messaging";
import { PLAN_CATALOG, type PlanKey } from "@acme/api/plans";

import { getBusinessPlanKeys } from "../lib/plan.js";

// Fixed, not configurable per business — the spec gives no per-business delay setting for
// this (unlike abandoned-cart's abandonedFollowupMinutes), and a day is a reasonable
// default: long enough that the product has actually been used/tried, short enough that
// the order is still fresh in the customer's mind.
const REVIEW_REQUEST_DELAY_MS = 24 * 60 * 60 * 1000;

// order.channel uses the same messenger/instagram/whatsapp vocabulary as agentSession.channel.
const CHANNEL_TO_PLATFORM: Partial<Record<string, PlatformType>> = {
  messenger: "facebook_page",
  instagram: "instagram",
  whatsapp: "whatsapp",
};

const messagingService = new MessagingService();

function buildReviewRequestText(itemNames: string[]): string {
  const itemsPart = itemNames.length > 0 ? ` your ${itemNames.join(", ")}` : " your order";
  return `Hope you're enjoying${itemsPart}! We'd love to hear what you think — reply here with a quick rating (1-5) and any feedback.`;
}

async function sendReviewRequest(ord: typeof order.$inferSelect): Promise<boolean> {
  const platform = CHANNEL_TO_PLATFORM[ord.channel ?? ""];
  if (!platform || !ord.threadId) return false;

  const [conn] = await db
    .select()
    .from(metaConnection)
    .where(and(eq(metaConnection.businessId, ord.businessId), eq(metaConnection.platform, platform)))
    .limit(1);
  if (!conn?.accessToken) return false;

  const senderId = ord.threadId.split(":")[1];
  if (!senderId) return false;

  const connection: PlatformConnection = {
    id: conn.id,
    platform,
    accountId: conn.platformAccountId,
    accessToken: conn.accessToken,
    isActive: true,
    connectedAt: conn.connectedAt,
  };

  const items = await db.select({ name: orderItem.name }).from(orderItem).where(eq(orderItem.orderId, ord.id));
  const text = buildReviewRequestText(items.map((i) => i.name));

  const result = await messagingService.sendMessage(connection, { platform, recipientId: senderId, text });
  return result.success;
}

export async function runReviewRequestSweep(): Promise<void> {
  const cutoff = new Date(Date.now() - REVIEW_REQUEST_DELAY_MS);
  const due = await db
    .select()
    .from(order)
    .where(and(eq(order.status, "delivered"), lt(order.deliveredAt, cutoff), isNull(order.reviewRequestSentAt)));

  if (due.length === 0) return;

  const businessIds = [...new Set(due.map((o) => o.businessId))];
  const planByBusiness = await getBusinessPlanKeys(businessIds);

  const eligibleFor = (planKey: PlanKey) => PLAN_CATALOG[planKey].limits.reviewCollectionEnabled;
  const skipped = due.filter((o) => !eligibleFor(planByBusiness.get(o.businessId) ?? "starter"));
  const sendable = due.filter((o) => eligibleFor(planByBusiness.get(o.businessId) ?? "starter"));

  console.log(`[review-request] ${sendable.length} due (Growth/Pro), ${skipped.length} skipped (Starter), out of ${due.length} candidate(s)`);

  if (skipped.length > 0) {
    await db
      .update(order)
      .set({ reviewRequestSentAt: new Date() })
      .where(inArray(order.id, skipped.map((o) => o.id)));
  }

  for (const ord of sendable) {
    try {
      const sent = await sendReviewRequest(ord);
      // Mark attempted either way — a dead/revoked connection shouldn't retry forever.
      await db.update(order).set({ reviewRequestSentAt: new Date() }).where(eq(order.id, ord.id));
      if (sent) {
        await createNotification({
          businessId: ord.businessId,
          type: "review_request_sent",
          title: "Review request sent",
          body: `Asked ${ord.customerName} for feedback on order #${ord.orderNumber}`,
          link: "/dashboard/orders",
        }).catch((err) => console.error(`[review-request] Failed to create notification for order ${ord.id}:`, err));
      } else {
        console.warn(`[review-request] send failed for order ${ord.id}`);
      }
    } catch (err) {
      console.error(`[review-request] failed for order ${ord.id}:`, err);
    }
  }
}
