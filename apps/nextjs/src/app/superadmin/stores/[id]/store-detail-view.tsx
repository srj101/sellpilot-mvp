"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Clock,
  DollarSign,
  ExternalLink,
  HardDrive,
  MessageSquare,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldOff,
  Sparkles,
  Store,
  Users,
} from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

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
import { toast } from "@acme/ui/toast";

import { useTRPC } from "~/trpc/react";

function formatBDT(amount: number) {
  return new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: "BDT",
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(date: Date | string | null | undefined) {
  if (!date) return "N/A";
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function StoreDetailView({ storeId }: { storeId: string }) {
  const trpc = useTRPC();
  const router = useRouter();
  const [econDays, setEconDays] = useState(30);

  const {
    data: store,
    isLoading: storeLoading,
    refetch: refetchStore,
  } = useQuery(trpc.superadmin.getStoreDetail.queryOptions({ businessId: storeId }));

  const {
    data: econ,
    isLoading: econLoading,
    refetch: refetchEcon,
  } = useQuery(
    trpc.superadmin.getStoreEconomics.queryOptions({
      businessId: storeId,
      days: econDays,
    }),
  );

  const updateSub = useMutation(
    trpc.superadmin.updateStoreSubscription.mutationOptions({
      onSuccess: () => {
        toast.success("Store subscription updated successfully.");
        void refetchStore();
        void refetchEcon();
      },
      onError: (err) => {
        toast.error(err.message || "Failed to update subscription");
      },
    }),
  );

  const toggleSuspension = useMutation(
    trpc.superadmin.toggleStoreSuspension.mutationOptions({
      onSuccess: () => {
        toast.success("Store status updated successfully.");
        void refetchStore();
      },
      onError: (err) => {
        toast.error(err.message || "Failed to toggle store suspension");
      },
    }),
  );

  const setBanStatus = useMutation(
    trpc.superadmin.setBanStatus.mutationOptions({
      onSuccess: (_data, vars) => {
        toast.success(vars.banned ? "User banned" : "User unbanned");
        void refetchStore();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  if (storeLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="p-6">
              <Skeleton className="h-16 w-full" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!store) {
    return (
      <div className="space-y-6">
        <Button variant="ghost" size="sm" asChild className="gap-1.5 text-xs">
          <Link href="/superadmin/stores">
            <ArrowLeft className="h-4 w-4" /> Back to Stores Directory
          </Link>
        </Button>
        <Card className="p-12 text-center">
          <Store className="text-muted-foreground mx-auto h-12 w-12 opacity-40 mb-3" />
          <h2 className="text-lg font-semibold">Store not found</h2>
          <p className="text-muted-foreground text-sm mt-1">
            No merchant store was found with ID: {storeId}
          </p>
        </Card>
      </div>
    );
  }

  const isSuspended = store.subscription?.status === "past_due";
  const marginIsPositive = (econ?.marginTaka ?? 0) >= 0;

  return (
    <div className="space-y-6">
      {/* Navigation Breadcrumb & Actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            className="h-9 w-9 rounded-xl shrink-0"
            onClick={() => router.push("/superadmin/stores")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>

          <div className="bg-primary/10 text-primary flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-base font-bold">
            {store.name.slice(0, 2).toUpperCase()}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold tracking-tight">{store.name}</h1>
              <Badge
                variant="outline"
                className={cn(
                  "capitalize text-xs",
                  store.subscription?.plan === "pro" && "border-violet-500/30 text-violet-600 dark:text-violet-400 bg-violet-500/10",
                  store.subscription?.plan === "growth" && "border-blue-500/30 text-blue-600 dark:text-blue-400 bg-blue-500/10",
                  store.subscription?.plan === "starter" && "border-emerald-500/30 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10",
                )}
              >
                {store.subscription?.plan ?? "free"}
              </Badge>
              {isSuspended && (
                <Badge variant="destructive" className="text-xs">
                  Suspended
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground font-mono text-xs mt-0.5">
              /{store.slug} · ID: {store.id}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 text-xs"
            onClick={() => {
              void refetchStore();
              void refetchEcon();
            }}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </Button>

          <Button asChild size="sm" className="h-9 gap-1.5 text-xs shadow-xs">
            <Link
              href={`/${store.slug}/dashboard`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Enter Dashboard as Superadmin
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>
      </div>

      {/* Hero Stats Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Margin Tile */}
        <Card
          className={cn(
            "border",
            marginIsPositive
              ? "border-emerald-500/20 bg-emerald-500/5"
              : "border-rose-500/20 bg-rose-500/5",
          )}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              30-Day Net Margin
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div
              className={cn(
                "text-2xl font-bold",
                marginIsPositive
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-rose-600 dark:text-rose-400",
              )}
            >
              {econLoading ? "…" : formatBDT(econ?.marginTaka ?? 0)}
            </div>
            <p className="text-muted-foreground text-xs mt-1">
              {econ?.marginPct !== null && econ?.marginPct !== undefined
                ? `${econ.marginPct.toFixed(1)}% margin on revenue`
                : "No SaaS invoice revenue yet"}
            </p>
          </CardContent>
        </Card>

        {/* Total GMV Tile */}
        <Card className="border-border/60">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Store Lifetime GMV
            </CardTitle>
            <Store className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatBDT(store.totalGmv)}</div>
            <p className="text-muted-foreground text-xs mt-1">
              Across {store.ordersCount} completed orders
            </p>
          </CardContent>
        </Card>

        {/* AI Consumption Tile */}
        <Card className="border-border/60">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              AI Messages Used
            </CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {store.subscription?.aiConversationsUsed ?? 0}
            </div>
            <p className="text-muted-foreground text-xs mt-1">
              +{store.subscription?.extraConversations ?? 0} purchased capacity
            </p>
          </CardContent>
        </Card>

        {/* Catalog Items */}
        <Card className="border-border/60">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Products Ingested
            </CardTitle>
            <HardDrive className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{store.productsCount}</div>
            <p className="text-muted-foreground text-xs mt-1">
              Created {formatDate(store.createdAt)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Grid: Economics & Controls */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left 2 Cols: Economics Chart & Cost Breakdown */}
        <div className="space-y-6 lg:col-span-2">
          {/* Revenue vs Cost Chart */}
          <Card className="border-border/60">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Store Economics ({econDays} Days)</CardTitle>
                <CardDescription>
                  SaaS revenue collected vs platform costs incurred by this store
                </CardDescription>
              </div>
              <div className="flex items-center gap-1 border rounded-lg p-1 bg-card">
                {[14, 30, 90].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setEconDays(d)}
                    className={cn(
                      "px-2 py-0.5 text-xs font-medium rounded-md transition-colors",
                      econDays === d
                        ? "bg-primary text-primary-foreground font-semibold"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {d}d
                  </button>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              {econLoading ? (
                <Skeleton className="h-64 w-full" />
              ) : (econ?.series ?? []).length === 0 ? (
                <div className="h-64 flex items-center justify-center text-muted-foreground text-sm border-dashed border rounded-xl">
                  No activity recorded for this store in the selected window.
                </div>
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                      data={econ?.series}
                      margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                    >
                      <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                      <XAxis
                        dataKey="day"
                        tickLine={false}
                        axisLine={false}
                        fontSize={11}
                        stroke="var(--muted-foreground)"
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        fontSize={11}
                        stroke="var(--muted-foreground)"
                        tickFormatter={(v: number) => `৳${v}`}
                      />
                      <Tooltip
                        contentStyle={{
                          borderRadius: 12,
                          border: "1px solid var(--border)",
                          fontSize: 12,
                          background: "var(--card)",
                        }}
                        formatter={(val, name) => [
                          `৳${Number(val ?? 0).toLocaleString()}`,
                          name === "revenueTaka" ? "Revenue" : "Direct Cost",
                        ]}
                      />
                      <Legend
                        formatter={(value: string) =>
                          value === "revenueTaka" ? "SaaS Revenue" : "Direct Cost"
                        }
                      />
                      <Line
                        type="monotone"
                        dataKey="revenueTaka"
                        stroke="var(--econ-cat-1)"
                        strokeWidth={2}
                        dot={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="costTaka"
                        stroke="var(--econ-cat-2)"
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Cost by Source Breakdown */}
          <Card className="border-border/60">
            <CardHeader>
              <CardTitle className="text-base">Cost Ledger by Source</CardTitle>
              <CardDescription>
                Direct vendor infrastructure cost attributable to /{store.slug}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {econLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-8 w-full" />
                  ))}
                </div>
              ) : (econ?.costBySource ?? []).length === 0 ? (
                <p className="text-muted-foreground text-xs italic">
                  No direct platform costs logged for this store.
                </p>
              ) : (
                <div className="space-y-3">
                  {(econ?.costBySource ?? []).map((sourceItem) => {
                    const totalCost = (econ?.costTaka ?? 0) > 0 ? (econ?.costTaka ?? 1) : 1;
                    const pct = Math.min(
                      100,
                      Math.round((sourceItem.costTaka / totalCost) * 100),
                    );
                    return (
                      <div key={sourceItem.source} className="space-y-1">
                        <div className="flex justify-between text-xs font-medium">
                          <span className="capitalize text-foreground font-mono">
                            {sourceItem.source.replace(/_/g, " ")}
                          </span>
                          <span className="text-foreground">
                            {formatBDT(sourceItem.costTaka)} ({pct}%)
                          </span>
                        </div>
                        <div className="h-1.5 w-full bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Connected Meta Channels */}
          <Card className="border-border/60">
            <CardHeader>
              <CardTitle className="text-base">Connected Meta Channels</CardTitle>
              <CardDescription>
                Live integrations receiving customer messages and order updates
              </CardDescription>
            </CardHeader>
            <CardContent>
              {store.metaConnections.length === 0 ? (
                <p className="text-muted-foreground text-xs italic">
                  No Meta channels linked to this store.
                </p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {store.metaConnections.map((conn) => {
                    const isWa = conn.platform === "whatsapp";
                    const isFb = conn.platform === "facebook_page";
                    return (
                      <div
                        key={conn.id}
                        className="bg-card flex items-center justify-between rounded-xl border p-3 text-xs"
                      >
                        <div className="flex items-center gap-2.5">
                          <span
                            className={cn(
                              "flex h-7 w-7 items-center justify-center rounded-lg text-[10px] font-bold",
                              isWa
                                ? "bg-green-500/10 text-green-600 dark:text-green-400"
                                : isFb
                                  ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                                  : "bg-pink-500/10 text-pink-600 dark:text-pink-400",
                            )}
                          >
                            {isWa ? "WA" : isFb ? "FB" : "IG"}
                          </span>
                          <div>
                            <p className="font-semibold text-foreground capitalize">
                              {conn.platform.replace("_", " ")}
                            </p>
                            <p className="text-muted-foreground text-[11px]">
                              {conn.facebookPageName ??
                                conn.instagramUsername ??
                                conn.platformAccountName ??
                                "Connected"}
                            </p>
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className={cn(
                            "capitalize text-[10px]",
                            conn.status === "active"
                              ? "border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                              : "border-rose-500/30 text-rose-600",
                          )}
                        >
                          {conn.status}
                        </Badge>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Col: Admin Controls & Management */}
        <div className="space-y-6">
          {/* Superadmin Overrides */}
          <Card className="border-primary/20 bg-primary/5">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-primary text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5" />
                  Superadmin Controls
                </CardTitle>
                <Badge variant="outline" className="border-primary/30 text-primary text-[10px]">
                  Staff Only
                </Badge>
              </div>
              <CardDescription className="text-xs">
                Directly adjust quotas, extend trials, or switch subscription plan.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 flex-1 text-xs"
                  disabled={updateSub.isPending}
                  onClick={() => {
                    updateSub.mutate({
                      businessId: store.id,
                      extendTrialDays: 14,
                    });
                  }}
                >
                  +14d Trial
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 flex-1 text-xs"
                  disabled={updateSub.isPending}
                  onClick={() => {
                    updateSub.mutate({
                      businessId: store.id,
                      addExtraConversations: 100,
                    });
                  }}
                >
                  +100 AI Msgs
                </Button>
              </div>

              <div className="space-y-1 pt-1">
                <span className="text-muted-foreground text-xs block">
                  Change Plan Tier:
                </span>
                <div className="flex gap-1.5">
                  {(["starter", "growth", "pro"] as const).map((p) => (
                    <Button
                      key={p}
                      size="sm"
                      variant={store.subscription?.plan === p ? "default" : "outline"}
                      className="h-7 px-2 text-[11px] capitalize flex-1"
                      disabled={updateSub.isPending || store.subscription?.plan === p}
                      onClick={() => {
                        updateSub.mutate({
                          businessId: store.id,
                          plan: p,
                        });
                      }}
                    >
                      {p}
                    </Button>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Store Owner Card */}
          <Card className="border-border/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />
                Store Owner & Access
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs">
              {store.owner ? (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-foreground text-sm">
                        {store.owner.name}
                      </p>
                      <p className="text-muted-foreground text-xs">{store.owner.email}</p>
                    </div>
                    {store.owner.banned ? (
                      <Badge variant="destructive" className="text-[10px]">
                        Banned
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-emerald-500/30 text-emerald-600 text-[10px]">
                        Active
                      </Badge>
                    )}
                  </div>

                  <div className="border-t pt-2 space-y-1">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Team Members:</span>
                      <span className="text-foreground font-semibold">
                        {store.membersCount}
                      </span>
                    </div>
                  </div>

                  <div className="pt-2">
                    {store.owner.banned ? (
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full gap-1.5 text-xs text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/10"
                        disabled={setBanStatus.isPending}
                        onClick={() => {
                          if (!store.owner) return;
                          setBanStatus.mutate({
                            userId: store.owner.userId,
                            banned: false,
                          });
                        }}
                      >
                        <Shield className="h-3.5 w-3.5" />
                        Unban Owner Account
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full gap-1.5 text-xs text-rose-600 border-rose-500/30 hover:bg-rose-500/10"
                        disabled={setBanStatus.isPending}
                        onClick={() => {
                          if (!store.owner) return;
                          if (confirm(`Ban owner ${store.owner.name}? They will be blocked from logging in.`)) {
                            setBanStatus.mutate({
                              userId: store.owner.userId,
                              banned: true,
                              banReason: "Banned by superadmin via store detail",
                            });
                          }
                        }}
                      >
                        <ShieldOff className="h-3.5 w-3.5" />
                        Ban Owner Account
                      </Button>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-muted-foreground italic">No owner assigned.</p>
              )}
            </CardContent>
          </Card>

          {/* Subscription Metadata */}
          <Card className="border-border/60">
            <CardHeader className="pb-3">
              <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                Subscription Period
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Billing Cycle:</span>
                <span className="font-semibold capitalize text-foreground">
                  Monthly
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Period End / Renewal:</span>
                <span className="font-semibold text-foreground">
                  {formatDate(store.subscription?.currentPeriodEnd)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Renewal Amount:</span>
                <span className="font-semibold text-foreground">
                  {store.subscription?.amount ? formatBDT(store.subscription.amount) : "৳0"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Storage Used:</span>
                <span className="font-semibold text-foreground">
                  {((store.subscription?.storageUsedBytes ?? 0) / (1024 * 1024)).toFixed(1)} MB
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Emergency Suspension Controls */}
          <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4 space-y-3">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-rose-500" />
              <h4 className="text-xs font-semibold text-rose-600 dark:text-rose-400 uppercase tracking-wider">
                Store Security & Access
              </h4>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Suspension immediately halts webhook processing, locks merchant dashboard access, and pauses AI reply quotas.
            </p>
            <div className="pt-1">
              {isSuspended ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 text-xs text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/10 w-full"
                  disabled={toggleSuspension.isPending}
                  onClick={() => {
                    toggleSuspension.mutate({
                      businessId: store.id,
                      suspend: false,
                    });
                  }}
                >
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Lift Suspension (Reactivate Store)
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 text-xs text-rose-600 border-rose-500/30 hover:bg-rose-500/10 w-full"
                  disabled={toggleSuspension.isPending}
                  onClick={() => {
                    if (
                      confirm(
                        `Are you sure you want to suspend "${store.name}"? This immediately locks merchant access.`,
                      )
                    ) {
                      toggleSuspension.mutate({
                        businessId: store.id,
                        suspend: true,
                        reason: "Administrative suspension by Superadmin",
                      });
                    }
                  }}
                >
                  <ShieldAlert className="h-3.5 w-3.5" />
                  Suspend Store (Emergency Lock)
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
