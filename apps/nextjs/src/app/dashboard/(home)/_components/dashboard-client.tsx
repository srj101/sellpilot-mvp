"use client";

import { useMemo } from "react";
import Link from "next/link";
import { TrendingUp, ArrowUpRight, Plus, CheckCircle2, XCircle, ShoppingCart } from "lucide-react";

import { Badge } from "@acme/ui/badge";
import { Button } from "@acme/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle, CardDescription } from "@acme/ui/card";
import { cn } from "@acme/ui";

import type { ActivityEvent, DashboardClientProps, SerializedOrder } from "./dashboard-types";
import { DAY, avatarColor, formatCurrency, initials, trendPct, STATUS_BADGE } from "./dashboard-utils";
import {
  ActivityTimeline,
  CompactTrend,
  ConversionFunnel,
  DonutWithLegend,
  GoalBar,
  GoalRing,
  OverviewChart,
  SegmentLegend,
  Sparkline,
  TrendLine,
  WeekdayBarChart,
} from "./dashboard-widgets";

export function DashboardClient({ userName, now, orders, customerCount, recentItems, messageStats }: DashboardClientProps) {
  const stats = useMemo(() => {
    const validOrders = orders.filter((o) => o.status !== "cancelled" && o.status !== "returned");
    const totalRevenue = validOrders.reduce((sum, o) => sum + o.total, 0);

    const inWindow = (o: SerializedOrder, start: number, end: number) => {
      const t = new Date(o.createdAt).getTime();
      return t >= start && t < end;
    };
    const currentPeriod = validOrders.filter((o) => inWindow(o, now - 30 * DAY, now));
    const prevPeriod = validOrders.filter((o) => inWindow(o, now - 60 * DAY, now - 30 * DAY));
    const currentRevenue = currentPeriod.reduce((s, o) => s + o.total, 0);
    const prevRevenue = prevPeriod.reduce((s, o) => s + o.total, 0);
    const currentCustomers = new Set(currentPeriod.map((o) => o.customerPhone ?? o.customerName)).size;
    const prevCustomers = new Set(prevPeriod.map((o) => o.customerPhone ?? o.customerName)).size;

    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const todaysOrders = orders.filter((o) => new Date(o.createdAt).getTime() >= todayStart.getTime());
    const todaysRevenue = todaysOrders
      .filter((o) => o.status !== "cancelled" && o.status !== "returned")
      .reduce((s, o) => s + o.total, 0);

    return {
      totalRevenue,
      totalOrders: orders.length,
      currentRevenue,
      prevRevenue,
      currentCustomers,
      prevCustomers,
      todaysOrderCount: todaysOrders.length,
      todaysRevenue,
      trends: {
        revenue: trendPct(currentRevenue, prevRevenue),
        orders: trendPct(currentPeriod.length, prevPeriod.length),
        customers: trendPct(currentCustomers, prevCustomers),
      },
    };
  }, [orders, now]);

  // Last 14 days, for the Total Revenue card sparkline.
  const revenueSparkline = useMemo(() => {
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const values: number[] = [];
    for (let i = 13; i >= 0; i--) {
      const dayStart = todayStart.getTime() - i * DAY;
      const dayEnd = dayStart + DAY;
      const dayRevenue = orders
        .filter((o) => {
          const t = new Date(o.createdAt).getTime();
          return t >= dayStart && t < dayEnd && o.status !== "cancelled" && o.status !== "returned";
        })
        .reduce((s, o) => s + o.total, 0);
      values.push(dayRevenue);
    }
    return values;
  }, [orders, now]);

  // Last 7 days order counts, for the Orders card mini bar chart.
  const weekdayOrders = useMemo(() => {
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const days: { label: string; value: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const dayStart = todayStart.getTime() - i * DAY;
      const dayEnd = dayStart + DAY;
      const count = orders.filter((o) => {
        const t = new Date(o.createdAt).getTime();
        return t >= dayStart && t < dayEnd;
      }).length;
      days.push({ label: new Date(dayStart).toLocaleDateString("en-US", { weekday: "short" }), value: count });
    }
    return days;
  }, [orders, now]);

  const statusLegend = useMemo(() => {
    const buckets = { Completed: 0, Processing: 0, Pending: 0, Cancelled: 0 };
    for (const o of orders) {
      if (o.status === "delivered") buckets.Completed++;
      else if (["confirmed", "paid", "shipped"].includes(o.status)) buckets.Processing++;
      else if (o.status === "pending") buckets.Pending++;
      else if (["cancelled", "returned"].includes(o.status)) buckets.Cancelled++;
    }
    return [
      { label: "Completed", color: "bg-emerald-500" },
      { label: "Processing", color: "bg-blue-500" },
      { label: "Pending", color: "bg-amber-500" },
      { label: "Cancelled", color: "bg-rose-500" },
    ].filter((s) => buckets[s.label as keyof typeof buckets] > 0);
  }, [orders]);

  // Customer segments (New / Returning / Inactive) + weekly new-customer sparkline.
  const { customerSegmentLegend, weeklyCustomerSeries } = useMemo(() => {
    const map = new Map<string, { count: number; last: number }>();
    for (const o of orders) {
      const key = o.customerPhone ?? o.customerName;
      const t = new Date(o.createdAt).getTime();
      const existing = map.get(key);
      if (existing) {
        existing.count++;
        existing.last = Math.max(existing.last, t);
      } else {
        map.set(key, { count: 1, last: t });
      }
    }
    let newCount = 0;
    let returning = 0;
    let inactive = 0;
    for (const v of map.values()) {
      if (now - v.last > 60 * DAY) inactive++;
      else if (v.count === 1) newCount++;
      else returning++;
    }
    const legend = [
      { label: "Returning", color: "bg-emerald-500", count: returning },
      { label: "New", color: "bg-blue-500", count: newCount },
      { label: "Inactive", color: "bg-amber-500", count: inactive },
    ].filter((s) => s.count > 0);

    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const weekly: number[] = [];
    for (let i = 7; i >= 0; i--) {
      const weekStart = todayStart.getTime() - i * 7 * DAY;
      const weekEnd = weekStart + 7 * DAY;
      const set = new Set(
        orders
          .filter((o) => {
            const t = new Date(o.createdAt).getTime();
            return t >= weekStart && t < weekEnd;
          })
          .map((o) => o.customerPhone ?? o.customerName),
      );
      weekly.push(set.size);
    }
    return { customerSegmentLegend: legend, weeklyCustomerSeries: weekly };
  }, [orders, now]);

  const funnelStages = useMemo(() => {
    const ordersPaid = orders.filter((o) => ["paid", "shipped", "delivered"].includes(o.status)).length;
    const delivered = orders.filter((o) => o.status === "delivered").length;
    return [
      { label: "Messages", value: messageStats.inbound },
      { label: "Orders", value: orders.length },
      { label: "Paid", value: ordersPaid },
      { label: "Delivered", value: delivered },
    ];
  }, [orders, messageStats]);

  // Jan–Dec of the current year, for the Overview tabbed chart.
  const monthlySeries = useMemo(() => {
    const year = new Date(now).getFullYear();
    return Array.from({ length: 12 }, (_, i) => {
      const start = new Date(year, i, 1).getTime();
      const end = new Date(year, i + 1, 1).getTime();
      const monthOrders = orders.filter((o) => {
        const t = new Date(o.createdAt).getTime();
        return t >= start && t < end && o.status !== "cancelled" && o.status !== "returned";
      });
      return {
        label: new Date(year, i, 1).toLocaleDateString("en-US", { month: "short" }),
        revenue: monthOrders.reduce((s, o) => s + o.total, 0),
        orders: monthOrders.length,
        profit: monthOrders.reduce((s, o) => s + (o.subtotal - o.discountAmount), 0),
      };
    });
  }, [orders, now]);

  const activity = useMemo(() => {
    const events: ActivityEvent[] = [];
    for (const o of orders) {
      const createdMs = new Date(o.createdAt).getTime();
      events.push({
        id: `${o.id}-placed`,
        title: `${o.customerName} placed order #${o.orderNumber}`,
        time: createdMs,
        icon: ShoppingCart,
        color: "border-emerald-500 text-emerald-600 dark:text-emerald-400",
      });
      const updatedMs = new Date(o.updatedAt).getTime();
      if (updatedMs > createdMs) {
        if (o.status === "delivered") {
          events.push({
            id: `${o.id}-delivered`,
            title: `Order #${o.orderNumber} delivered to ${o.customerName}`,
            time: updatedMs,
            icon: CheckCircle2,
            color: "border-blue-500 text-blue-600 dark:text-blue-400",
          });
        } else if (o.status === "cancelled") {
          events.push({
            id: `${o.id}-cancelled`,
            title: `Order #${o.orderNumber} was cancelled`,
            time: updatedMs,
            icon: XCircle,
            color: "border-rose-500 text-rose-600 dark:text-rose-400",
          });
        }
      }
    }
    return events.sort((a, b) => b.time - a.time).slice(0, 7);
  }, [orders]);

  const orderProductMap = useMemo(() => {
    const map = new Map<string, { name: string; extra: number }>();
    for (const item of recentItems) {
      const existing = map.get(item.orderId);
      if (!existing) map.set(item.orderId, { name: item.name, extra: 0 });
      else existing.extra++;
    }
    return map;
  }, [recentItems]);

  const recentOrders = orders.slice(0, 6);

  const topProducts = useMemo(() => {
    const prodMap = new Map<string, { name: string; qty: number; revenue: number }>();
    for (const item of recentItems) {
      const existing = prodMap.get(item.name) ?? { name: item.name, qty: 0, revenue: 0 };
      existing.qty += item.qty;
      existing.revenue += item.lineTotal;
      prodMap.set(item.name, existing);
    }
    return [...prodMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  }, [recentItems]);

  return (
    <div className="space-y-6">
      {/* ─── Welcome banner ────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-emerald-900 px-6 py-8 text-primary-foreground dark:to-emerald-950 sm:px-8">
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold sm:text-3xl">Welcome back, {userName} 👋</h1>
            <p className="mt-1.5 text-sm text-primary-foreground/80 sm:text-base">
              You have <span className="font-semibold text-primary-foreground">{stats.todaysOrderCount} new orders</span> and{" "}
              <span className="font-semibold text-primary-foreground">{formatCurrency(stats.todaysRevenue)} revenue</span> today
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/dashboard/orders">
              <Button size="sm" className="bg-white text-emerald-900 hover:bg-white/90">
                <Plus className="h-4 w-4" />
                New Order
              </Button>
            </Link>
            <Link href="/dashboard/analytics">
              <Button size="sm" variant="outline" className="border-white/30 bg-white/10 text-primary-foreground hover:bg-white/20">
                View Analytics
                <ArrowUpRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* ─── Total Revenue + Monthly Goal ──────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <Card className="gap-0 py-6">
          <CardContent>
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Total Revenue</p>
              <div className="rounded-xl bg-emerald-500/10 p-2 text-emerald-600 dark:text-emerald-400">
                <TrendingUp className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-2 text-3xl font-bold tabular-nums text-foreground">{formatCurrency(stats.totalRevenue)}</p>
            <TrendLine pct={stats.trends.revenue} />
          </CardContent>
          <div className="mt-2">
            <Sparkline id="spark-revenue" data={revenueSparkline} color="var(--chart-1)" height={90} />
          </div>
        </Card>

        <Card className="flex items-center justify-center py-6">
          <CardContent>
            {stats.prevRevenue > 0 ? (
              <GoalRing current={stats.currentRevenue} target={stats.prevRevenue} />
            ) : (
              <p className="max-w-40 text-center text-xs text-muted-foreground">
                Goal tracks last month&apos;s revenue — not enough history yet.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─── Orders / Customers / Conversion Funnel ────────────────── */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="gap-0 py-5">
          <CardContent>
            <div className="flex items-start justify-between">
              <p className="text-sm text-muted-foreground">Orders</p>
              <CompactTrend pct={stats.trends.orders} />
            </div>
            <p className="text-2xl font-bold tabular-nums text-foreground">{stats.totalOrders}</p>
            <p className="text-xs text-muted-foreground">Total orders this month</p>
            {statusLegend.length > 0 && (
              <div className="mt-3">
                <SegmentLegend segments={statusLegend} />
              </div>
            )}
            <div className="mt-2 -mb-2">
              <WeekdayBarChart data={weekdayOrders} color="var(--chart-1)" />
            </div>
          </CardContent>
        </Card>

        <Card className="gap-0 py-5">
          <CardContent>
            <div className="flex items-start justify-between">
              <p className="text-sm text-muted-foreground">Customers</p>
              <CompactTrend pct={stats.trends.customers} />
            </div>
            <p className="text-2xl font-bold tabular-nums text-foreground">{customerCount}</p>
            <p className="text-xs text-muted-foreground">Total customers</p>
            {customerSegmentLegend.length > 0 && (
              <div className="mt-3">
                <SegmentLegend segments={customerSegmentLegend} />
              </div>
            )}
            <div className="mt-2 -mb-2">
              <Sparkline id="spark-customers" data={weeklyCustomerSeries} color="var(--chart-2)" height={100} />
            </div>
          </CardContent>
        </Card>

        <Card className="gap-0 py-5">
          <CardHeader className="px-6">
            <CardTitle>Conversion Funnel</CardTitle>
            <CardAction>
              <span className="text-xs text-muted-foreground">This month</span>
            </CardAction>
          </CardHeader>
          <CardContent className="mt-4">
            <ConversionFunnel stages={funnelStages} />
          </CardContent>
        </Card>
      </div>

      {/* ─── Overview chart + Traffic Sources / Monthly Goals ──────── */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardContent>
            <OverviewChart data={monthlySeries} />
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Traffic Sources</CardTitle>
              <CardDescription>Where your chats come from</CardDescription>
            </CardHeader>
            <CardContent>
              <DonutWithLegend
                centerLabel="Chats"
                segments={[
                  { label: "Instagram", value: messageStats.platformBreakdown.instagram, stroke: "stroke-pink-500", dot: "bg-pink-500" },
                  { label: "WhatsApp", value: messageStats.platformBreakdown.whatsapp, stroke: "stroke-green-500", dot: "bg-green-500" },
                  { label: "Facebook", value: messageStats.platformBreakdown.facebook, stroke: "stroke-blue-500", dot: "bg-blue-500" },
                ]}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Monthly Goals</CardTitle>
              <CardDescription>Track progress toward targets</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {stats.prevRevenue > 0 ? (
                <GoalBar label="Monthly Revenue" current={stats.currentRevenue} target={stats.prevRevenue} color="bg-primary" />
              ) : (
                <p className="text-xs text-muted-foreground">Not enough revenue history yet.</p>
              )}
              {stats.prevCustomers > 0 ? (
                <GoalBar
                  label="New Customers"
                  current={stats.currentCustomers}
                  target={stats.prevCustomers}
                  color="bg-violet-500"
                  format={(n) => String(n)}
                />
              ) : (
                <p className="text-xs text-muted-foreground">Not enough customer history yet.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ─── Top Products + Recent Activity ────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="gap-0 py-0">
          <CardHeader className="border-b py-4">
            <CardTitle>Top Products</CardTitle>
            <CardAction>
              <Link href="/dashboard/products">
                <Button variant="ghost" size="sm" className="text-xs">
                  View all <ArrowUpRight className="ml-1 h-3 w-3" />
                </Button>
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent className="py-6">
            {topProducts.length > 0 ? (
              <div className="space-y-5">
                {topProducts.map((p, i) => {
                  const max = Math.max(topProducts[0]?.revenue ?? 1, 1);
                  const pct = Math.max((p.revenue / max) * 100, 6);
                  return (
                    <div key={p.name} className="flex items-center gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                        #{i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-sm font-medium text-foreground">{p.name}</p>
                          <p className="shrink-0 text-sm font-bold tabular-nums text-foreground">{formatCurrency(p.revenue)}</p>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-primary transition-all duration-700" style={{ width: `${pct}%` }} />
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{p.qty} sold</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">No sales yet</p>
            )}
          </CardContent>
        </Card>

        <Card className="gap-0 py-0">
          <CardHeader className="border-b py-4">
            <CardTitle>Recent Activity</CardTitle>
            <CardAction>
              <Link href="/dashboard/orders">
                <Button variant="ghost" size="sm" className="text-xs">
                  View all <ArrowUpRight className="ml-1 h-3 w-3" />
                </Button>
              </Link>
            </CardAction>
          </CardHeader>
          <CardContent className="py-6">
            <ActivityTimeline events={activity} now={now} />
          </CardContent>
        </Card>
      </div>

      {/* ─── Recent Orders table ────────────────────────────────────── */}
      <Card className="gap-0 py-0">
        <CardHeader className="border-b py-4">
          <CardTitle>Recent Orders</CardTitle>
          <CardDescription>Latest transactions from your store</CardDescription>
          <CardAction>
            <Link href="/dashboard/orders">
              <Button variant="ghost" size="sm" className="text-xs">
                View all <ArrowUpRight className="ml-1 h-3 w-3" />
              </Button>
            </Link>
          </CardAction>
        </CardHeader>
        <CardContent className="py-2">
          {recentOrders.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="py-3 font-medium">Customer</th>
                    <th className="py-3 font-medium">Order ID</th>
                    <th className="py-3 font-medium">Product</th>
                    <th className="py-3 font-medium">Status</th>
                    <th className="py-3 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {recentOrders.map((o) => {
                    const product = orderProductMap.get(o.id);
                    const productLabel = product ? (product.extra > 0 ? `${product.name} +${product.extra} more` : product.name) : "—";
                    return (
                      <tr key={o.id}>
                        <td className="py-3">
                          <div className="flex items-center gap-2.5">
                            <span
                              className={cn(
                                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white",
                                avatarColor(o.customerName),
                              )}
                            >
                              {initials(o.customerName)}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate font-medium text-foreground">{o.customerName}</p>
                              {o.customerPhone && <p className="truncate text-xs text-muted-foreground">{o.customerPhone}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="py-3 text-muted-foreground">#{o.orderNumber}</td>
                        <td className="max-w-48 truncate py-3 text-muted-foreground">{productLabel}</td>
                        <td className="py-3">
                          <Badge variant={STATUS_BADGE[o.status] ?? "secondary"} className="text-[10px] capitalize">
                            {o.status}
                          </Badge>
                        </td>
                        <td className="py-3 text-right font-bold tabular-nums text-foreground">{formatCurrency(o.total)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">No orders yet</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
