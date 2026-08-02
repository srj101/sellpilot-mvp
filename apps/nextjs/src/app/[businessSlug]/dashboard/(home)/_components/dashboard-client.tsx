"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useBusinessSlug } from "~/hooks/use-business-slug";
import { TrendingUp, ArrowUpRight, Plus, CheckCircle2, XCircle, ShoppingCart, DollarSign, Users, ShoppingBag, MessageCircle } from "lucide-react";

import { Badge } from "@acme/ui/badge";
import { Button } from "@acme/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle, CardDescription } from "@acme/ui/card";
import { Skeleton } from "@acme/ui/skeleton";
import { cn } from "@acme/ui";

import { useTRPC } from "~/trpc/react";
import type { ActivityEvent, DashboardClientProps, SerializedOrder } from "./dashboard-types";
import { DAY, avatarColor, formatCurrency, initials, trendPct, STATUS_BADGE } from "./dashboard-utils";
import {
  ActivityTimeline,
  OverviewChart,
} from "./dashboard-widgets";
import { TrialBanner } from "./trial-banner";

/** FR-DSH-01 — stats.trends was already computed (see the useMemo below) but never
 * rendered on any stat card. "vs previous 30 days" rather than the SRS's literal "vs
 * previous day", since that's what the existing trend math actually compares (the same
 * current/previous-30-day-window convention Analytics uses) — re-deriving true
 * day-over-day trends would be a bigger change than this dead-code wire-up. */
function TrendBadge({ value }: { value: number | null }) {
  if (value === null) return <p className="mt-1 text-xs text-muted-foreground">No prior data</p>;
  const positive = value >= 0;
  return (
    <p className={cn("mt-1 text-xs", positive ? "text-green-500" : "text-rose-500")}>
      {positive ? "+" : ""}
      {value.toFixed(1)}% vs previous 30 days
    </p>
  );
}

