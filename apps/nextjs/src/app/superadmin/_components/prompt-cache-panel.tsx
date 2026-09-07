"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Gauge, Info, MessageSquareText, Wallet, Zap } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@acme/ui/card";
import { Skeleton } from "@acme/ui/skeleton";
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@acme/ui/table";
// Aliased — recharts already owns the bare "Tooltip" name in this file, for the chart's
// own hover layer.
import {
  Tooltip as UiTooltip,
  TooltipContent as UiTooltipContent,
  TooltipTrigger as UiTooltipTrigger,
} from "@acme/ui/tooltip";

import { useTRPC } from "~/trpc/react";

/**
 * "Is OpenAI's prompt caching actually working" — see docs/CACHING_PLAN.md for the wiring
 * this measures. Every number here comes from platformCostDaily; nothing is estimated.
 */

const PERIODS = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
] as const;

const SOURCE_LABELS: Record<string, string> = {
  dm_reply: "DM replies",
  comment_reply: "Comment replies",
  conversation_followup: "Cart follow-ups",
  weekly_insights: "Weekly insights",
  copilot: "Copilot",
  product_keywords: "Product keywords",
};

/** Which sources can ever cache — the other three sit under OpenAI's 1024-token floor
 * regardless of any key. See docs/CACHING_PLAN.md. */
const ELIGIBLE_SOURCES = new Set(["dm_reply", "copilot", "product_keywords"]);

