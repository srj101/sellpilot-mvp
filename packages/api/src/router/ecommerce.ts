import type { TRPCRouterRecord } from "@trpc/server";

import { eq } from "@acme/db";
import { customer, offer, order, pageView, product, productVariant } from "@acme/db/schema";

import { storeProcedure } from "../trpc";

const DAY = 86_400_000;
const WINDOW_DAYS = 30;
const SERIES_DAYS = 14;
const LOW_STOCK_THRESHOLD = 10;

function trendPct(curr: number, prev: number) {
  if (prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}

export const ecommerceRouter = {
  getOverview: storeProcedure.query(async ({ ctx }) => {
    const organizationId = ctx.organizationId;
    const now = Date.now();
    const windowStart = now - WINDOW_DAYS * DAY;
    const prevStart = windowStart - WINDOW_DAYS * DAY;

    const [orders, views, customers, variants, offers] = await Promise.all([
      ctx.db.select().from(order).where(eq(order.organizationId, organizationId)),
      ctx.db.select().from(pageView).where(eq(pageView.organizationId, organizationId)),
      ctx.db.select({ id: customer.id }).from(customer).where(eq(customer.organizationId, organizationId)),
      ctx.db
        .select({
          id: productVariant.id,
          title: productVariant.title,
          inventoryQuantity: productVariant.inventoryQuantity,
          productId: productVariant.productId,
          productTitle: product.title,
          organizationId: product.organizationId,
        })
        .from(productVariant)
        .innerJoin(product, eq(productVariant.productId, product.id))
        .where(eq(product.organizationId, organizationId)),
      ctx.db.select().from(offer).where(eq(offer.organizationId, organizationId)),
    ]);

    const inWindow = (t: number, start: number, end: number) => t >= start && t < end;
    const currentOrders = orders.filter((o) => inWindow(o.createdAt.getTime(), windowStart, now));
    const prevOrders = orders.filter((o) => inWindow(o.createdAt.getTime(), prevStart, windowStart));

    const totalSales = currentOrders.reduce((sum, o) => sum + o.total, 0);
    const prevSales = prevOrders.reduce((sum, o) => sum + o.total, 0);
    const totalOrders = currentOrders.length;
    const prevOrderCount = prevOrders.length;
    const aov = totalOrders > 0 ? totalSales / totalOrders : 0;
    const prevAov = prevOrderCount > 0 ? prevSales / prevOrderCount : 0;

    const currentViews = views.filter((v) => inWindow(v.createdAt.getTime(), windowStart, now));
    const prevViews = views.filter((v) => inWindow(v.createdAt.getTime(), prevStart, windowStart));
    const uniqueVisitorsOf = (rows: typeof views) => new Set(rows.map((v) => v.sessionId)).size;
    const conversionRate = uniqueVisitorsOf(currentViews) > 0 ? (totalOrders / uniqueVisitorsOf(currentViews)) * 100 : 0;
    const prevConversionRate = uniqueVisitorsOf(prevViews) > 0 ? (prevOrderCount / uniqueVisitorsOf(prevViews)) * 100 : 0;

    // Daily sales for the last SERIES_DAYS days.
    const salesSeries: { label: string; total: number; orders: number }[] = [];
    for (let i = SERIES_DAYS - 1; i >= 0; i--) {
      const dayStart = new Date(now).setHours(0, 0, 0, 0) - i * DAY;
      const dayEnd = dayStart + DAY;
      const dayOrders = orders.filter((o) => inWindow(o.createdAt.getTime(), dayStart, dayEnd));
      salesSeries.push({
        label: new Date(dayStart).toLocaleDateString("en-US", { day: "2-digit" }),
        total: dayOrders.reduce((sum, o) => sum + o.total, 0),
        orders: dayOrders.length,
      });
    }

    const inventoryStatus = variants
      .filter((v) => (v.inventoryQuantity ?? 0) < LOW_STOCK_THRESHOLD)
      .sort((a, b) => (a.inventoryQuantity ?? 0) - (b.inventoryQuantity ?? 0))
      .slice(0, 6)
      .map((v) => ({
        name: v.title && v.title !== "Default Title" ? `${v.productTitle} — ${v.title}` : v.productTitle,
        stock: v.inventoryQuantity ?? 0,
        status: (v.inventoryQuantity ?? 0) === 0 ? "Out of Stock" : "Low Stock",
      }));

    // Coupon usage: match orders' couponCode against known offers.
    const usageByCode = new Map<string, { usages: number; discount: number }>();
    for (const o of orders) {
      if (!o.couponCode) continue;
      const existing = usageByCode.get(o.couponCode) ?? { usages: 0, discount: 0 };
      existing.usages += 1;
      existing.discount += o.discountAmount;
      usageByCode.set(o.couponCode, existing);
    }
    const promoCodePerformance = offers
      .filter((o) => o.code)
      .map((o) => {
        const usage = usageByCode.get(o.code!) ?? { usages: 0, discount: 0 };
        return {
          code: o.code!,
          usages: usage.usages,
          type: o.type === "fixed" ? `Fixed ${o.value} Off` : `${o.value}% Off`,
          discount: usage.discount,
        };
      })
      .sort((a, b) => b.usages - a.usages)
      .slice(0, 6);

    return {
      totalSales,
      totalSalesTrend: trendPct(totalSales, prevSales),
      totalOrders,
      totalOrdersTrend: trendPct(totalOrders, prevOrderCount),
      aov,
      aovTrend: trendPct(aov, prevAov),
      conversionRate,
      conversionRateTrend: trendPct(conversionRate, prevConversionRate),
      customerCount: customers.length,
      salesSeries,
      inventoryStatus,
      promoCodePerformance,
    };
  }),
} satisfies TRPCRouterRecord;
