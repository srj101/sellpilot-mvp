"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  BrainCircuit,
  Coins,
  Cpu,
  MessageSquare,
  RefreshCw,
  Search,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";

import { Badge } from "@acme/ui/badge";
import { Button } from "@acme/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@acme/ui/card";
import { Skeleton } from "@acme/ui/skeleton";
import { cn } from "@acme/ui";

import { useTRPC } from "~/trpc/react";

function ProgressBar({ value, className, barClassName }: { value: number; className?: string; barClassName?: string }) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-muted", className)}>
      <div className={cn("h-full bg-primary transition-all duration-300", barClassName)} style={{ width: `${pct}%` }} />
    </div>
  );
}

export function AiObservability() {
  const trpc = useTRPC();
  const [search, setSearch] = useState("");

  const aiQuery = useQuery(trpc.superadmin.getAiObservability.queryOptions());
  const data = aiQuery.data;

  const filteredLeaderboard = useMemo(() => {
    if (!data?.leaderboard) return [];
    if (!search.trim()) return data.leaderboard;
    const term = search.toLowerCase();
    return data.leaderboard.filter(
      (s) =>
        s.businessName.toLowerCase().includes(term) ||
        s.businessSlug.toLowerCase().includes(term) ||
        (s.owner?.name.toLowerCase().includes(term) ?? false) ||
        (s.owner?.email.toLowerCase().includes(term) ?? false),
    );
  }, [data?.leaderboard, search]);

  if (aiQuery.isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  const kpis = data?.kpis ?? {
    totalConversationsUsed: 0,
    totalTokens: 0,
    estimatedPromptTokens: 0,
    estimatedCompletionTokens: 0,
    totalEstimatedCostUsd: 0,
    totalEstimatedCostBdt: 0,
    totalAgentSessions: 0,
    activeAiStores: 0,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight">AI Usage & Cost Observability</h2>
            <Badge variant="outline" className="gap-1 border-primary/30 text-primary">
              <Sparkles className="h-3 w-3" />
              Live Telemetry
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Platform-wide LLM token tracking, estimated API cost, and store consumption limits.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 text-xs"
            onClick={() => void aiQuery.refetch()}
            disabled={aiQuery.isFetching}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", aiQuery.isFetching && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Total AI Conversations */}
        <Card className="border-border/60">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              AI Conversations Used
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <MessageSquare className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight">
              {kpis.totalConversationsUsed.toLocaleString()}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Across <span className="font-semibold text-foreground">{kpis.activeAiStores}</span> active stores (
              {kpis.totalAgentSessions} chat sessions)
            </p>
          </CardContent>
        </Card>

        {/* Estimated API Cost */}
        <Card className="border-border/60">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Estimated LLM Cost
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Coins className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
              ${kpis.totalEstimatedCostUsd.toFixed(2)}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Approx. <span className="font-semibold text-foreground">৳{kpis.totalEstimatedCostBdt.toLocaleString()} BDT</span> this billing cycle
            </p>
          </CardContent>
        </Card>

        {/* Total Tokens Consumed */}
        <Card className="border-border/60">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Tokens Consumed
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Cpu className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight">
              {(kpis.totalTokens / 1000).toFixed(1)}k
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {(kpis.estimatedPromptTokens / 1000).toFixed(1)}k input · {(kpis.estimatedCompletionTokens / 1000).toFixed(1)}k output
            </p>
          </CardContent>
        </Card>

        {/* Active AI Stores */}
        <Card className="border-border/60">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Store Adoption Rate
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <BrainCircuit className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight">
              {data?.leaderboard.length
                ? Math.round((kpis.activeAiStores / data.leaderboard.length) * 100)
                : 0}
              %
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {kpis.activeAiStores} of {data?.leaderboard.length ?? 0} registered stores replying via AI
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Workload Breakdown & Safety Banner */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Token Workload Distribution */}
        <Card className="border-border/60 lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">AI Workload & Token Breakdown</CardTitle>
            <CardDescription>
              Distribution of token consumption across conversational, vision, and semantic search models.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {data?.workloadBreakdown.map((item) => (
              <div key={item.label} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-medium">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-primary" />
                    {item.label}
                  </span>
                  <span className="text-muted-foreground">
                    {item.pct}% ({item.tokens.toLocaleString()} tokens)
                  </span>
                </div>
                <ProgressBar value={item.pct} className="h-2" />
              </div>
            ))}

            <div className="mt-4 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">Model Cost Reference:</span> Multi-tenant prompt caching is active. Primary response engine: <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] font-semibold text-primary">{data?.kpis.activeModel ?? "gpt-5.4-mini"}</code> ($0.15/1M in, $0.60/1M out). Vision model: <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] font-semibold text-foreground">gpt-5.4-mini-vision</code>.
            </div>
          </CardContent>
        </Card>

        {/* Global Safety & Emergency Controls */}
        <Card className="border-border/60">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-500" />
              <CardTitle className="text-base font-semibold">AI Safety & Rate Limits</CardTitle>
            </div>
            <CardDescription>Platform guardrails and runaway-loop prevention.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-xs">
            <div className="rounded-lg border border-border/80 p-3 space-y-1">
              <div className="flex items-center justify-between font-medium">
                <span>Per-Store Rate Limit</span>
                <Badge variant="secondary" className="text-[10px]">Active</Badge>
              </div>
              <p className="text-muted-foreground">
                Max 60 automated replies / minute per merchant to prevent runaway loops.
              </p>
            </div>

            <div className="rounded-lg border border-border/80 p-3 space-y-1">
              <div className="flex items-center justify-between font-medium">
                <span>Confidence Fallback</span>
                <Badge variant="secondary" className="text-[10px]">Active</Badge>
              </div>
              <p className="text-muted-foreground">
                Auto-escalates to human agent if model confidence falls below threshold.
              </p>
            </div>

            <div className="rounded-lg border border-border/80 p-3 space-y-1">
              <div className="flex items-center justify-between font-medium">
                <span>Auto Token Budgeting</span>
                <Badge variant="secondary" className="text-[10px]">Active</Badge>
              </div>
              <p className="text-muted-foreground">
                Context window truncated to latest 10 messages to avoid token bloat.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top AI Consumers Leaderboard */}
      <Card className="border-border/60">
        <CardHeader className="flex flex-col gap-3 pb-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base font-semibold">Top AI Consumers Leaderboard</CardTitle>
            <CardDescription>
              Stores ranked by conversation volume, quota consumption, and estimated cost.
            </CardDescription>
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="text-muted-foreground absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search store or owner..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-background border-border placeholder:text-muted-foreground flex h-8 w-full rounded-md border pl-8 pr-3 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/40 text-muted-foreground border-border/60 border-y font-medium">
                <tr>
                  <th className="px-4 py-2.5">Store</th>
                  <th className="px-4 py-2.5">Owner</th>
                  <th className="px-4 py-2.5">Plan</th>
                  <th className="px-4 py-2.5 w-48">AI Quota Consumed</th>
                  <th className="px-4 py-2.5 text-right">Est. Cost (USD)</th>
                  <th className="px-4 py-2.5 text-right">Est. Cost (BDT)</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {filteredLeaderboard.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-muted-foreground p-6 text-center">
                      No stores found matching your query.
                    </td>
                  </tr>
                ) : (
                  filteredLeaderboard.map((store) => (
                    <tr key={store.businessId} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary font-bold text-[11px]">
                            {store.businessName.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-semibold text-foreground">{store.businessName}</p>
                            <p className="font-mono text-[10px] text-muted-foreground">/{store.businessSlug}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {store.owner ? (
                          <div>
                            <p className="font-medium text-foreground">{store.owner.name}</p>
                            <p className="text-[11px] text-muted-foreground">{store.owner.email}</p>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">Unassigned</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="capitalize text-[10px]">
                          {store.plan}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <div className="space-y-1">
                          <div className="flex justify-between text-[11px]">
                            <span className="font-semibold text-foreground">{store.aiConversationsUsed.toLocaleString()}</span>
                            <span className="text-muted-foreground">/ {store.totalQuota.toLocaleString()}</span>
                          </div>
                          <ProgressBar
                            value={store.usagePct}
                            className="h-1.5"
                            barClassName={cn(
                              store.usagePct > 90 ? "bg-rose-500" : store.usagePct > 70 ? "bg-amber-500" : "bg-primary"
                            )}
                          />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-medium text-foreground">
                        ${store.estimatedCostUsd.toFixed(3)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-semibold text-foreground">
                        ৳{store.estimatedCostBdt.toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button asChild size="sm" variant="ghost" className="h-7 px-2 text-xs">
                          <Link href={`/${store.businessSlug}/dashboard`} target="_blank" rel="noopener noreferrer">
                            Enter
                            <ArrowUpRight className="ml-1 h-3 w-3" />
                          </Link>
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