function formatDay(day: string): string {
  return new Date(day).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const tooltipStyle = {
  borderRadius: 12,
  border: "1px solid var(--border)",
  fontSize: 12,
  background: "var(--card)",
};

function RateBadge({ pct }: { pct: number | null }) {
  if (pct === null) {
    return <span className="text-muted-foreground text-xs">No data yet</span>;
  }
  const tone =
    pct >= 60
      ? "text-emerald-600 dark:text-emerald-400"
      : pct >= 25
        ? "text-amber-600 dark:text-amber-400"
        : "text-muted-foreground";
  return <span className={`font-mono text-sm font-semibold ${tone}`}>{pct}%</span>;
}

export function PromptCachePanel() {
  const [days, setDays] = useState<number>(30);
  const trpc = useTRPC();
  const { data, isLoading } = useQuery(trpc.superadmin.getPromptCacheStats.queryOptions({ days }));

  if (isLoading || !data) {
    return (
      <Card className="border-border/60 p-6">
        <Skeleton className="mb-4 h-5 w-40" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      </Card>
    );
  }

  const { kpis, perSource, series } = data;
  const hasAnyTraffic = kpis.totalCalls > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold">Prompt Cache</h3>
          <p className="text-muted-foreground text-sm">
            Whether OpenAI is actually reusing the static part of the prompt, per source and over time.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {PERIODS.map((p) => (
            <button
              key={p.days}
              type="button"
              onClick={() => setDays(p.days)}
              className={
                "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors " +
                (days === p.days
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-muted")
              }
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {!hasAnyTraffic && (
        <Card className="border-amber-500/30 bg-amber-500/5 p-4">
          <p className="text-sm text-amber-700 dark:text-amber-400">
            No eligible AI calls recorded in this window yet — nothing to measure a cache rate
            against. This fills in once dm_reply, copilot or product_keywords traffic flows
            through the now-live prompt_cache_key wiring.
          </p>
        </Card>
      )}

      {/* KPI row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border/60">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
              Messages cache-hit
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <MessageSquareText className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight">
              {kpis.messageCacheRatePct === null ? "—" : `${kpis.messageCacheRatePct}%`}
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              {kpis.hitCalls.toLocaleString()} of {kpis.totalCalls.toLocaleString()} eligible calls had any cache hit
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
              Tokens served from cache
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Gauge className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight">
              {kpis.tokenCacheRatePct === null ? "—" : `${kpis.tokenCacheRatePct}%`}
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              {kpis.cachedTokens.toLocaleString()} cached of {(kpis.freshTokens + kpis.cachedTokens).toLocaleString()} prompt tokens
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
              Saved by caching
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Wallet className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
              ৳{kpis.savedTaka.toLocaleString()}
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              vs. every cached token costing the fresh-input rate instead
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
              Eligible calls
            </CardTitle>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Zap className="h-4 w-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tracking-tight">{kpis.totalCalls.toLocaleString()}</div>
            <p className="text-muted-foreground mt-1 text-xs">
              from dm_reply, copilot &amp; product_keywords — the only sources with a prompt large enough to cache
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Trend — is the hit rate actually rising since the routing key shipped */}
        <Card className="p-6">
          <h4 className="mb-4 text-sm font-semibold">Token cache-hit rate over time</h4>
          {series.length === 0 ? (
            <p className="text-muted-foreground py-16 text-center text-sm">No data in this range yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={series} margin={{ left: -20, right: 8 }}>
                <defs>
                  <linearGradient id="fill-hitrate" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--econ-cat-1)" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="var(--econ-cat-1)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="day" tickFormatter={formatDay} tickLine={false} axisLine={false} fontSize={11} stroke="var(--muted-foreground)" />
                <YAxis
                  domain={[0, 100]}
                  tickLine={false}
                  axisLine={false}
                  fontSize={11}
                  stroke="var(--muted-foreground)"
                  tickFormatter={(v: number) => `${v}%`}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(d) => formatDay(String(d))}
                  formatter={(value) => [
                    typeof value === "number" ? `${value}%` : "no data",
                    "Cache-hit rate",
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="hitRatePct"
                  name="Cache-hit rate"
                  stroke="var(--econ-cat-1)"
                  fill="url(#fill-hitrate)"
                  strokeWidth={2}
                  connectNulls
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Per-source breakdown — precise numbers across 6 rows read better as a table than
            a chart (dataviz skill: a table communicates exact figures better than a chart
            once every row is individually meaningful, which all 6 sources are here). */}
        <Card className="p-0">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-1.5">
              <CardTitle className="text-sm font-semibold">By source</CardTitle>
              {/* An "i" the reader can actually open, in place of a raw file path — a
                  superadmin looking at their own dashboard has no way to open a file in
                  this repo, so pointing them at one there was a dead end, not a citation. */}
              <UiTooltip>
                <UiTooltipTrigger asChild>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground inline-flex h-4 w-4 items-center justify-center rounded-full"
                    aria-label="Why only three sources"
                  >
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </UiTooltipTrigger>
                <UiTooltipContent side="right" className="max-w-64 text-xs">
                  Comment replies, cart follow-ups and weekly insights never appear here —
                  their messages are only a few hundred tokens, well under OpenAI&apos;s
                  1,024-token minimum for caching to switch on at all. No setting changes
                  that.
                </UiTooltipContent>
              </UiTooltip>
            </div>
            <CardDescription>Only sources large enough to ever cache are shown.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 font-medium hover:bg-muted/40">
                  <TableHead className="px-4 py-2.5">Source</TableHead>
                  <TableHead className="px-4 py-2.5 text-right">Calls</TableHead>
                  <TableHead className="px-4 py-2.5 text-right">Msg. hit rate</TableHead>
                  <TableHead className="px-4 py-2.5 text-right">Token hit rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {perSource.filter((s) => ELIGIBLE_SOURCES.has(s.source)).length === 0 ? (
                  <TableEmpty colSpan={4}>No eligible traffic in this window yet.</TableEmpty>
                ) : (
                  perSource
                    .filter((s) => ELIGIBLE_SOURCES.has(s.source))
                    .map((s) => (
                      <TableRow key={s.source} className="hover:bg-muted/20 transition-colors">
                        <TableCell className="px-4 py-3 font-medium text-foreground">
                          {SOURCE_LABELS[s.source] ?? s.source}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-right font-mono text-xs text-muted-foreground">
                          {s.totalCalls.toLocaleString()}
                        </TableCell>
                        <TableCell className="px-4 py-3 text-right">
                          <RateBadge pct={s.messageCacheRatePct} />
                        </TableCell>
                        <TableCell className="px-4 py-3 text-right">
                          <RateBadge pct={s.tokenCacheRatePct} />
                        </TableCell>
                      </TableRow>
                    ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
