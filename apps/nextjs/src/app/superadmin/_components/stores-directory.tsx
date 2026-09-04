"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowUpRight, ExternalLink, Search, Sparkles, X } from "lucide-react";

import { cn } from "@acme/ui";
import { Badge } from "@acme/ui/badge";
import { Button } from "@acme/ui/button";
import { Card, CardContent } from "@acme/ui/card";
import { Input } from "@acme/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@acme/ui/sheet";
import { Skeleton } from "@acme/ui/skeleton";
import { toast } from "@acme/ui/toast";

import { useTRPC } from "~/trpc/react";

interface StoreItem {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  createdAt: Date | string;
  owner: {
    userId: string;
    name: string;
    email: string;
    image: string | null;
  } | null;
  membersCount: number;
  productsCount: number;
  ordersCount: number;
  totalGmv: number;
  subscription: {
    businessId: string | null;
    plan: string;
    status: string;
    aiConversationsUsed: number | null;
    amount: number;
    billingCycle: string;
    currentPeriodEnd: Date | string | null;
  } | null;
  metaConnections: {
    businessId: string;
    platform: string;
    platformAccountName: string | null;
    facebookPageName: string | null;
    instagramUsername: string | null;
    status: string;
  }[];
}

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

export function StoresDirectory() {
  const trpc = useTRPC();
  const { data: stores, isLoading, refetch } = useQuery(
    trpc.superadmin.listStores.queryOptions(),
  );
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState<string>("all");
  const [selectedStore, setSelectedStore] = useState<StoreItem | null>(null);

  const updateSub = useMutation(
    trpc.superadmin.updateStoreSubscription.mutationOptions({
      onSuccess: () => {
        toast.success("Store subscription updated successfully.");
        void refetch();
      },
      onError: (err) => {
        toast.error(err.message || "Failed to update subscription");
      },
    }),
  );

  const filtered = useMemo(() => {
    if (!stores) return [];
    return stores.filter((s) => {
      const q = search.toLowerCase().trim();
      const matchSearch =
        !q ||
        s.name.toLowerCase().includes(q) ||
        s.slug.toLowerCase().includes(q) ||
        (s.owner?.name.toLowerCase().includes(q) ?? false) ||
        (s.owner?.email.toLowerCase().includes(q) ?? false);

      if (!matchSearch) return false;

      if (planFilter !== "all") {
        const storePlan = s.subscription?.plan ?? "free";
        if (storePlan !== planFilter) return false;
      }

      return true;
    });
  }, [stores, search, planFilter]);

  if (isLoading || !stores) {
    return (
      <div className="space-y-4">
        <div className="flex gap-4">
          <Skeleton className="h-10 w-72" />
          <Skeleton className="h-10 w-32" />
        </div>
        <Card className="p-6">
          <Skeleton className="h-40 w-full" />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">
            Stores Directory
          </h2>
          <p className="text-muted-foreground text-xs">
            {stores.length} registered merchant stores across SellPilot
          </p>
        </div>

        {/* Plan Filter Badges */}
        <div className="bg-card flex flex-wrap items-center gap-1.5 rounded-lg border p-1">
          {["all", "starter", "growth", "pro"].map((plan) => (
            <button
              key={plan}
              type="button"
              onClick={() => setPlanFilter(plan)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium capitalize transition-colors",
                planFilter === plan
                  ? "bg-primary text-primary-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {plan === "all" ? "All Plans" : plan}
            </button>
          ))}
        </div>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
        <Input
          placeholder="Search by store name, slug, owner name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-background/50 h-10 rounded-xl border pl-9 text-sm"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch("")}
            className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Store Table */}
      <Card className="border-border/60 overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted/40 text-muted-foreground border-b text-xs font-semibold tracking-wider uppercase">
                <tr>
                  <th className="px-5 py-3.5">Store</th>
                  <th className="px-5 py-3.5">Owner</th>
                  <th className="px-5 py-3.5">Channels</th>
                  <th className="px-5 py-3.5">Products</th>
                  <th className="px-5 py-3.5">Orders & GMV</th>
                  <th className="px-5 py-3.5">Plan</th>
                  <th className="px-5 py-3.5">Created</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y text-xs">
                {filtered.length > 0 ? (
                  filtered.map((store) => {
                    const fb = store.metaConnections.find(
                      (c) => c.platform === "facebook_page",
                    );
                    const ig = store.metaConnections.find(
                      (c) => c.platform === "instagram",
                    );
                    const wa = store.metaConnections.find(
                      (c) => c.platform === "whatsapp",
                    );
                    const plan = store.subscription?.plan ?? "free";
                    const isTrialing =
                      store.subscription?.status === "trialing";

                    return (
                      <tr
                        key={store.id}
                        className="hover:bg-muted/30 group transition-colors"
                      >
                        {/* Store Info */}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="bg-primary/10 text-primary flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold">
                              {store.name.slice(0, 2).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="text-foreground truncate font-semibold">
                                {store.name}
                              </div>
                              <div className="text-muted-foreground font-mono text-[11px]">
                                /{store.slug}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Owner */}
                        <td className="px-5 py-3.5">
                          {store.owner ? (
                            <div className="min-w-0">
                              <div className="text-foreground truncate font-medium">
                                {store.owner.name}
                              </div>
                              <div className="text-muted-foreground truncate text-[11px]">
                                {store.owner.email}
                              </div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground italic">
                              No owner assigned
                            </span>
                          )}
                        </td>

                        {/* Channels */}
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-1">
                            {wa && (
                              <span
                                title={`WhatsApp: ${wa.platformAccountName ?? "Connected"}`}
                                className="inline-flex items-center rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400"
                              >
                                WA
                              </span>
                            )}
                            {fb && (
                              <span
                                title={`Facebook: ${fb.facebookPageName ?? "Connected"}`}
                                className="inline-flex items-center rounded-md bg-blue-500/10 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400"
                              >
                                FB
                              </span>
                            )}
                            {ig && (
                              <span
                                title={`Instagram: ${ig.instagramUsername ?? "Connected"}`}
                                className="inline-flex items-center rounded-md bg-pink-500/10 px-1.5 py-0.5 text-[10px] font-medium text-pink-600 dark:text-pink-400"
                              >
                                IG
                              </span>
                            )}
                            {!wa && !fb && !ig && (
                              <span className="text-muted-foreground text-[11px]">
                                —
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Products */}
                        <td className="text-foreground px-5 py-3.5 font-medium">
                          {store.productsCount} items
                        </td>

                        {/* Orders & GMV */}
                        <td className="px-5 py-3.5">
                          <div className="text-foreground font-semibold">
                            {formatBDT(store.totalGmv)}
                          </div>
                          <div className="text-muted-foreground text-[11px]">
                            {store.ordersCount} orders
                          </div>
                        </td>

                        {/* Plan */}
                        <td className="px-5 py-3.5">
                          <div className="flex flex-col items-start gap-0.5">
                            <Badge
                              variant="outline"
                              className={cn(
                                "px-1.5 py-0 text-[10px] capitalize",
                                plan === "pro" &&
                                  "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400",
                                plan === "growth" &&
                                  "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400",
                                plan === "starter" &&
                                  "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
                                plan === "free" && "text-muted-foreground",
                              )}
                            >
                              {plan}
                            </Badge>
                            {isTrialing && (
                              <span className="text-[9px] font-semibold tracking-wider text-amber-500 uppercase">
                                Trial
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Created Date */}
                        <td className="text-muted-foreground px-5 py-3.5 whitespace-nowrap">
                          {formatDate(store.createdAt)}
                        </td>

                        {/* Actions */}
                        <td className="px-5 py-3.5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setSelectedStore(store)}
                              className="h-7 px-2 text-xs"
                            >
                              Details
                            </Button>
                            <Button
                              asChild
                              size="sm"
                              variant="default"
                              className="h-7 gap-1 px-2 text-xs shadow-xs"
                            >
                              <Link
                                href={`/${store.slug}/dashboard`}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                Enter <ArrowUpRight className="h-3 w-3" />
                              </Link>
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td
                      colSpan={8}
                      className="text-muted-foreground p-8 text-center"
                    >
                      No stores found matching your criteria.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Store Details Slide-over Sheet */}
      <Sheet
        open={Boolean(selectedStore)}
        onOpenChange={(open) => !open && setSelectedStore(null)}
      >
        {selectedStore && (
          <SheetContent
            side="right"
            className="w-full space-y-6 overflow-y-auto p-6 sm:max-w-md"
          >
            <SheetHeader>
              <div className="flex items-center gap-3">
                <div className="bg-primary/10 text-primary flex h-10 w-10 items-center justify-center rounded-xl text-sm font-bold">
                  {selectedStore.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <SheetTitle className="text-lg font-bold">
                    {selectedStore.name}
                  </SheetTitle>
                  <SheetDescription className="font-mono text-xs">
                    /{selectedStore.slug}
                  </SheetDescription>
                </div>
              </div>
            </SheetHeader>

            {/* Quick Action Button */}
            <div className="pt-2">
              <Button asChild className="w-full gap-2 shadow-xs" size="sm">
                <Link
                  href={`/${selectedStore.slug}/dashboard`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink className="h-4 w-4" />
                  Enter Store Dashboard as Superadmin
                </Link>
              </Button>
            </div>

            {/* Store Owner Section */}
            <div className="bg-muted/30 space-y-3 rounded-xl border p-4">
              <h4 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                Store Owner & Team
              </h4>
              {selectedStore.owner ? (
                <div className="space-y-1 text-sm">
                  <div className="text-foreground font-semibold">
                    {selectedStore.owner.name}
                  </div>
                  <div className="text-muted-foreground text-xs">
                    {selectedStore.owner.email}
                  </div>
                  <div className="text-muted-foreground pt-1 text-xs">
                    Team Members:{" "}
                    <span className="text-foreground font-semibold">
                      {selectedStore.membersCount}
                    </span>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground text-xs italic">
                  No owner assigned
                </p>
              )}
            </div>

            {/* Subscription Section */}
            <div className="bg-muted/30 space-y-3 rounded-xl border p-4">
              <h4 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                Plan & Subscription
              </h4>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-muted-foreground">Plan:</span>
                  <p className="text-foreground mt-0.5 font-semibold capitalize">
                    {selectedStore.subscription?.plan ?? "Free Tier"}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Status:</span>
                  <p className="text-foreground mt-0.5 font-semibold capitalize">
                    {selectedStore.subscription?.status ?? "Inactive"}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Renewal Amount:</span>
                  <p className="text-foreground mt-0.5 font-semibold">
                    {selectedStore.subscription?.amount
                      ? formatBDT(selectedStore.subscription.amount)
                      : "৳0"}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">AI Used:</span>
                  <p className="text-foreground mt-0.5 font-semibold">
                    {selectedStore.subscription?.aiConversationsUsed ?? 0} msgs
                  </p>
                </div>
              </div>
            </div>

            {/* Superadmin Overrides Section */}
            <div className="bg-primary/5 border border-primary/20 space-y-3 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <h4 className="text-primary text-xs font-semibold tracking-wider uppercase flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5" />
                  Superadmin Controls
                </h4>
                <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">
                  Staff Only
                </Badge>
              </div>
              <p className="text-muted-foreground text-xs">
                Directly adjust quotas or grant trial extensions for this merchant.
              </p>

              <div className="space-y-2.5 pt-1">
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 flex-1 text-xs"
                    disabled={updateSub.isPending}
                    onClick={() => {
                      updateSub.mutate({
                        businessId: selectedStore.id,
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
                        businessId: selectedStore.id,
                        addExtraConversations: 100,
                      });
                    }}
                  >
                    +100 AI Msgs
                  </Button>
                </div>

                <div className="flex items-center gap-1.5 pt-1">
                  <span className="text-muted-foreground text-xs shrink-0">Plan:</span>
                  {(["starter", "growth", "pro"] as const).map((p) => (
                    <Button
                      key={p}
                      size="sm"
                      variant={selectedStore.subscription?.plan === p ? "default" : "secondary"}
                      className="h-7 px-2 text-[11px] capitalize flex-1"
                      disabled={updateSub.isPending || selectedStore.subscription?.plan === p}
                      onClick={() => {
                        updateSub.mutate({
                          businessId: selectedStore.id,
                          plan: p,
                        });
                      }}
                    >
                      {p}
                    </Button>
                  ))}
                </div>
              </div>
            </div>

            {/* Connected Channels */}
            <div className="bg-muted/30 space-y-3 rounded-xl border p-4">
              <h4 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                Connected Meta Channels
              </h4>
              {selectedStore.metaConnections.length > 0 ? (
                <div className="space-y-2">
                  {selectedStore.metaConnections.map((conn, idx) => (
                    <div
                      key={idx}
                      className="bg-background flex items-center justify-between rounded-lg border px-3 py-2 text-xs"
                    >
                      <div>
                        <span className="text-foreground font-semibold capitalize">
                          {conn.platform.replace("_", " ")}
                        </span>
                        <p className="text-muted-foreground text-[11px]">
                          {conn.facebookPageName ??
                            conn.instagramUsername ??
                            conn.platformAccountName ??
                            "Active"}
                        </p>
                      </div>
                      <Badge
                        variant="outline"
                        className="border-emerald-500/30 text-[10px] text-emerald-500 capitalize"
                      >
                        {conn.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground text-xs italic">
                  No channels connected yet.
                </p>
              )}
            </div>

            {/* Performance Stats */}
            <div className="bg-muted/30 space-y-3 rounded-xl border p-4">
              <h4 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                Store Catalog & Orders
              </h4>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-muted-foreground">Total GMV:</span>
                  <p className="text-foreground mt-0.5 text-base font-bold">
                    {formatBDT(selectedStore.totalGmv)}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Total Orders:</span>
                  <p className="text-foreground mt-0.5 text-base font-bold">
                    {selectedStore.ordersCount}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Products:</span>
                  <p className="text-foreground mt-0.5 font-semibold">
                    {selectedStore.productsCount} catalog items
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Registered:</span>
                  <p className="text-foreground mt-0.5 font-semibold">
                    {formatDate(selectedStore.createdAt)}
                  </p>
                </div>
              </div>
            </div>
          </SheetContent>
        )}
      </Sheet>
    </div>
  );
}
