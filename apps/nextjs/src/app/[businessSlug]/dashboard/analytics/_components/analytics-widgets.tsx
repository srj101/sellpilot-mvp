import { MapPin } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { cn } from "@acme/ui";

import type { CategoryRow, CountryRow, DailyPoint } from "./analytics-types";
import { COUNTRY_TILE_COLORS, formatCurrency } from "./analytics-utils";

/* ─── Mini radial gauge (for Bounce Rate) ───────────────────────────── */
export function MiniGauge({ pct }: { pct: number }) {
  const clamped = Math.min(Math.max(pct, 0), 100);
  const size = 40;
  const strokeWidth = 5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = (clamped / 100) * circumference;
  return (
    <svg width={size} height={size} className="-rotate-90 shrink-0">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={strokeWidth} className="stroke-muted" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${circumference - dash}`}
        className="stroke-rose-500"
      />
    </svg>
  );
}

export function TopCountriesList({ countries }: { countries: CountryRow[] }) {
  const total = countries.reduce((s, c) => s + c.count, 0) || 1;
  return (
    <div className="space-y-4">
      {countries.map((c) => {
        const pct = Math.round((c.count / total) * 100);
        return (
          <div key={c.country}>
            <div className="mb-1.5 flex items-center justify-between text-sm">
              <span className="font-medium text-foreground">{c.country}</span>
              <span className="text-muted-foreground tabular-nums">
                {c.count} · {pct}%
              </span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary transition-all duration-700" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// A lightweight, dependency-free stand-in for a world map: tiles sized by each
// country's share of customers. No mapping library is installed in this project.
export function TopCountriesMap({ countries }: { countries: CountryRow[] }) {
  const max = Math.max(...countries.map((c) => c.count), 1);
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {countries.map((c, i) => {
        const scale = 0.55 + 0.45 * (c.count / max);
        return (
          <div
            key={c.country}
            className={cn(
              "flex flex-col items-center justify-center gap-1 rounded-xl p-4 text-white",
              COUNTRY_TILE_COLORS[i % COUNTRY_TILE_COLORS.length],
            )}
            style={{ opacity: scale }}
          >
            <MapPin className="h-4 w-4" />
            <span className="text-sm font-semibold">{c.country}</span>
            <span className="text-xs tabular-nums opacity-90">{c.count} customers</span>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Revenue by Category — real horizontal bar chart ───────────────── */
export function RevenueByCategoryChart({ categories }: { categories: CategoryRow[] }) {
  const data = [...categories].reverse(); // recharts vertical bar layout renders bottom-to-top
  return (
    <ResponsiveContainer width="100%" height={Math.max(categories.length * 56, 160)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 8 }}>
        <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="var(--border)" />
        <XAxis
          type="number"
          tickLine={false}
          axisLine={false}
          fontSize={11}
          stroke="var(--muted-foreground)"
          tickFormatter={(v: number) => `৳${Math.round(v / 1000)}k`}
        />
        <YAxis type="category" dataKey="category" tickLine={false} axisLine={false} fontSize={12} width={90} stroke="var(--muted-foreground)" />
        <Tooltip
          formatter={(value) => [formatCurrency(Number(Array.isArray(value) ? value[0] : value) || 0), "Revenue"]}
          contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", fontSize: 12, background: "var(--card)" }}
        />
        <Bar dataKey="revenue" fill="var(--chart-2)" radius={[0, 6, 6, 0]} barSize={22} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/* ─── Page Views Over Time — combo Pageviews + Unique Visitors ──────── */
export function PageViewsChart({ data }: { data: DailyPoint[] }) {
  const allZero = data.every((d) => d.views === 0 && d.uniqueVisitors === 0);
  if (allZero) {
    return <p className="py-16 text-center text-sm text-muted-foreground">No page views in this range yet</p>;
  }
  return (
    <div>
      <div className="mb-2 flex items-center gap-4 text-xs">
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-[var(--chart-1)]" />
          Pageviews
        </span>
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <span className="h-2 w-2 rounded-full bg-[var(--chart-2)]" />
          Unique Visitors
        </span>
      </div>
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={data} margin={{ left: -20, right: 8 }}>
          <defs>
            <linearGradient id="fill-views" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.35} />
              <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="fill-unique" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--chart-2)" stopOpacity={0.3} />
              <stop offset="95%" stopColor="var(--chart-2)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="var(--border)" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} stroke="var(--muted-foreground)" />
          <YAxis tickLine={false} axisLine={false} fontSize={11} stroke="var(--muted-foreground)" />
          <Tooltip
            contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", fontSize: 12, background: "var(--card)" }}
          />
          <Area type="monotone" dataKey="views" name="Pageviews" stroke="var(--chart-1)" fill="url(#fill-views)" strokeWidth={2} />
          <Area
            type="monotone"
            dataKey="uniqueVisitors"
            name="Unique Visitors"
            stroke="var(--chart-2)"
            fill="url(#fill-unique)"
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
