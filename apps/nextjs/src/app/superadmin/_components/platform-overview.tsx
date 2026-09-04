"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Bot,
  CheckCircle2,
  MessageSquare,
  Sparkles,
  Store,
  Users,
} from "lucide-react";

import { cn } from "@acme/ui";
import { Badge } from "@acme/ui/badge";
import { Button } from "@acme/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@acme/ui/card";
import { Skeleton } from "@acme/ui/skeleton";

import { useTRPC } from "~/trpc/react";

function formatBDT(amount: number) {
  return new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: "BDT",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function PlatformOverview({
  onSwitchTab,
}: {
  onSwitchTab: (tab: "stores" | "users" | "payments" | "bugs") => void;
}) {
  const trpc = useTRPC();
  const { data, isLoading } = useQuery(
    trpc.superadmin.getPlatformOverview.queryOptions(),
  );

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="p-6">
              <Skeleton className="mb-2 h-4 w-24" />
              <Skeleton className="mb-1 h-8 w-16" />
              <Skeleton className="h-3 w-32" />
            </Card>
          ))}
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <Card className="p-6">
            <Skeleton className="mb-4 h-5 w-32" />
            <Skeleton className="h-32 w-full" />
          </Card>
          <Card className="p-6">
            <Skeleton className="mb-4 h-5 w-32" />
            <Skeleton className="h-32 w-full" />
          </Card>
        </div>
      </div>
    );
  }

  const { kpis, recentStores, recentOrders, storesByPlan } = data;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Stores */}
        <Card className="border-border/60 from-card to-accent/20 relative overflow-hidden bg-gradient-to-br shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
              Total Stores
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-500">
              <Store className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight">
              {kpis.totalStores}
            </div>
            <p className="text-muted-foreground mt-1 flex items-center text-xs">
              Active merchants on platform
            </p>
          </CardContent>
        </Card>

        {/* Total Platform GMV */}
        <Card className="border-border/60 from-card to-accent/20 relative overflow-hidden bg-gradient-to-br shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
              Platform GMV
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
              <span className="text-sm font-bold">৳</span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight">
              {formatBDT(kpis.totalGmv)}
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              {kpis.totalOrders} total orders processed
            </p>
          </CardContent>
        </Card>

        {/* Registered Users */}
        <Card className="border-border/60 from-card to-accent/20 relative overflow-hidden bg-gradient-to-br shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
              Platform Users
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10 text-violet-500">
              <Users className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight">
              {kpis.totalUsers}
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              Store owners & team members
            </p>
          </CardContent>
        </Card>

        {/* Meta Channels & AI */}
        <Card className="border-border/60 from-card to-accent/20 relative overflow-hidden bg-gradient-to-br shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
              Active Channels
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
              <MessageSquare className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight">
              {kpis.metaStats.total}
            </div>
            <div className="text-muted-foreground mt-1 flex items-center gap-2 text-xs">
              <span>{kpis.metaStats.whatsapp} WhatsApp</span>
              <span>•</span>
              <span>{kpis.metaStats.facebook} FB</span>
              <span>•</span>
              <span>{kpis.metaStats.instagram} IG</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Secondary Row: AI Usage Highlight & Plan Breakdown */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card className="border-border/60 bg-card p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <p className="text-muted-foreground text-xs font-medium">
                Total AI Replies Handled
              </p>
              <h3 className="text-xl font-bold">
                {kpis.totalAiConversations.toLocaleString()}{" "}
                <span className="text-muted-foreground text-xs font-normal">
                  messages
                </span>
              </h3>
            </div>
          </div>
        </Card>

        <Card className="border-border/60 bg-card p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
              <CheckCircle2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-muted-foreground text-xs font-medium">
                Avg GMV per Store
              </p>
              <h3 className="text-xl font-bold">
                {formatBDT(
                  kpis.totalStores > 0
                    ? Math.round(kpis.totalGmv / kpis.totalStores)
                    : 0,
                )}
              </h3>
            </div>
          </div>
        </Card>

        <Card className="border-border/60 bg-card p-5">
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 text-primary flex h-10 w-10 items-center justify-center rounded-xl">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <p className="text-muted-foreground text-xs font-medium">
                Active Subscriptions
              </p>
              <div className="mt-0.5 flex items-center gap-1.5">
                {storesByPlan.length > 0 ? (
                  storesByPlan.map((s) => (
                    <Badge
                      key={s.plan}
                      variant="outline"
                      className="px-1.5 py-0 text-[10px] capitalize"
                    >
                      {s.plan}: {s.count}
                    </Badge>
                  ))
                ) : (
                  <span className="text-muted-foreground text-xs">
                    No active plans yet
                  </span>
                )}
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Tables Row: Recent Stores & Recent Orders */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent Stores */}
        <Card className="border-border/60">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base font-semibold">
                Recent Stores
              </CardTitle>
              <CardDescription className="text-xs">
                Newly registered stores on SellPilot
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onSwitchTab("stores")}
              className="text-primary h-8 gap-1 text-xs"
            >
              View all <ArrowUpRight className="h-3 w-3" />
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y text-sm">
              {recentStores.map((s) => (
                <div
                  key={s.id}
                  className="hover:bg-muted/40 flex items-center justify-between px-6 py-3.5 transition-colors"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="bg-primary/10 text-primary flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold">
                      {s.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-foreground truncate font-semibold">
                          {s.name}
                        </span>
                        <span className="text-muted-foreground font-mono text-[11px]">
                          /{s.slug}
                        </span>
                      </div>
                      <p className="text-muted-foreground truncate text-xs">
                        Owner:{" "}
                        {s.owner
                          ? `${s.owner.name} (${s.owner.email})`
                          : "Unassigned"}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-muted-foreground hidden text-xs sm:inline">
                      {formatDate(s.createdAt)}
                    </span>
                    <Button
                      asChild
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1 px-2 text-xs"
                    >
                      <Link
                        href={`/${s.slug}/dashboard`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Enter <ArrowUpRight className="h-3 w-3" />
                      </Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recent Orders Across Platform */}
        <Card className="border-border/60">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base font-semibold">
                Latest Platform Orders
              </CardTitle>
              <CardDescription className="text-xs">
                Live customer orders across all stores
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y text-sm">
              {recentOrders.length > 0 ? (
                recentOrders.map((o) => (
                  <div
                    key={o.id}
                    className="hover:bg-muted/40 flex items-center justify-between px-6 py-3.5 transition-colors"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-foreground font-semibold">
                          {o.orderNumber}
                        </span>
                        <Badge
                          variant="secondary"
                          className="px-1.5 py-0 text-[10px] capitalize"
                        >
                          {o.businessName}
                        </Badge>
                        <Badge
                          variant="outline"
                          className={cn(
                            "px-1.5 py-0 text-[10px] capitalize",
                            o.status === "confirmed" &&
                              "border-blue-500/30 text-blue-500",
                            o.status === "delivered" &&
                              "border-emerald-500/30 text-emerald-500",
                            o.status === "cancelled" &&
                              "border-red-500/30 text-red-500",
                          )}
                        >
                          {o.status}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground mt-0.5 text-xs">
                        Customer: {o.customerName}{" "}
                        {o.channel ? `via ${o.channel}` : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-foreground text-sm font-semibold">
                        {formatBDT(o.total)}
                      </div>
                      <span className="text-muted-foreground text-[11px]">
                        {formatDate(o.createdAt)}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-muted-foreground p-8 text-center text-xs">
                  No orders recorded yet.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
