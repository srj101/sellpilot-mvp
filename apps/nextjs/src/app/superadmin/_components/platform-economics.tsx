"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, TrendingUp } from "lucide-react";

import { Badge } from "@acme/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@acme/ui/card";
import { Skeleton } from "@acme/ui/skeleton";

import { useTRPC } from "~/trpc/react";

/**
 * "Are we profitable" — the question the rest of this console never answered.
 * getPlatformOverview shows merchant GMV (money that never touches us); this reads
 * platform-cost.ts's ledger against saasInvoice to show OUR revenue, OUR spend, and
 * the margin between them, per store.
 *
 * Colors here are a small validated set kept apart from the app's --chart-1..5
 * tokens — see the comment beside --econ-cat-1 in theme.css. Revenue is always blue
 * and cost is always orange, in every chart on this screen: color follows the
 * entity, never its rank on a given chart.
 */

const PERIODS = [
  { label: "7 days", days: 7 },
  { label: "30 days", days: 30 },
  { label: "90 days", days: 90 },
] as const;

function formatBDT(taka: number, compact = false): string {
  return new Intl.NumberFormat("en-BD", {
    style: "currency",
    currency: "BDT",
    maximumFractionDigits: 0,
    notation: compact ? "compact" : "standard",
  }).format(taka);
}

