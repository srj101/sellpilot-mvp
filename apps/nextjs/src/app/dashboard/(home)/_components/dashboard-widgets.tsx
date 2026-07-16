"use client";

import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { CardDescription, CardTitle } from "@acme/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@acme/ui/tabs";
import { cn } from "@acme/ui";

import type { ActivityEvent } from "./dashboard-types";
import { formatCurrency, relativeTime } from "./dashboard-utils";

/* ─── Compact trend badge (icon + % only, no caption) ──────────────── */
export function CompactTrend({ pct }: { pct: number | null }) {
  if (pct === null) return null;
  const isUp = pct >= 0;
  const Icon = isUp ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 text-xs font-semibold tabular-nums",
        isUp ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400",
      )}
    >
      <Icon className="h-3 w-3" />
      {isUp ? "+" : "-"}
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

/* ─── Trend line ("+12.5% vs last month") ──────────────────────────── */
export function TrendLine({ pct }: { pct: number | null }) {
  if (pct === null) return null;
  const isUp = pct >= 0;
  const Icon = isUp ? ArrowUpRight : ArrowDownRight;
  return (
    <p className="mt-1 flex items-center gap-1 text-xs">
      <span
        className={cn(
          "inline-flex items-center gap-0.5 font-semibold tabular-nums",
          isUp ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400",
        )}
      >
        <Icon className="h-3 w-3" />
        {isUp ? "+" : "-"}
        {Math.abs(pct).toFixed(1)}%
      </span>
      <span className="text-muted-foreground">vs last month</span>
    </p>
  );
}

