"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, Search, X } from "lucide-react";

import { cn } from "@acme/ui";
import { Badge } from "@acme/ui/badge";
import { Button } from "@acme/ui/button";
import { Card, CardContent } from "@acme/ui/card";
import { Input } from "@acme/ui/input";
import { Skeleton } from "@acme/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
} from "@acme/ui/table";

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

export function StoresDirectory() {
  const trpc = useTRPC();
  const { data: stores, isLoading } = useQuery(
    trpc.superadmin.listStores.queryOptions(),
  );
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState<string>("all");

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
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 text-muted-foreground hover:bg-muted/40 text-xs font-semibold tracking-wider uppercase">
                  <TableHead className="px-5 py-3.5">Store</TableHead>
                  <TableHead className="px-5 py-3.5">Owner</TableHead>
                  <TableHead className="px-5 py-3.5">Channels</TableHead>
                  <TableHead className="px-5 py-3.5">Products</TableHead>
                  <TableHead className="px-5 py-3.5">Orders & GMV</TableHead>
                  <TableHead className="px-5 py-3.5">Plan</TableHead>
                  <TableHead className="px-5 py-3.5">Created</TableHead>
                  <TableHead className="px-5 py-3.5 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y text-xs">
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
                      <TableRow
                        key={store.id}
                        className="hover:bg-muted/30 group transition-colors"
                      >
                        {/* Store Info */}
                        <TableCell className="px-5 py-3.5">
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
                        </TableCell>

                        {/* Owner */}
                        <TableCell className="px-5 py-3.5">
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
                        </TableCell>

                        {/* Channels */}
                        <TableCell className="px-5 py-3.5">
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
                        </TableCell>

                        {/* Products */}
                        <TableCell className="text-foreground px-5 py-3.5 font-medium">
                          {store.productsCount} items
                        </TableCell>

                        {/* Orders & GMV */}
                        <TableCell className="px-5 py-3.5">
                          <div className="text-foreground font-semibold">
                            {formatBDT(store.totalGmv)}
                          </div>
                          <div className="text-muted-foreground text-[11px]">
                            {store.ordersCount} orders
                          </div>
                        </TableCell>

                        {/* Plan */}
                        <TableCell className="px-5 py-3.5">
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
                        </TableCell>

                        {/* Created Date */}
                        <TableCell className="text-muted-foreground px-5 py-3.5 whitespace-nowrap">
                          {formatDate(store.createdAt)}
                        </TableCell>

                        {/* Actions */}
                        <TableCell className="px-5 py-3.5 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              asChild
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-xs"
                            >
                              <Link href={`/superadmin/stores/${store.id}`}>
                                Details
                              </Link>
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
                        </TableCell>
                      </TableRow>
                    );
                  })
                ) : (
                  <TableEmpty colSpan={8}>
                    No stores found matching your criteria.
                  </TableEmpty>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
