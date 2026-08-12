import type { TRPCRouterRecord } from "@trpc/server";

import { and, desc, eq, inArray } from "@acme/db";
import {
  agentSession,
  conversationMeta,
  customer,
  metaConnection,
  metaWebhookEvent,
  offer,
  order,
  orderItem,
  product,
} from "@acme/db/schema";

import { buildInboxData } from "../lib/meta-inbox";
import { permissionProcedure } from "../trpc";

export const dashboardRouter = {
  /** The Overview dashboard (FR-DSH-01) blends orders/revenue, product/customer counts,
   * offers, and conversation stats — but unlike before, access is gated on a single
   * dedicated "overview:view" permission so a store owner can grant the Overview page
   * independently of (or without) the individual orders/products/customers/analytics
   * resources (SRS §5.4: RBAC must restrict staff to their configured scopes). */
  getOverview: permissionProcedure("overview", "view").query(async ({ ctx }) => {
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

  /** FR-DSH-03 — active (non-archived) conversations right now, split by handling mode,
   * mirroring the same defaults getInboxData uses (status ?? "open", handlingMode ?? "ai")
   * but without the full per-thread merge (tags/orders/summaries) a count doesn't need.
   * Gated on "inbox" view since it surfaces the same underlying data as the Inbox page. */
  getLiveConversations: permissionProcedure("inbox", "view").query(async ({ ctx }) => {
    const businessId = ctx.businessId;

    const [events, connections, metas] = await Promise.all([
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
        .select({
          threadId: conversationMeta.threadId,
          status: conversationMeta.status,
          handlingMode: conversationMeta.handlingMode,
        })
        .from(conversationMeta)
        .where(eq(conversationMeta.businessId, businessId)),
    ]);

    const data = buildInboxData({ events, connections });
    const metaByThread = new Map(metas.map((m) => [m.threadId, m]));

    const active = data.threads.filter((t) => (metaByThread.get(t.id)?.status ?? "open") !== "archived");
    const ai = active.filter((t) => (metaByThread.get(t.id)?.handlingMode ?? "ai") === "ai").length;

    return { ai, human: active.length - ai, total: active.length };
  }),
} satisfies TRPCRouterRecord;