/* ─── Generic mini sparkline (no axes/grid) ────────────────────────── */
export function Sparkline({ id, data, color, height = 56 }: { id: string; data: number[]; color: string; height?: number }) {
  const chartData = data.map((v, i) => ({ i, v }));
  if (data.every((v) => v === 0)) {
    return (
      <div className="flex items-center justify-center text-xs text-muted-foreground" style={{ height }}>
        No data yet
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={chartData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.35} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill={`url(#${id})`} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

/* ─── Monthly goal ring ─────────────────────────────────────────────── */
export function GoalRing({ current, target }: { current: number; target: number }) {
  const realPct = target > 0 ? (current / target) * 100 : 0;
  const clampedPct = Math.min(Math.max(realPct, 0), 100);
  const size = 120;
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (clampedPct / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2 py-2">
      <div className="relative">
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={strokeWidth} className="stroke-muted" />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${circumference - dash}`}
            className="stroke-primary transition-all duration-700"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-2xl font-bold tabular-nums text-foreground">{realPct.toFixed(0)}%</span>
        </div>
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold text-foreground">Monthly Goal</p>
        <p className="text-xs text-muted-foreground">
          {formatCurrency(current)} of {formatCurrency(target)} target
        </p>
      </div>
    </div>
  );
}

/* ─── Weekday mini bar chart (Orders card) ─────────────────────────── */
export function WeekdayBarChart({ data, color }: { data: { label: string; value: number }[]; color: string }) {
  if (data.every((d) => d.value === 0)) {
    return (
      <div className="flex h-[110px] items-center justify-center text-xs text-muted-foreground">
        No orders in the last 7 days
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={110}>
      <BarChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
        <Bar dataKey="value" radius={[6, 6, 0, 0]} fill={color} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={10} stroke="var(--muted-foreground)" />
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ─── Segment legend (dot + label, no counts — mirrors reference) ──── */
export function SegmentLegend({ segments }: { segments: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5">
      {segments.map((s) => (
        <span key={s.label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className={cn("h-2 w-2 rounded-full", s.color)} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

/* ─── Conversion funnel (stages + pairwise conversion footer) ─────── */
export function ConversionFunnel({ stages }: { stages: { label: string; value: number }[] }) {
  const max = Math.max(...stages.map((s) => s.value), 1);
  const overallRate = stages[0]?.value ? ((stages[stages.length - 1]?.value ?? 0) / stages[0].value) * 100 : 0;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-2xl font-bold tabular-nums text-foreground">{overallRate.toFixed(2)}%</p>
        <p className="text-xs text-muted-foreground">Overall conversion rate</p>
      </div>

      <div className="space-y-4">
        {stages.map((s) => {
          const widthPct = (s.value / max) * 100;
          return (
            <div key={s.label}>
              <div className="mb-1.5 flex items-center justify-between text-sm">
                <span className="font-medium text-foreground">{s.label}</span>
                <span className="text-muted-foreground tabular-nums">{s.value.toLocaleString()}</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-700"
                  style={{ width: `${Math.max(widthPct, 3)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-3 gap-2 border-t pt-4">
        {stages.slice(1).map((s, i) => {
          const prev = stages[i];
          const pct = prev && prev.value > 0 ? (s.value / prev.value) * 100 : 0;
          return (
            <div key={s.label} className="text-center">
              <p className="flex h-7 items-center justify-center text-[10px] leading-tight text-muted-foreground">
                {prev?.label} → {s.label}
              </p>
              <p className="text-sm font-bold tabular-nums text-primary">{pct.toFixed(0)}%</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Donut + legend (Traffic Sources) ─────────────────────────────── */
export function DonutWithLegend({
  segments,
  centerLabel,
}: {
  segments: { label: string; value: number; stroke: string; dot: string }[];
  centerLabel: string;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  if (total === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">No traffic yet</p>;
  }
  const size = 128;
  const sw = 18;
  const r = (size - sw) / 2;
  const circ = 2 * Math.PI * r;

  // Pre-compute each arc's dash/offset with a plain loop, instead of mutating a running total inside the render map.
  const arcs: { seg: (typeof segments)[number]; dash: number; offset: number }[] = [];
  let cumulativePct = 0;
  for (const seg of segments) {
    const pct = seg.value / total;
    arcs.push({ seg, dash: pct * circ, offset: -cumulativePct * circ });
    cumulativePct += pct;
  }

  return (
    <div className="flex items-center gap-6">
      <div className="relative shrink-0">
        <svg width={size} height={size} className="-rotate-90">
          {arcs.map(({ seg, dash, offset }) => (
            <circle
              key={seg.label}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              strokeWidth={sw}
              className={seg.stroke}
              strokeDasharray={`${dash} ${circ - dash}`}
              strokeDashoffset={offset}
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-base font-bold tabular-nums text-foreground">{total.toLocaleString()}</p>
          <p className="text-[10px] text-muted-foreground">{centerLabel}</p>
        </div>
      </div>
      <div className="flex-1 space-y-2.5">
        {segments.map((seg) => {
          const pct = Math.round((seg.value / total) * 100);
          return (
            <div key={seg.label} className="flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 text-muted-foreground">
                <span className={cn("h-2.5 w-2.5 rounded-full", seg.dot)} />
                {seg.label}
              </span>
              <span className="font-semibold tabular-nums text-foreground">{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─── Goal progress bar (Monthly Goals panel) ──────────────────────── */
export function GoalBar({
  label,
  current,
  target,
  color,
  format = formatCurrency,
}: {
  label: string;
  current: number;
  target: number;
  color: string;
  format?: (n: number) => string;
}) {
  const realPct = target > 0 ? (current / target) * 100 : 0;
  const pct = Math.min(Math.max(realPct, 0), 100);
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <span className="font-medium text-foreground">{label}</span>
        <span className="font-semibold tabular-nums text-foreground">{realPct.toFixed(0)}%</span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full transition-all duration-700", color)} style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{format(current)}</span>
        <span>Target: {format(target)}</span>
      </div>
    </div>
  );
}

/* ─── Recent activity timeline ─────────────────────────────────────── */
export function ActivityTimeline({ events, now }: { events: ActivityEvent[]; now: number }) {
  if (events.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">No activity yet</p>;
  }
  return (
    <ul className="space-y-5">
      {events.map((e) => {
        const Icon = e.icon;
        return (
          <li key={e.id} className="flex items-start gap-3">
            <span className={cn("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2", e.color)}>
              <Icon className="h-3 w-3" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm text-foreground">{e.title}</p>
              <p className="text-xs text-muted-foreground">{relativeTime(e.time, now)}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/* ─── Revenue / Orders / Profit tabbed area chart (yearly) ─────────── */
const CHART_TABS = [
  { key: "revenue", label: "Revenue", color: "var(--chart-1)" },
  { key: "orders", label: "Orders", color: "var(--chart-2)" },
  { key: "profit", label: "Profit", color: "var(--chart-3)" },
] as const;

export function OverviewChart({ data }: { data: { label: string; revenue: number; orders: number; profit: number }[] }) {
  return (
    <Tabs defaultValue="revenue">
      <div className="flex items-center justify-between">
        <div>
          <CardTitle>Overview</CardTitle>
          <CardDescription>Monthly performance for the current year</CardDescription>
        </div>
        <TabsList>
          {CHART_TABS.map((t) => (
            <TabsTrigger key={t.key} value={t.key}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {CHART_TABS.map((t) => (
        <TabsContent key={t.key} value={t.key} className="mt-4">
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={data} margin={{ left: -20, right: 8 }}>
              <defs>
                <linearGradient id={`fill-${t.key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={t.color} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={t.color} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} stroke="var(--muted-foreground)" />
              <YAxis
                tickLine={false}
                axisLine={false}
                fontSize={11}
                stroke="var(--muted-foreground)"
                tickFormatter={(v: number) => (t.key === "orders" ? String(v) : `${Math.round(v / 1000)}k`)}
              />
              <Tooltip
                formatter={(value) => {
                  const n = Number(Array.isArray(value) ? value[0] : value) || 0;
                  return [t.key === "orders" ? n : formatCurrency(n), t.label];
                }}
                contentStyle={{
                  borderRadius: 12,
                  border: "1px solid var(--border)",
                  fontSize: 12,
                  background: "var(--card)",
                }}
              />
              <Area type="monotone" dataKey={t.key} stroke={t.color} fill={`url(#fill-${t.key})`} strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </TabsContent>
      ))}
    </Tabs>
  );
}
