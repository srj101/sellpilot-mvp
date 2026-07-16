import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod/v4";

import { eq } from "@acme/db";
import { customer, order, orderItem, pageView, product } from "@acme/db/schema";

import { protectedProcedure } from "../trpc";

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
  getSummary: protectedProcedure
    .input(
      z.object({
        range: z.enum(["7d", "30d", "90d", "1y", "custom"]).default("30d"),
        from: z.string().optional(),
        to: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;
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

      const [views, customers, categoryRows] = await Promise.all([
        ctx.db.select().from(pageView).where(eq(pageView.userId, userId)),
        ctx.db.select({ country: customer.country }).from(customer).where(eq(customer.userId, userId)),
        ctx.db
          .select({ category: product.category, lineTotal: orderItem.lineTotal })
          .from(orderItem)
          .innerJoin(product, eq(orderItem.productId, product.id))
          .innerJoin(order, eq(orderItem.orderId, order.id))
          .where(eq(order.userId, userId)),
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

      return {
        pageViewStats,
        dailySeries,
        topCountries,
        revenueByCategory,
        rangeLabel: { start: formatDate(windowStart), end: formatDate(windowEnd - DAY) },
      };
    }),
} satisfies TRPCRouterRecord;
