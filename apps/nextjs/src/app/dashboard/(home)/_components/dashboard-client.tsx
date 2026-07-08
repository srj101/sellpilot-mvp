"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  TrendingUp,
  ShoppingCart,
  Users,
  Package,
  Percent,
  MessageSquare,
  ArrowUpRight,
  Clock,
  CheckCircle2,
  Truck,
} from "lucide-react";

import { Badge } from "@acme/ui/badge";
import { Button } from "@acme/ui/button";
import { cn } from "@acme/ui";

interface SerializedOrder {
  id: string;
  orderNumber: string;
  status: string;
  total: number;
  customerName: string;
  customerPhone: string | null;
  channel: string | null;
  createdAt: string;
  [key: string]: unknown;
}

interface MessageStats {
  total: number;
  inbound: number;
  outbound: number;
  platformBreakdown: {
    instagram: number;
    whatsapp: number;
    facebook: number;
  };
}

interface DashboardClientProps {
  userName: string;
  orders: SerializedOrder[];
  productCount: number;
  customerCount: number;
  activeOfferCount: number;
  recentItems: { orderId: string; name: string; qty: number; lineTotal: number; [key: string]: unknown }[];
  messageStats: MessageStats;
}

function formatCurrency(amount: number) {
  return `৳${amount.toLocaleString()}`;
}

function relativeTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const STATUS_ICONS: Record<string, typeof Clock> = {
  pending: Clock,
  confirmed: CheckCircle2,
  paid: CheckCircle2,
  shipped: Truck,
  delivered: CheckCircle2,
};