export function DashboardClient({ userName }: DashboardClientProps) {
  const businessSlug = useBusinessSlug();
  const trpc = useTRPC();
  const [now] = useState(() => Date.now());
  const { data, isPending } = useQuery(trpc.dashboard.getOverview.queryOptions());
  const orders: SerializedOrder[] = data?.orders ?? [];
  const customerCount = data?.customerCount ?? 0;
  const recentItems = data?.recentItems ?? [];
  const messageStats = data?.messageStats ?? {
    total: 0,
    inbound: 0,
    outbound: 0,
    platformBreakdown: { instagram: 0, whatsapp: 0, facebook: 0 },
  };
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

  // Channel breakdown percentages
  const { waPct, fbPct, igPct } = useMemo(() => {
    const totalPlat = (messageStats.platformBreakdown.facebook || 0) + 
                      (messageStats.platformBreakdown.whatsapp || 0) + 
                      (messageStats.platformBreakdown.instagram || 0) || 1;
    return {
      waPct: Math.round(((messageStats.platformBreakdown.whatsapp || 0) / totalPlat) * 100),
      fbPct: Math.round(((messageStats.platformBreakdown.facebook || 0) / totalPlat) * 100),
      igPct: Math.round(((messageStats.platformBreakdown.instagram || 0) / totalPlat) * 100),
    };
  }, [messageStats]);

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
    return events.sort((a, b) => b.time - a.time).slice(0, 5);
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
    return [...prodMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 4);
  }, [recentItems]);

  return (
    <div className="space-y-6">
      <TrialBanner businessSlug={businessSlug} />

      {/* ─── Welcome banner ────────────────────────────────────────── */}
      <div
        className="relative overflow-hidden rounded-2xl p-6 sm:p-8"
        style={{ background: "linear-gradient(135deg, var(--haze-primary-darker), oklch(0.15 0.05 230))" }}
      >
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white sm:text-3xl">Welcome back, {userName} 👋</h1>
            {isPending ? (
              <Skeleton className="mt-2.5 h-4 w-56 bg-white/20" />
            ) : (
              <p className="mt-2 text-white/80">
                You have <span className="font-semibold text-white">{stats.todaysOrderCount} new orders</span> and{" "}
                <span className="font-semibold text-white">{formatCurrency(stats.todaysRevenue)} revenue</span> today
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Link href={`/${businessSlug}/dashboard/orders`}>
              <Button size="sm" className="bg-white text-indigo-950 hover:bg-white/90 rounded-lg shadow-sm">
                <Plus className="h-4 w-4" />
                New Order
              </Button>
            </Link>
            <Link href={`/${businessSlug}/dashboard/analytics`}>
              <Button size="sm" className="bg-white/15 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm transition hover:bg-white/25 rounded-lg border border-white/10">
                View Analytics
                <ArrowUpRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
        <svg className="absolute inset-0 h-full w-full opacity-10 pointer-events-none" preserveAspectRatio="none" viewBox="0 0 1200 200">
          <path d="M0,80 C300,150 600,20 900,100 C1050,140 1150,60 1200,80 L1200,200 L0,200 Z" fill="white"></path>
          <path d="M0,120 C200,60 500,160 800,90 C1000,50 1100,120 1200,100 L1200,200 L0,200 Z" fill="white" opacity="0.5"></path>
        </svg>
      </div>

      {/* ─── Stat Cards Section (4 columns) ────────────────────────── */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Revenue */}
        <Card className="card-hover p-5">
          <CardContent className="p-0">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">Total Revenue</p>
              <div className="rounded-xl bg-primary/10 p-2 text-primary">
                <DollarSign className="h-4 w-4" />
              </div>
            </div>
            {isPending ? (
              <><Skeleton className="mt-3 h-7 w-24" /><Skeleton className="mt-1.5 h-3 w-32" /></>
            ) : (
              <>
                <p className="mt-3 text-2xl font-bold tabular-nums text-foreground">{formatCurrency(stats.totalRevenue)}</p>
                <TrendBadge value={stats.trends.revenue} />
              </>
            )}
          </CardContent>
        </Card>

        {/* Active Users */}
        <Card className="card-hover p-5">
          <CardContent className="p-0">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">Active Users</p>
              <div className="rounded-xl bg-blue-500/10 p-2 text-blue-500">
                <Users className="h-4 w-4" />
              </div>
            </div>
            {isPending ? (
              <><Skeleton className="mt-3 h-7 w-16" /><Skeleton className="mt-1.5 h-3 w-32" /></>
            ) : (
              <>
                <p className="mt-3 text-2xl font-bold tabular-nums text-foreground">{customerCount.toLocaleString()}</p>
                <TrendBadge value={stats.trends.customers} />
              </>
            )}
          </CardContent>
        </Card>

        {/* Total Orders */}
        <Card className="card-hover p-5">
          <CardContent className="p-0">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">Total Orders</p>
              <div className="rounded-xl bg-amber-500/10 p-2 text-amber-500">
                <ShoppingBag className="h-4 w-4" />
              </div>
            </div>
            {isPending ? (
              <><Skeleton className="mt-3 h-7 w-16" /><Skeleton className="mt-1.5 h-3 w-32" /></>
            ) : (
              <>
                <p className="mt-3 text-2xl font-bold tabular-nums text-foreground">{stats.totalOrders.toLocaleString()}</p>
                <TrendBadge value={stats.trends.orders} />
              </>
            )}
          </CardContent>
        </Card>

        {/* Total Chat Sessions */}
        <Card className="card-hover p-5">
          <CardContent className="p-0">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">Total Chat Sessions</p>
              <div className="rounded-xl bg-pink-500/10 p-2 text-pink-500">
                <MessageCircle className="h-4 w-4" />
              </div>
            </div>
            {isPending ? (
              <><Skeleton className="mt-3 h-7 w-16" /><Skeleton className="mt-1.5 h-3 w-32" /></>
            ) : (
              <>
                <p className="mt-3 text-2xl font-bold tabular-nums text-foreground">{messageStats.total.toLocaleString()}</p>
                <p className="mt-1 text-xs text-muted-foreground">Messages received & sent</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─── Overview Line Chart & Channel Breakdown (Funnel) ──────── */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="card-hover lg:col-span-2">
          <CardContent className="pt-6">
            {isPending ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <OverviewChart data={monthlySeries} />
            )}
          </CardContent>
        </Card>

        {/* Conversion Funnel / Channel Breakdown */}
        <Card className="card-hover">
          <CardHeader>
            <CardTitle className="text-base font-semibold">Channel Breakdown</CardTitle>
            <CardDescription>Percentage breakdown of inbound messages</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isPending ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i}>
                  <div className="flex justify-between mb-1.5">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-4 w-8" />
                  </div>
                  <Skeleton className="h-2.5 w-full rounded-full" />
                </div>
              ))
            ) : (
              <>
                {/* WhatsApp */}
                <div>
                  <div className="flex justify-between text-sm font-medium mb-1.5">
                    <span>WhatsApp</span>
                    <span className="text-muted-foreground tabular-nums">{waPct}%</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full transition-all duration-500" style={{ width: `${waPct}%` }} />
                  </div>
                </div>
                {/* Messenger */}
                <div>
                  <div className="flex justify-between text-sm font-medium mb-1.5">
                    <span>Messenger</span>
                    <span className="text-muted-foreground tabular-nums">{fbPct}%</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full transition-all duration-500" style={{ width: `${fbPct}%` }} />
                  </div>
                </div>
                {/* Instagram */}
                <div>
                  <div className="flex justify-between text-sm font-medium mb-1.5">
                    <span>Instagram</span>
                    <span className="text-muted-foreground tabular-nums">{igPct}%</span>
                  </div>
                  <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-pink-500 rounded-full transition-all duration-500" style={{ width: `${igPct}%` }} />
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ─── Recent Orders & Top Products / Activity ───────────────── */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent Orders */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="card-hover gap-0 py-0">
            <CardHeader className="border-b py-4">
              <CardTitle>Recent Orders</CardTitle>
              <CardDescription>Latest transactions from your business</CardDescription>
              <CardAction>
                <Link href={`/${businessSlug}/dashboard/orders`}>
                  <Button variant="ghost" size="sm" className="text-xs">
                    View all <ArrowUpRight className="ml-1 h-3 w-3" />
                  </Button>
                </Link>
              </CardAction>
            </CardHeader>
            <CardContent className="py-2">
              {isPending ? (
                <div className="space-y-3 py-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-2.5">
                      <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <Skeleton className="h-3.5 w-28" />
                        <Skeleton className="h-3 w-20" />
                      </div>
                      <Skeleton className="h-4 w-14 shrink-0" />
                    </div>
                  ))}
                </div>
              ) : recentOrders.length > 0 ? (
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

        {/* Top Products & Activity */}
        <div className="space-y-6">
          {/* Top Products */}
          <Card className="card-hover gap-0 py-0">
            <CardHeader className="border-b py-4">
              <CardTitle>Top Products</CardTitle>
              <CardAction>
                <Link href={`/${businessSlug}/dashboard/products`}>
                  <Button variant="ghost" size="sm" className="text-xs">
                    View all <ArrowUpRight className="ml-1 h-3 w-3" />
                  </Button>
                </Link>
              </CardAction>
            </CardHeader>
            <CardContent className="py-5">
              {isPending ? (
                <div className="space-y-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Skeleton className="h-7 w-7 shrink-0 rounded-full" />
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <Skeleton className="h-3.5 w-24" />
                          <Skeleton className="h-3.5 w-12" />
                        </div>
                        <Skeleton className="h-1 w-full" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : topProducts.length > 0 ? (
                <div className="space-y-4">
                  {topProducts.map((p, i) => {
                    const max = Math.max(topProducts[0]?.revenue ?? 1, 1);
                    const pct = Math.max((p.revenue / max) * 100, 6);
                    return (
                      <div key={p.name} className="flex items-center gap-3">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                          #{i + 1}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-xs font-medium text-foreground">{p.name}</p>
                            <p className="shrink-0 text-xs font-bold tabular-nums text-foreground">{formatCurrency(p.revenue)}</p>
                          </div>
                          <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
                            <div className="h-full rounded-full bg-primary transition-all duration-700" style={{ width: `${pct}%` }} />
                          </div>
                          <p className="mt-0.5 text-[10px] text-muted-foreground">{p.qty} sold</p>
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

          {/* Recent Activity */}
          <Card className="card-hover gap-0 py-0">
            <CardHeader className="border-b py-4">
              <CardTitle>Recent Activity</CardTitle>
            </CardHeader>
            <CardContent className="py-5">
              {isPending ? (
                <div className="space-y-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <Skeleton className="h-2.5 w-2.5 shrink-0 rounded-full" />
                      <Skeleton className="h-3.5 w-full max-w-56" />
                    </div>
                  ))}
                </div>
              ) : (
                <ActivityTimeline events={activity} now={now} />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