function formatDay(day: string): string {
  return new Date(day).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const SOURCE_LABELS: Record<string, string> = {
  dm_reply: "DM replies",
  comment_reply: "Comment replies",
  conversation_followup: "Cart follow-ups",
  weekly_insights: "Weekly insights",
  copilot: "Copilot",
  product_keywords: "Product keywords",
  transcription: "Voice transcription",
  media_storage: "Media storage",
  email: "Email",
  saas_billing: "Gateway fees",
  fixed: "Fixed infrastructure",
};

/** Categorical hue in fixed order — never reassigned by value or rank, only by which
 * source a row names, so the same source keeps the same color across renders. */
const SOURCE_COLOR_VARS = [
  "var(--econ-cat-1)",
  "var(--econ-cat-2)",
  "var(--econ-cat-3)",
  "var(--econ-cat-4)",
  "var(--econ-cat-5)",
  "var(--econ-cat-6)",
];
/** Soft cap per the dataviz skill's series-count ladder: past 6-8 categorical slots, fold
 * the tail into "Other" rather than generate a 7th hue nothing can tell apart from the rest. */
const MAX_SOURCE_SLOTS = 6;

const tooltipStyle = {
  borderRadius: 12,
  border: "1px solid var(--border)",
  fontSize: 12,
  background: "var(--card)",
};

function KpiTile({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: string;
  tone?: "good" | "bad";
  icon?: React.ReactNode;
}) {
  return (
    <Card className="border-border/60 shadow-xs">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
          {label}
        </CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div
          className={
            "text-2xl font-bold tracking-tight " +
            (tone === "good" ? "text-emerald-600 dark:text-emerald-400" : tone === "bad" ? "text-rose-600 dark:text-rose-400" : "")
          }
        >
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

export function PlatformEconomics() {
  const [days, setDays] = useState<number>(30);
  const trpc = useTRPC();
  const { data, isLoading } = useQuery(
    trpc.superadmin.getPlatformEconomics.queryOptions({ days }),
  );

  const sourceRows = useMemo(() => {
    if (!data) return [];
    const sorted = [...data.costBySource].sort((a, b) => b.costTaka - a.costTaka);
    const head = sorted.slice(0, MAX_SOURCE_SLOTS - 1);
    const tail = sorted.slice(MAX_SOURCE_SLOTS - 1);
    const rows = head.map((r) => ({ source: r.source, costTaka: r.costTaka }));
    const otherTaka = tail.reduce((sum, r) => sum + r.costTaka, 0);
    if (otherTaka > 0) rows.push({ source: "other", costTaka: otherTaka });
    return rows;
  }, [data]);

  if (isLoading || !data) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="p-6">
              <Skeleton className="mb-2 h-4 w-24" />
              <Skeleton className="h-8 w-20" />
            </Card>
          ))}
        </div>
        <Card className="p-6">
          <Skeleton className="mb-4 h-5 w-40" />
          <Skeleton className="h-64 w-full" />
        </Card>
      </div>
    );
  }

  const { kpis, series, perStore, marginByPlan } = data;
  const noRevenueYet = kpis.revenueTaka === 0 && kpis.costTaka === 0;

  return (
    <div className="space-y-6">
      {/* Filters — one row, above every chart, never per-chart (dataviz skill: interaction.md) */}
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

      {noRevenueYet && (
        <Card className="border-amber-500/30 bg-amber-500/5 p-4">
          <p className="text-sm text-amber-700 dark:text-amber-400">
            No paid invoices or cost events in this window yet. Cost fills in after the
            nightly rollup has run at least once; revenue fills in as subscriptions renew.
          </p>
        </Card>
      )}

      {/* Hero + KPI row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-border/60 from-card to-accent/20 relative overflow-hidden bg-gradient-to-br shadow-xs sm:col-span-2 lg:col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
              Net margin
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={
                "text-3xl font-bold tracking-tight " +
                (kpis.marginTaka >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")
              }
            >
              {formatBDT(kpis.marginTaka)}
            </div>
            {kpis.marginPct !== null && (
              <p className="text-muted-foreground mt-1 text-xs">
                {kpis.marginPct >= 0 ? "+" : ""}
                {kpis.marginPct.toFixed(1)}% of revenue · last {days} days
              </p>
            )}
          </CardContent>
        </Card>

        <KpiTile label="Revenue" value={formatBDT(kpis.revenueTaka, true)} />
        <KpiTile
          label="Platform cost"
          value={formatBDT(kpis.costTaka, true)}
          icon={
            kpis.fixedCostTaka > 0 ? (
              <Badge variant="outline" className="text-[10px]">
                +{formatBDT(kpis.fixedCostTaka, true)} fixed
              </Badge>
            ) : undefined
          }
        />
        <KpiTile
          label="Stores losing money"
          value={String(kpis.losingStoreCount)}
          tone={kpis.losingStoreCount > 0 ? "bad" : "good"}
          icon={
            kpis.losingStoreCount > 0 ? (
              <AlertTriangle className="h-4 w-4 text-rose-500" />
            ) : (
              <TrendingUp className="h-4 w-4 text-emerald-500" />
            )
          }
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Revenue vs cost over time — one axis, both series in taka. Never dual-axis:
            two different-scale measures would be two charts, not one with a second axis. */}
        <Card className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-sm font-semibold">Revenue vs. platform cost</h3>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className="h-2 w-2 rounded-full" style={{ background: "var(--econ-cat-1)" }} />
                Revenue
              </span>
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className="h-2 w-2 rounded-full" style={{ background: "var(--econ-cat-2)" }} />
                Cost
              </span>
            </div>
          </div>
          {series.length === 0 ? (
            <p className="text-muted-foreground py-16 text-center text-sm">No data in this range yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={series} margin={{ left: -20, right: 8 }}>
                <defs>
                  <linearGradient id="fill-revenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--econ-cat-1)" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="var(--econ-cat-1)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="fill-cost" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--econ-cat-2)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="var(--econ-cat-2)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="day"
                  tickFormatter={formatDay}
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
                  tickFormatter={(v: number) => formatBDT(v, true)}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  labelFormatter={(d) => formatDay(String(d))}
                  formatter={(value, name) => [formatBDT(Number(value)), name === "revenueTaka" ? "Revenue" : "Cost"]}
                />
                <Area type="monotone" dataKey="revenueTaka" name="Revenue" stroke="var(--econ-cat-1)" fill="url(#fill-revenue)" strokeWidth={2} />
                <Area type="monotone" dataKey="costTaka" name="Cost" stroke="var(--econ-cat-2)" fill="url(#fill-cost)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>

        {/* Cost by source — ranked bar, categorical (identity: which part of the product
            spent it), folded to "Other" past 6 slots per the series-count ladder. */}
        <Card className="p-6">
          <h3 className="mb-4 text-sm font-semibold">Where the spend goes</h3>
          {sourceRows.length === 0 ? (
            <p className="text-muted-foreground py-16 text-center text-sm">No cost recorded in this range yet</p>
          ) : (
            <ResponsiveContainer width="100%" height={Math.max(sourceRows.length * 44, 160)}>
              <BarChart data={sourceRows} layout="vertical" margin={{ left: 8, right: 24 }}>
                <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis type="number" tickLine={false} axisLine={false} fontSize={11} stroke="var(--muted-foreground)" tickFormatter={(v: number) => formatBDT(v, true)} />
                <YAxis
                  type="category"
                  dataKey="source"
                  tickFormatter={(s: string) => SOURCE_LABELS[s] ?? (s === "other" ? "Other" : s)}
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
                  width={110}
                  stroke="var(--muted-foreground)"
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value) => [formatBDT(Number(value)), "Cost"]}
                  labelFormatter={(s) => SOURCE_LABELS[String(s)] ?? (s === "other" ? "Other" : String(s))}
                />
                <Bar dataKey="costTaka" radius={[0, 6, 6, 0]} barSize={22}>
                  {sourceRows.map((row, i) => (
                    <Cell key={row.source} fill={SOURCE_COLOR_VARS[i % SOURCE_COLOR_VARS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* Profit / loss by store — diverging, centered on ৳0. This is the chart that
          actually answers "where do we lose money" — everything else is context. */}
      <Card className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Margin by store</h3>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2 w-2 rounded-full" style={{ background: "var(--econ-cat-1)" }} />
              Profit
            </span>
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2 w-2 rounded-full" style={{ background: "var(--econ-loss)" }} />
              Loss
            </span>
          </div>
        </div>
        {perStore.length === 0 ? (
          <p className="text-muted-foreground py-16 text-center text-sm">No stores with revenue or cost in this range</p>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(perStore.length * 40, 160)}>
            <BarChart data={perStore} layout="vertical" margin={{ left: 8, right: 24 }}>
              <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis type="number" tickLine={false} axisLine={false} fontSize={11} stroke="var(--muted-foreground)" tickFormatter={(v: number) => formatBDT(v, true)} />
              <YAxis
                type="category"
                dataKey="businessName"
                tickLine={false}
                axisLine={false}
                fontSize={12}
                width={130}
                stroke="var(--muted-foreground)"
              />
              <ReferenceLine x={0} stroke="var(--econ-neutral)" strokeWidth={2} />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value, _name, item) => {
                  const row = item.payload as (typeof perStore)[number];
                  return [
                    formatBDT(Number(value)),
                    `Margin (revenue ${formatBDT(row.revenueTaka)} − cost ${formatBDT(row.costTaka)})`,
                  ];
                }}
                labelFormatter={(name: ReactNode) => name}
              />
              <Bar dataKey="marginTaka" radius={4} barSize={20}>
                {perStore.map((row) => (
                  <Cell
                    key={row.businessId}
                    fill={row.marginTaka >= 0 ? "var(--econ-cat-1)" : "var(--econ-loss)"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* Margin by plan — grouped bar, revenue vs cost per plan. Answers "is Starter
          underpriced?" without making the reader do the subtraction themselves. */}
      <Card className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Revenue vs. cost by plan</h3>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2 w-2 rounded-full" style={{ background: "var(--econ-cat-1)" }} />
              Revenue
            </span>
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2 w-2 rounded-full" style={{ background: "var(--econ-cat-2)" }} />
              Cost
            </span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={marginByPlan} margin={{ left: -20, right: 8 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="plan"
              tickFormatter={capitalize}
              tickLine={false}
              axisLine={false}
              fontSize={12}
              stroke="var(--muted-foreground)"
            />
            <YAxis tickLine={false} axisLine={false} fontSize={11} stroke="var(--muted-foreground)" tickFormatter={(v: number) => formatBDT(v, true)} />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(value, name, item) => {
                const row = item.payload as (typeof marginByPlan)[number];
                return [
                  `${formatBDT(Number(value))} (${row.storeCount} store${row.storeCount === 1 ? "" : "s"})`,
                  name === "revenueTaka" ? "Revenue" : "Cost",
                ];
              }}
              labelFormatter={(p) => capitalize(String(p))}
            />
            <Bar dataKey="revenueTaka" name="Revenue" fill="var(--econ-cat-1)" radius={[6, 6, 0, 0]} barSize={28} />
            <Bar dataKey="costTaka" name="Cost" fill="var(--econ-cat-2)" radius={[6, 6, 0, 0]} barSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}
