import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";

import { and, eq, gte, inArray, sql } from "@acme/db";
import { agentSession, customKpi, customer, metaWebhookEvent, order, orderItem, pageView, product } from "@acme/db/schema";

import { businessScopedProcedure } from "../trpc";
import { runCopilotQuery } from "../lib/copilot-agent";
import { getFeatureTier } from "../lib/plan-limits";

const DAY = 86_400_000;

const RANGE_DAYS = { "7d": 7, "30d": 30, "90d": 90, "1y": 365 } as const;

function trendPct(curr: number, prev: number) {
  if (prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}

function formatDate(ms: number) {
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export const analyticsRouter = {
  /** Never throws — the page renders a soft-lock empty state for "none" and a widget
   * subset for "basic", instead of erroring on load (see plan-limits.ts's getFeatureTier). */
  getAccessTier: businessScopedProcedure.query(({ ctx }) => getFeatureTier(ctx, "analytics")),

  /** B.8 — Executive AI Copilot. Never throws — same soft-lock pattern as getAccessTier. */
  getCopilotAccess: businessScopedProcedure.query(({ ctx }) => getFeatureTier(ctx, "copilot")),

  askCopilot: businessScopedProcedure
    .input(
      z.object({
        question: z.string().min(1).max(500),
        history: z
          .array(z.object({ role: z.enum(["user", "assistant"]), text: z.string() }))
          .max(20)
          .default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tier = await getFeatureTier(ctx, "copilot");
      if (tier === "none") {
        throw new TRPCError({ code: "FORBIDDEN", message: "The AI Copilot isn't included in your plan. Upgrade to Growth or Pro to use it." });
      }
      const result = await runCopilotQuery(ctx, {
        businessId: ctx.businessId,
        tier,
        question: input.question,
        history: input.history,
      });
      return { answer: result.answer, tier };
    }),

  getSummary: businessScopedProcedure
    .input(
      z.object({
        range: z.enum(["7d", "30d", "90d", "1y", "custom"]).default("30d"),
        from: z.string().optional(),
        to: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const businessId = ctx.businessId;
      const now = Date.now();

      // Resolve the window either from a preset range or an explicit custom date pair.
      let windowStart: number;
      let windowEnd: number;
      let bucketByMonth: boolean;
      if (input.range === "custom" && input.from && input.to) {
        windowStart = new Date(input.from).setHours(0, 0, 0, 0);
        windowEnd = new Date(input.to).setHours(0, 0, 0, 0) + DAY;
        bucketByMonth = windowEnd - windowStart > 120 * DAY;
      } else {
        const rangeDays = RANGE_DAYS[input.range === "custom" ? "30d" : input.range];
        windowEnd = now;
        windowStart = now - rangeDays * DAY;
        bucketByMonth = input.range === "1y";
      }
      const windowMs = windowEnd - windowStart;
      const prevStart = windowStart - windowMs;
      const prevEnd = windowStart;

      const [views, customers, categoryRows, orders, sessions, messageEvents] = await Promise.all([
        ctx.db.select().from(pageView).where(eq(pageView.businessId, businessId)),
        ctx.db
          .select({ country: customer.country, district: customer.district })
          .from(customer)
          .where(eq(customer.businessId, businessId)),
        ctx.db
          .select({ category: product.category, lineTotal: orderItem.lineTotal })
          .from(orderItem)
          .innerJoin(product, eq(orderItem.productId, product.id))
          .innerJoin(order, eq(orderItem.orderId, order.id))
          .where(eq(order.businessId, businessId)),
        ctx.db
          .select({ id: order.id, createdAt: order.createdAt, total: order.total, status: order.status })
          .from(order)
          .where(eq(order.businessId, businessId)),
        ctx.db
          .select({ createdAt: agentSession.createdAt })
          .from(agentSession)
          .where(eq(agentSession.businessId, businessId)),
        ctx.db
          .select({ eventType: metaWebhookEvent.eventType, receivedAt: metaWebhookEvent.receivedAt })
          .from(metaWebhookEvent)
          .where(eq(metaWebhookEvent.businessId, businessId))
          .orderBy(metaWebhookEvent.receivedAt)
          .limit(5000),
      ]);

      const inWindow = (t: number, start: number, end: number) => t >= start && t < end;
      const currentViews = views.filter((v) => inWindow(v.createdAt.getTime(), windowStart, windowEnd));
      const prevViews = views.filter((v) => inWindow(v.createdAt.getTime(), prevStart, prevEnd));

      const bounceRateOf = (rows: typeof views) =>
        rows.length > 0 ? (rows.filter((v) => !v.converted).length / rows.length) * 100 : 0;

      const avgDurationOf = (rows: typeof views) => {
        const durations = rows
          .map((v) => (v.leftAt ? (v.leftAt.getTime() - v.createdAt.getTime()) / 1000 : null))
          .filter((d): d is number => d !== null);
        if (durations.length === 0) return 0;
        return durations.reduce((sum, d) => sum + d, 0) / durations.length;
      };

      const uniqueSessionsOf = (rows: typeof views) => new Set(rows.map((v) => v.sessionId)).size;

      const pageViewStats = {
        total: currentViews.length,
        trend: trendPct(currentViews.length, prevViews.length),
        uniqueVisitors: uniqueSessionsOf(currentViews),
        uniqueVisitorsTrend: trendPct(uniqueSessionsOf(currentViews), uniqueSessionsOf(prevViews)),
        bounceRate: bounceRateOf(currentViews),
        bounceRateTrend: trendPct(bounceRateOf(currentViews), bounceRateOf(prevViews)),
        avgSessionSeconds: avgDurationOf(currentViews),
        avgSessionTrend: trendPct(avgDurationOf(currentViews), avgDurationOf(prevViews)),
      };

      // Page Views Over Time — monthly buckets for long windows, daily otherwise.
      const dailySeries: { label: string; views: number; uniqueVisitors: number }[] = [];
      if (bucketByMonth) {
        const cursor = new Date(windowStart);
        cursor.setDate(1);
        cursor.setHours(0, 0, 0, 0);
        while (cursor.getTime() < windowEnd) {
          const start = cursor.getTime();
          const end = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1).getTime();
          const bucket = views.filter((v) => inWindow(v.createdAt.getTime(), start, end));
          dailySeries.push({
            label: cursor.toLocaleDateString("en-US", { month: "short" }),
            views: bucket.length,
            uniqueVisitors: uniqueSessionsOf(bucket),
          });
          cursor.setMonth(cursor.getMonth() + 1);
        }
      } else {
        const totalDays = Math.round(windowMs / DAY);
        for (let i = 0; i < totalDays; i++) {
          const dayStart = windowStart + i * DAY;
          const dayEnd = dayStart + DAY;
          const bucket = views.filter((v) => inWindow(v.createdAt.getTime(), dayStart, dayEnd));
          dailySeries.push({
            label: new Date(dayStart).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
            views: bucket.length,
            uniqueVisitors: uniqueSessionsOf(bucket),
          });
        }
      }

      const countryCounts = new Map<string, number>();
      for (const c of customers) {
        const key = c.country?.trim() ?? "Unknown";
        countryCounts.set(key, (countryCounts.get(key) ?? 0) + 1);
      }
      const topCountries = [...countryCounts.entries()]
        .map(([country, count]) => ({ country, count }))
        .sort((a, b) => b.count - a.count);

      const categoryRevenue = new Map<string, number>();
      for (const row of categoryRows) {
        const key = row.category?.trim() ?? "Uncategorized";
        categoryRevenue.set(key, (categoryRevenue.get(key) ?? 0) + row.lineTotal);
      }
      const revenueByCategory = [...categoryRevenue.entries()]
        .map(([category, revenue]) => ({ category, revenue }))
        .sort((a, b) => b.revenue - a.revenue);

      const cityCounts = new Map<string, number>();
      for (const c of customers) {
        const key = c.district?.trim() || "Unknown";
        cityCounts.set(key, (cityCounts.get(key) ?? 0) + 1);
      }
      const totalCustomers = customers.length || 1;
      const customersByCity = [...cityCounts.entries()]
        .map(([city, count]) => ({ city, count, pct: Math.round((count / totalCustomers) * 1000) / 10 }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 6);

      // Chat sessions & orders placed, bucketed on the same boundaries as dailySeries.
      const currentOrders = orders.filter((o) => inWindow(o.createdAt.getTime(), windowStart, windowEnd));
      const prevOrders = orders.filter((o) => inWindow(o.createdAt.getTime(), prevStart, prevEnd));
      const currentSessions = sessions.filter((s) => inWindow(s.createdAt.getTime(), windowStart, windowEnd));
      const prevSessions = sessions.filter((s) => inWindow(s.createdAt.getTime(), prevStart, prevEnd));

      // FR-ANA-01/02/03 — Revenue, AOV, and Return Rate, same "exclude cancelled/returned
      // from revenue" convention the Dashboard home page already uses.
      const isRevenueEligible = (o: (typeof orders)[number]) => o.status !== "cancelled" && o.status !== "returned";
      const revenueOf = (rows: typeof orders) => rows.filter(isRevenueEligible).reduce((sum, o) => sum + o.total, 0);
      const aovOf = (rows: typeof orders) => {
        const eligible = rows.filter(isRevenueEligible);
        return eligible.length > 0 ? revenueOf(rows) / eligible.length : 0;
      };
      const returnRateOf = (rows: typeof orders) =>
        rows.length > 0 ? (rows.filter((o) => o.status === "returned").length / rows.length) * 100 : 0;

      const currentRevenue = revenueOf(currentOrders);
      const prevRevenue = revenueOf(prevOrders);
      const currentAov = aovOf(currentOrders);
      const prevAov = aovOf(prevOrders);
      const currentReturnRate = returnRateOf(currentOrders);
      const prevReturnRate = returnRateOf(prevOrders);

      const revenueStats = {
        revenue: currentRevenue,
        revenueTrend: trendPct(currentRevenue, prevRevenue),
        orderCount: currentOrders.length,
        orderCountTrend: trendPct(currentOrders.length, prevOrders.length),
        aov: currentAov,
        aovTrend: trendPct(currentAov, prevAov),
        returnRate: currentReturnRate,
        returnRateTrend: trendPct(currentReturnRate, prevReturnRate),
      };

      // Revenue Over Time — same monthly/daily bucketing as dailySeries/chatOrderSeries.
      const revenueSeries: { label: string; revenue: number }[] = [];
      if (bucketByMonth) {
        const cursor = new Date(windowStart);
        cursor.setDate(1);
        cursor.setHours(0, 0, 0, 0);
        while (cursor.getTime() < windowEnd) {
          const start = cursor.getTime();
          const end = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1).getTime();
          revenueSeries.push({
            label: cursor.toLocaleDateString("en-US", { month: "short" }),
            revenue: revenueOf(orders.filter((o) => inWindow(o.createdAt.getTime(), start, end))),
          });
          cursor.setMonth(cursor.getMonth() + 1);
        }
      } else {
        const totalDays = Math.round(windowMs / DAY);
        for (let i = 0; i < totalDays; i++) {
          const dayStart = windowStart + i * DAY;
          const dayEnd = dayStart + DAY;
          revenueSeries.push({
            label: new Date(dayStart).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
            revenue: revenueOf(orders.filter((o) => inWindow(o.createdAt.getTime(), dayStart, dayEnd))),
          });
        }
      }

      const chatOrderSeries: { label: string; sessions: number; orders: number }[] = [];
      if (bucketByMonth) {
        const cursor = new Date(windowStart);
        cursor.setDate(1);
        cursor.setHours(0, 0, 0, 0);
        while (cursor.getTime() < windowEnd) {
          const start = cursor.getTime();
          const end = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1).getTime();
          chatOrderSeries.push({
            label: cursor.toLocaleDateString("en-US", { month: "short" }),
            sessions: sessions.filter((s) => inWindow(s.createdAt.getTime(), start, end)).length,
            orders: orders.filter((o) => inWindow(o.createdAt.getTime(), start, end)).length,
          });
          cursor.setMonth(cursor.getMonth() + 1);
        }
      } else {
        const totalDays = Math.round(windowMs / DAY);
        for (let i = 0; i < totalDays; i++) {
          const dayStart = windowStart + i * DAY;
          const dayEnd = dayStart + DAY;
          chatOrderSeries.push({
            label: new Date(dayStart).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
            sessions: sessions.filter((s) => inWindow(s.createdAt.getTime(), dayStart, dayEnd)).length,
            orders: orders.filter((o) => inWindow(o.createdAt.getTime(), dayStart, dayEnd)).length,
          });
        }
      }

      const outboundEvents = messageEvents.filter((e) => e.eventType === "outbound");
      const currentOutbound = outboundEvents.filter((e) => inWindow(e.receivedAt.getTime(), windowStart, windowEnd));
      const prevOutbound = outboundEvents.filter((e) => inWindow(e.receivedAt.getTime(), prevStart, prevEnd));

      const conversionRateOf = (orderCount: number, sessionCount: number) =>
        sessionCount > 0 ? (orderCount / sessionCount) * 100 : 0;
      const currentConversion = conversionRateOf(currentOrders.length, uniqueSessionsOf(currentViews));
      const prevConversion = conversionRateOf(prevOrders.length, uniqueSessionsOf(prevViews));

      const messagingStats = {
        messagesSent: currentOutbound.length,
        messagesSentTrend: trendPct(currentOutbound.length, prevOutbound.length),
        chatSessions: currentSessions.length,
        chatSessionsTrend: trendPct(currentSessions.length, prevSessions.length),
        conversionRate: currentConversion,
        conversionRateTrend: trendPct(currentConversion, prevConversion),
      };

      // Inquiries in the last 7 real calendar days — independent of the selected range.
      const inboundEvents = messageEvents.filter((e) => e.eventType !== "outbound");
      const weeklyDays: { label: string; count: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const dayStart = new Date(now).setHours(0, 0, 0, 0) - i * DAY;
        const dayEnd = dayStart + DAY;
        weeklyDays.push({
          label: new Date(dayStart).toLocaleDateString("en-US", { weekday: "short" }),
          count: inboundEvents.filter((e) => inWindow(e.receivedAt.getTime(), dayStart, dayEnd)).length,
        });
      }
      const weeklyInquiries = {
        total: weeklyDays.reduce((sum, d) => sum + d.count, 0),
        days: weeklyDays,
      };

      // Top selling products within the selected window.
      const currentOrderIds = currentOrders.map((o) => o.id);
      const windowItems =
        currentOrderIds.length > 0
          ? await ctx.db
              .select({ productId: orderItem.productId, name: orderItem.name, qty: orderItem.qty, lineTotal: orderItem.lineTotal })
              .from(orderItem)
              .where(inArray(orderItem.orderId, currentOrderIds))
          : [];
      const productAgg = new Map<string, { name: string; qty: number; revenue: number }>();
      for (const item of windowItems) {
        const key = item.productId ?? item.name;
        const existing = productAgg.get(key);
        if (existing) {
          existing.qty += item.qty;
          existing.revenue += item.lineTotal;
        } else {
          productAgg.set(key, { name: item.name, qty: item.qty, revenue: item.lineTotal });
        }
      }
      const topProducts = [...productAgg.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5);

      return {
        pageViewStats,
        dailySeries,
        topCountries,
        revenueByCategory,
        customersByCity,
        chatOrderSeries,
        messagingStats,
        weeklyInquiries,
        topProducts,
        revenueStats,
        revenueSeries,
        rangeLabel: { start: formatDate(windowStart), end: formatDate(windowEnd - DAY) },
      };
    }),

  listCustomKPIs: businessScopedProcedure.query(async ({ ctx }) => {
    const tier = await getFeatureTier(ctx, "copilot");
    if (tier !== "full") return [];

    const kpis = await ctx.db
      .select()
      .from(customKpi)
      .where(eq(customKpi.businessId, ctx.businessId));

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [revRow] = await ctx.db
      .select({ total: sql<number>`coalesce(sum(total_amount), 0)`, count: sql<number>`count(*)` })
      .from(order)
      .where(and(eq(order.businessId, ctx.businessId), gte(order.createdAt, sevenDaysAgo)));

    const currentWeeklyRevenue = Number(revRow?.total ?? 0);
    const currentWeeklyOrders = Number(revRow?.count ?? 0);
    const currentWeeklyAov = currentWeeklyOrders > 0 ? Math.round(currentWeeklyRevenue / currentWeeklyOrders) : 0;

    return kpis.map((kpi) => {
      let currentValue = 0;
      if (kpi.metricType === "revenue") currentValue = currentWeeklyRevenue;
      else if (kpi.metricType === "orders") currentValue = currentWeeklyOrders;
      else if (kpi.metricType === "aov") currentValue = currentWeeklyAov;

      const percentage = Math.min(100, Math.round((currentValue / kpi.targetValue) * 100));
      return {
        ...kpi,
        currentValue,
        percentage,
        isAchieved: currentValue >= kpi.targetValue,
      };
    });
  }),

  createCustomKPI: businessScopedProcedure
    .input(
      z.object({
        title: z.string().min(1).max(100),
        metricType: z.enum(["revenue", "orders", "aov"]),
        targetValue: z.number().positive(),
        period: z.enum(["weekly", "monthly"]).default("weekly"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const tier = await getFeatureTier(ctx, "copilot");
      if (tier !== "full") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Custom KPI tracking requires the Pro Plan." });
      }

      return await ctx.db
        .insert(customKpi)
        .values({
          businessId: ctx.businessId,
          title: input.title,
          metricType: input.metricType,
          targetValue: input.targetValue,
          period: input.period,
        })
        .returning();
    }),

  deleteCustomKPI: businessScopedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(customKpi)
        .where(and(eq(customKpi.id, input.id), eq(customKpi.businessId, ctx.businessId)));
      return { success: true };
    }),
} satisfies TRPCRouterRecord;
