import type { TRPCRouterRecord } from "@trpc/server";

import { and, desc, eq, inArray } from "@acme/db";
import { agentSession, customer, metaWebhookEvent, offer, order, orderItem, product } from "@acme/db/schema";

import { permissionAnyProcedure } from "../trpc";

// Overview blends orders/revenue, product/customer counts, offers, and conversation stats —
// no single resource owns all of it, so access requires holding view on at least one of the
// resources it actually surfaces, rather than being open to every business member regardless
// of their configured scope (SRS §5.4: RBAC must restrict staff to their configured scopes).
const OVERVIEW_ACCESS = [
  ["orders", "view"],
  ["products", "view"],
  ["customers", "view"],
  ["analytics", "view"],
] as const;

export const dashboardRouter = {
  getOverview: permissionAnyProcedure(OVERVIEW_ACCESS).query(async ({ ctx }) => {
    const businessId = ctx.businessId;

    const [orders, products, customers, offers, recentEvents, sessions] = await Promise.all([
      ctx.db.select().from(order).where(eq(order.businessId, businessId)).orderBy(desc(order.createdAt)),
      ctx.db.select().from(product).where(eq(product.businessId, businessId)),
      ctx.db.select().from(customer).where(eq(customer.businessId, businessId)),
      ctx.db.select().from(offer).where(eq(offer.businessId, businessId)),
      ctx.db
        .select()
        .from(metaWebhookEvent)
        .where(
          and(
            eq(metaWebhookEvent.businessId, businessId),
            inArray(metaWebhookEvent.eventType, ["message", "messages", "outbound"]),
          ),
        )
        .orderBy(desc(metaWebhookEvent.receivedAt))
        .limit(500),
      // FR-DSH-01 — Conversations/Conversion Rate cards need real per-day conversation
      // counts, distinct from messageStats.total (raw message events, not conversations).
      ctx.db
        .select({ id: agentSession.id, createdAt: agentSession.createdAt })
        .from(agentSession)
        .where(eq(agentSession.businessId, businessId)),
    ]);

    const recentOrderIds = orders.slice(0, 10).map((o) => o.id);
    const recentItems =
      recentOrderIds.length > 0
        ? await ctx.db.select().from(orderItem).where(inArray(orderItem.orderId, recentOrderIds))
        : [];

    const now = Date.now();

    return {
      orders,
      sessions,
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
