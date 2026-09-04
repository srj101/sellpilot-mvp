"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  CheckCircle2,
  ExternalLink,
  MessageCircle,
  Radio,
  RefreshCw,
  Search,
  Share2,
  XCircle,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { Badge } from "@acme/ui/badge";
import { Button } from "@acme/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@acme/ui/card";
import { Skeleton } from "@acme/ui/skeleton";
import { cn } from "@acme/ui";

import { useTRPC } from "~/trpc/react";

export function ChannelHealth() {
  const trpc = useTRPC();
  const [search, setSearch] = useState("");
  const [platformFilter, setPlatformFilter] = useState<string>("all");

  const channelQuery = useQuery(trpc.superadmin.getChannelHealth.queryOptions());
  const data = channelQuery.data;

  const filteredConnections = useMemo(() => {
    if (!data?.connections) return [];
    return data.connections.filter((conn) => {
      if (platformFilter !== "all" && conn.platform !== platformFilter) return false;
      if (!search.trim()) return true;
      const term = search.toLowerCase();
      return (
        conn.businessName.toLowerCase().includes(term) ||
        conn.businessSlug.toLowerCase().includes(term) ||
        (conn.platformAccountName?.toLowerCase().includes(term) ?? false) ||
        (conn.facebookPageName?.toLowerCase().includes(term) ?? false) ||
        (conn.instagramUsername?.toLowerCase().includes(term) ?? false)
      );
    });
  }, [data?.connections, platformFilter, search]);

  if (channelQuery.isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  const counts = data?.counts ?? {
    total: 0,
    active: 0,
    degraded: 0,
    whatsapp: 0,
    facebook: 0,
    instagram: 0,
    eventsLast24h: 0,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight">Meta Channel & Webhook Health</h2>
            <Badge variant="outline" className="gap-1 border-primary/30 text-primary">
              <Radio className="h-3 w-3" />
              Connected Nodes
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Monitor real-time WhatsApp Cloud API, Messenger, and Instagram webhook integrations.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-xs"
            onClick={() => void channelQuery.refetch()}
            disabled={channelQuery.isFetching}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", channelQuery.isFetching && "animate-spin")} />
            Sync Channels
          </Button>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total Connected */}
        <Card className="border-border/60">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Total Integrations
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Share2 className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight">{counts.total}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              <span className="font-semibold text-emerald-500">{counts.active} active</span> ·{" "}
              <span className={counts.degraded > 0 ? "text-rose-500 font-semibold" : ""}>
                {counts.degraded} degraded
              </span>
            </p>
          </CardContent>
        </Card>

        {/* WhatsApp Business */}
        <Card className="border-border/60">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              WhatsApp Cloud API
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-green-500/10 text-green-600 dark:text-green-400">
              <MessageCircle className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight">{counts.whatsapp}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              Registered business phone numbers
            </p>
          </CardContent>
        </Card>

        {/* Facebook & Instagram */}
        <Card className="border-border/60">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Social Pages & DMs
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Share2 className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight">
              {counts.facebook + counts.instagram}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {counts.facebook} Facebook Pages · {counts.instagram} Instagram profiles
            </p>
          </CardContent>
        </Card>

        {/* 24h Webhook Throughput */}
        <Card className="border-border/60">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              24h Webhook Volume
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <Radio className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight">
              {counts.eventsLast24h.toLocaleString()}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Ingested webhook payloads in the last 24 hours
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Connected Channels Table */}
      <Card className="border-border/60">
        <CardHeader className="flex flex-col gap-3 pb-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base font-semibold">Active Channels Directory</CardTitle>
            <CardDescription>
              All linked communication channels and their real-time webhook status.
            </CardDescription>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {/* Filter */}
            <div className="flex items-center gap-1 rounded-lg border bg-muted/30 p-0.5 text-xs">
              {["all", "whatsapp", "facebook_page", "instagram"].map((filter) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setPlatformFilter(filter)}
                  className={cn(
                    "rounded-md px-2.5 py-1 font-medium capitalize transition-colors",
                    platformFilter === filter
                      ? "bg-background text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {filter === "all" ? "All" : filter === "facebook_page" ? "FB" : filter}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative w-full sm:w-56">
              <Search className="text-muted-foreground absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search store or handle..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-background border-border placeholder:text-muted-foreground flex h-8 w-full rounded-md border pl-8 pr-3 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/40 text-muted-foreground border-border/60 border-y font-medium">
                <tr>
                  <th className="px-4 py-2.5">Platform</th>
                  <th className="px-4 py-2.5">Store</th>
                  <th className="px-4 py-2.5">Connected Identity</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Last Synced</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredConnections.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-muted-foreground p-6 text-center">
                      No connected channels found matching your criteria.
                    </td>
                  </tr>
                ) : (
                  filteredConnections.map((conn) => {
                    const isWa = conn.platform === "whatsapp";
                    const isFb = conn.platform === "facebook_page";
                    const isIg = conn.platform === "instagram";

                    const displayName =
                      conn.facebookPageName ||
                      conn.instagramUsername ||
                      conn.platformAccountName ||
                      "Connected Account";

                    return (
                      <tr key={conn.id} className="hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                "flex h-6 w-6 items-center justify-center rounded-md font-bold text-[10px]",
                                isWa
                                  ? "bg-green-500/10 text-green-600 dark:text-green-400"
                                  : isFb
                                    ? "bg-blue-500/10 text-blue-600 dark:text-blue-400"
                                    : "bg-pink-500/10 text-pink-600 dark:text-pink-400"
                              )}
                            >
                              {isWa ? "WA" : isFb ? "FB" : "IG"}
                            </span>
                            <span className="font-medium capitalize text-foreground">
                              {isWa ? "WhatsApp" : isFb ? "Facebook Page" : "Instagram"}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div>
                            <p className="font-semibold text-foreground">{conn.businessName}</p>
                            <p className="font-mono text-[10px] text-muted-foreground">/{conn.businessSlug}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className="font-medium text-foreground">{displayName}</span>
                        </td>
                        <td className="px-4 py-3">
                          <Badge
                            variant={conn.status === "active" ? "outline" : "destructive"}
                            className={cn(
                              "gap-1 text-[10px] capitalize",
                              conn.status === "active" && "border-emerald-500/30 text-emerald-600 dark:text-emerald-400"
                            )}
                          >
                            {conn.status === "active" ? (
                              <CheckCircle2 className="h-3 w-3" />
                            ) : (
                              <XCircle className="h-3 w-3" />
                            )}
                            {conn.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground font-mono text-[11px]">
                          {new Date(conn.updatedAt).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs">
                            <Link
                              href={`/${conn.businessSlug}/dashboard/integrations`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              Manage
                              <ArrowUpRight className="ml-1 h-3 w-3" />
                            </Link>
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
