/**
 * Grounding queries for the Executive AI Copilot (B.8) — real DB aggregates the copilot's
 * tools call into, so every number it states is a genuine query result, never a model
 * guess. Deliberately separate from analytics.ts's getSummary, which computes a whole
 * dashboard payload for a handful of preset ranges by pulling raw rows into JS — these
 * take an arbitrary [from, to) window (the copilot itself decides the window based on
 * what the owner asked) and aggregate in the DB instead, since a chat answer only needs
 * a few numbers, not every chart's worth of rows.
 */
import { and, eq, gte, lt, sql } from "@acme/db";
import type { db as Db } from "@acme/db/client";
import { customer, order, orderItem } from "@acme/db/schema";

export interface SalesSummary {
  orderCount: number;
  revenue: number;
  averageOrderValue: number;
  newCustomers: number;
}

export async function getSalesSummary(
  ctx: { db: typeof Db },
  businessId: string,
  from: Date,
  to: Date,
): Promise<SalesSummary> {
  const [orderRow] = await ctx.db
    .select({
      orderCount: sql<number>`count(*)`,
      revenue: sql<number>`coalesce(sum(${order.total}), 0)`,
    })
    .from(order)
    .where(and(eq(order.businessId, businessId), gte(order.createdAt, from), lt(order.createdAt, to)));

  const [customerRow] = await ctx.db
    .select({ count: sql<number>`count(*)` })
    .from(customer)
    .where(and(eq(customer.businessId, businessId), gte(customer.createdAt, from), lt(customer.createdAt, to)));

  const orderCount = Number(orderRow?.orderCount ?? 0);
  const revenue = Number(orderRow?.revenue ?? 0);

  return {
    orderCount,
    revenue,
    averageOrderValue: orderCount > 0 ? Math.round(revenue / orderCount) : 0,
    newCustomers: Number(customerRow?.count ?? 0),
  };
}

export interface TopProductRow {
  name: string;
  qty: number;
  revenue: number;
}

export async function getTopProducts(
  ctx: { db: typeof Db },
  businessId: string,
  from: Date,
  to: Date,
  limit = 5,
): Promise<TopProductRow[]> {
  const rows = await ctx.db
    .select({
      name: orderItem.name,
      qty: sql<number>`sum(${orderItem.qty})`,
      revenue: sql<number>`sum(${orderItem.lineTotal})`,
    })
    .from(orderItem)
    .innerJoin(order, eq(orderItem.orderId, order.id))
    .where(and(eq(order.businessId, businessId), gte(order.createdAt, from), lt(order.createdAt, to)))
    .groupBy(orderItem.name)
    .orderBy(sql`sum(${orderItem.lineTotal}) desc`)
    .limit(limit);

  return rows.map((r) => ({ name: r.name, qty: Number(r.qty), revenue: Number(r.revenue) }));
}

export interface ChannelBreakdownRow {
  channel: string;
  orderCount: number;
  revenue: number;
}

/** Full-tier only (channel comparison, e.g. "Instagram vs Messenger this quarter") —
 * gated at the tool-availability layer in copilot-agent.ts, not here. */
export async function getChannelBreakdown(
  ctx: { db: typeof Db },
  businessId: string,
  from: Date,
  to: Date,
): Promise<ChannelBreakdownRow[]> {
  const rows = await ctx.db
    .select({
      channel: order.channel,
      orderCount: sql<number>`count(*)`,
      revenue: sql<number>`coalesce(sum(${order.total}), 0)`,
    })
    .from(order)
    .where(and(eq(order.businessId, businessId), gte(order.createdAt, from), lt(order.createdAt, to)))
    .groupBy(order.channel);

  return rows.map((r) => ({
    channel: r.channel ?? "unknown",
    orderCount: Number(r.orderCount),
    revenue: Number(r.revenue),
  }));
}