/* ─── Bar chart component ─────────────────────────────────────────── */
function MiniBarChart({
  data,
  colors,
}: {
  data: { label: string; value: number; color: string }[];
  colors?: string[];
}) {
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="flex items-end gap-2 h-28">
      {data.map((d, i) => (
        <div key={d.label} className="flex flex-1 flex-col items-center gap-1">
          <span className="text-[10px] font-bold tabular-nums text-foreground">
            {d.value}
          </span>
          <div
            className={cn(
              "w-full rounded-t-lg transition-all duration-700 ease-out",
              d.color,
            )}
            style={{
              height: `${Math.max((d.value / max) * 100, 8)}%`,
              animationDelay: `${i * 100}ms`,
            }}
          />
          <span className="text-[10px] font-medium text-muted-foreground truncate max-w-full">
            {d.label}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ─── Donut chart component ───────────────────────────────────────── */
function MiniDonut({
  segments,
}: {
  segments: { label: string; value: number; color: string }[];
}) {
  const total = segments.reduce((s, seg) => s + seg.value, 0) || 1;
  let accumulated = 0;
  const size = 120;
  const strokeWidth = 18;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} className="shrink-0 -rotate-90">
        {segments.map((seg) => {
          const pct = seg.value / total;
          const dashArray = pct * circumference;
          const dashOffset = -accumulated * circumference;
          accumulated += pct;

          return (
            <circle
              key={seg.label}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              strokeWidth={strokeWidth}
              className={seg.color}
              strokeDasharray={`${dashArray} ${circumference - dashArray}`}
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
            />
          );
        })}
      </svg>
      <div className="space-y-1.5">
        {segments.map((seg) => (
          <div key={seg.label} className="flex items-center gap-2 text-xs">
            <span className={cn("h-2.5 w-2.5 rounded-full", seg.color.replace("stroke-", "bg-"))} />
            <span className="text-muted-foreground">{seg.label}</span>
            <span className="font-bold text-foreground tabular-nums">{seg.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function DashboardClient({
  userName,
  orders,
  productCount,
  customerCount,
  activeOfferCount,
  recentItems,
  messageStats,
}: DashboardClientProps) {
  const stats = useMemo(() => {
    const validOrders = orders.filter(
      (o) => o.status !== "cancelled" && o.status !== "returned",
    );
    const totalRevenue = validOrders.reduce((sum, o) => sum + o.total, 0);
    const avgOrderValue =
      validOrders.length > 0
        ? Math.round(totalRevenue / validOrders.length)
        : 0;
    const pendingOrders = orders.filter((o) => o.status === "pending").length;
    return { totalRevenue, avgOrderValue, pendingOrders, totalOrders: orders.length };
  }, [orders]);

  const statusBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const o of orders) {
      counts[o.status] = (counts[o.status] ?? 0) + 1;
    }
    return [
      { label: "Pending", value: counts.pending ?? 0, color: "bg-amber-500" },
      { label: "Confirmed", value: counts.confirmed ?? 0, color: "bg-blue-500" },
      { label: "Paid", value: counts.paid ?? 0, color: "bg-violet-500" },
      { label: "Shipped", value: counts.shipped ?? 0, color: "bg-cyan-500" },
      { label: "Delivered", value: counts.delivered ?? 0, color: "bg-emerald-500" },
      { label: "Cancelled", value: counts.cancelled ?? 0, color: "bg-rose-500" },
    ].filter((d) => d.value > 0);
  }, [orders]);

  const channelBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const o of orders) {
      const ch = o.channel ?? "unknown";
      counts[ch] = (counts[ch] ?? 0) + 1;
    }
    return [
      { label: "Instagram", value: counts.instagram ?? 0, color: "bg-pink-500" },
      { label: "WhatsApp", value: counts.whatsapp ?? 0, color: "bg-green-500" },
      { label: "Messenger", value: counts.messenger ?? 0, color: "bg-blue-500" },
      { label: "Web", value: counts.web ?? 0, color: "bg-gray-500" },
    ].filter((d) => d.value > 0);
  }, [orders]);

  const recentOrders = orders.slice(0, 8);

  // Top-selling products from order items
  const topProducts = useMemo(() => {
    const prodMap = new Map<string, { name: string; qty: number; revenue: number }>();
    for (const item of recentItems) {
      const existing = prodMap.get(item.name) ?? { name: item.name, qty: 0, revenue: 0 };
      existing.qty += item.qty;
      existing.revenue += item.lineTotal;
      prodMap.set(item.name, existing);
    }
    return [...prodMap.values()]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
  }, [recentItems]);

  return (
    <div className="space-y-8">
      {/* Welcome */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Welcome back, {userName} 👋
        </h1>
        <p className="text-muted-foreground mt-1 text-base">
          Here&apos;s what&apos;s happening with your store today.
        </p>
      </div>

      {/* ─── Stat Cards ─────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          {
            label: "Total Revenue",
            value: formatCurrency(stats.totalRevenue),
            icon: TrendingUp,
            gradient: "from-emerald-500/15 to-emerald-600/5 dark:from-emerald-500/25 dark:to-emerald-600/10",
            iconBg: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
            textColor: "text-emerald-700 dark:text-emerald-400",
          },
          {
            label: "Total Orders",
            value: stats.totalOrders,
            icon: ShoppingCart,
            gradient: "from-blue-500/15 to-blue-600/5 dark:from-blue-500/25 dark:to-blue-600/10",
            iconBg: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
            textColor: "text-blue-700 dark:text-blue-400",
          },
          {
            label: "Customers",
            value: customerCount,
            icon: Users,
            gradient: "from-violet-500/15 to-violet-600/5 dark:from-violet-500/25 dark:to-violet-600/10",
            iconBg: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
            textColor: "text-violet-700 dark:text-violet-400",
          },
          {
            label: "Avg. Order Value",
            value: formatCurrency(stats.avgOrderValue),
            icon: TrendingUp,
            gradient: "from-amber-500/15 to-amber-600/5 dark:from-amber-500/25 dark:to-amber-600/10",
            iconBg: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
            textColor: "text-amber-700 dark:text-amber-400",
          },
        ].map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className={cn(
                "group relative overflow-hidden rounded-2xl border bg-gradient-to-br p-5 transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5",
                card.gradient,
              )}
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  {card.label}
                </p>
                <div className={cn("rounded-xl p-2", card.iconBg)}>
                  <Icon className="h-4 w-4" />
                </div>
              </div>
              <p className={cn("mt-3 text-3xl font-bold tabular-nums", card.textColor)}>
                {card.value}
              </p>
            </div>
          );
        })}
      </div>

      {/* ─── Secondary Stats Row ────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: "Products", value: productCount, icon: Package, href: "/dashboard/products" },
          { label: "Active Offers", value: activeOfferCount, icon: Percent, href: "/dashboard/offers" },
          { label: "Messages", value: messageStats.total, icon: MessageSquare, href: "/dashboard/inbox" },
        ].map((s) => {
          const Icon = s.icon;
          return (
            <Link
              key={s.label}
              href={s.href}
              className="group flex items-center gap-3 rounded-2xl border bg-card p-4 transition-all hover:shadow-md hover:-translate-y-0.5"
            >
              <div className="rounded-xl bg-primary/10 p-2.5">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold tabular-nums text-foreground">
                  {s.value}
                </p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
              <ArrowUpRight className="ml-auto h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </Link>
          );
        })}
      </div>

      {/* ─── Charts Row ─────────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Order Status Chart */}
        <div className="rounded-2xl border bg-card p-6">
          <h3 className="mb-4 text-sm font-semibold text-foreground">
            Order Status Breakdown
          </h3>
          {statusBreakdown.length > 0 ? (
            <MiniBarChart data={statusBreakdown} />
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No orders yet
            </p>
          )}
        </div>

        {/* Channel Distribution */}
        <div className="rounded-2xl border bg-card p-6">
          <h3 className="mb-4 text-sm font-semibold text-foreground">
            Messages by Platform
          </h3>
          <MiniDonut
            segments={[
              { label: "Instagram", value: messageStats.platformBreakdown.instagram, color: "stroke-pink-500" },
              { label: "WhatsApp", value: messageStats.platformBreakdown.whatsapp, color: "stroke-green-500" },
              { label: "Facebook", value: messageStats.platformBreakdown.facebook, color: "stroke-blue-500" },
            ].filter((s) => s.value > 0)}
          />
        </div>
      </div>

      {/* ─── Bottom Row ─────────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Orders */}
        <div className="rounded-2xl border bg-card">
          <div className="flex items-center justify-between border-b px-6 py-4">
            <h3 className="text-sm font-semibold text-foreground">
              Recent Orders
            </h3>
            <Link href="/dashboard/orders">
              <Button variant="ghost" size="sm" className="text-xs">
                View all <ArrowUpRight className="ml-1 h-3 w-3" />
              </Button>
            </Link>
          </div>
          <div className="divide-y">
            {recentOrders.length > 0 ? (
              recentOrders.map((o) => {
                const StatusIcon = STATUS_ICONS[o.status] ?? Clock;
                return (
                  <div
                    key={o.id}
                    className="flex items-center gap-3 px-6 py-3 transition-colors hover:bg-muted/30"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                      <StatusIcon className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        #{o.orderNumber} · {o.customerName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {relativeTime(o.createdAt)}
                        {o.channel && ` · ${o.channel}`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold tabular-nums">
                        {formatCurrency(o.total)}
                      </p>
                      <Badge
                        variant={o.status === "delivered" ? "success" : o.status === "cancelled" ? "destructive" : "secondary"}
                        className="text-[10px]"
                      >
                        {o.status}
                      </Badge>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="px-6 py-8 text-center text-sm text-muted-foreground">
                No orders yet
              </p>
            )}
          </div>
        </div>

        {/* Sales by Channel */}
        <div className="rounded-2xl border bg-card">
          <div className="flex items-center justify-between border-b px-6 py-4">
            <h3 className="text-sm font-semibold text-foreground">
              Sales by Channel
            </h3>
          </div>
          <div className="p-6">
            {channelBreakdown.length > 0 ? (
              <div className="space-y-4">
                {channelBreakdown.map((ch) => {
                  const pct = Math.round((ch.value / (stats.totalOrders || 1)) * 100);
                  return (
                    <div key={ch.label}>
                      <div className="mb-1.5 flex items-center justify-between text-sm">
                        <span className="font-medium text-foreground">
                          {ch.label}
                        </span>
                        <span className="text-muted-foreground tabular-nums">
                          {ch.value} orders ({pct}%)
                        </span>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn("h-full rounded-full transition-all duration-700", ch.color)}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No channel data yet
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Top Products */}
      {topProducts.length > 0 && (
        <div className="rounded-2xl border bg-card">
          <div className="flex items-center justify-between border-b px-6 py-4">
            <h3 className="text-sm font-semibold text-foreground">
              Top Selling Products
            </h3>
            <Link href="/dashboard/products">
              <Button variant="ghost" size="sm" className="text-xs">
                View all <ArrowUpRight className="ml-1 h-3 w-3" />
              </Button>
            </Link>
          </div>
          <div className="divide-y">
            {topProducts.map((p, i) => (
              <div
                key={p.name}
                className="flex items-center gap-3 px-6 py-3 transition-colors hover:bg-muted/30"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-xs font-bold text-muted-foreground">
                  #{i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{p.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.qty} units sold
                  </p>
                </div>
                <p className="text-sm font-bold tabular-nums text-foreground">
                  {formatCurrency(p.revenue)}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
