import type { TRPCRouterRecord } from "@trpc/server";

import { and, desc, eq, inArray } from "@acme/db";
import { customer, metaWebhookEvent, offer, order, orderItem, product } from "@acme/db/schema";

import { storeProcedure } from "../trpc";

export const dashboardRouter = {
  getOverview: storeProcedure.query(async ({ ctx }) => {
    const organizationId = ctx.organizationId;

    const [orders, products, customers, offers, recentEvents] = await Promise.all([
      ctx.db.select().from(order).where(eq(order.organizationId, organizationId)).orderBy(desc(order.createdAt)),
      ctx.db.select().from(product).where(eq(product.organizationId, organizationId)),
      ctx.db.select().from(customer).where(eq(customer.organizationId, organizationId)),
      ctx.db.select().from(offer).where(eq(offer.organizationId, organizationId)),
      ctx.db
        .select()
        .from(metaWebhookEvent)
        .where(
          and(
            eq(metaWebhookEvent.organizationId, organizationId),
            inArray(metaWebhookEvent.eventType, ["message", "messages", "outbound"]),
          ),
        )
        .orderBy(desc(metaWebhookEvent.receivedAt))
        .limit(500),
    ]);

    const recentOrderIds = orders.slice(0, 10).map((o) => o.id);
    const recentItems =
      recentOrderIds.length > 0
        ? await ctx.db.select().from(orderItem).where(inArray(orderItem.orderId, recentOrderIds))
        : [];

    const now = Date.now();

    return {
      orders,
      productCount: products.length,
      customerCount: customers.length,
      activeOfferCount: offers.filter((o) => o.active && (!o.endDate || o.endDate.getTime() > now))
        .length,
      recentItems,
      messageStats: {
        total: recentEvents.length,
        inbound: recentEvents.filter((e) => e.eventType !== "outbound").length,
        outbound: recentEvents.filter((e) => e.eventType === "outbound").length,
        platformBreakdown: {
          instagram: recentEvents.filter((e) => e.platform === "instagram").length,
          whatsapp: recentEvents.filter((e) => e.platform === "whatsapp").length,
          facebook: recentEvents.filter((e) => e.platform === "facebook_page").length,
        },
      },
    };
  }),
} satisfies TRPCRouterRecord;
