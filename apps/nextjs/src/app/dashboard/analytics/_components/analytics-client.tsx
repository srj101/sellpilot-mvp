"use client";

import Link from "next/link";
import { Eye, Timer, Users } from "lucide-react";

import { Button } from "@acme/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@acme/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@acme/ui/tabs";

import { Sparkline, TrendLine } from "../../(home)/_components/dashboard-widgets";
import { DateRangePicker } from "./date-range-picker";
import type { CategoryRow, CountryRow, DailyPoint, PageViewStats } from "./analytics-types";
import { RANGES, formatDuration } from "./analytics-utils";
import {
  MiniGauge,
  PageViewsChart,
  RevenueByCategoryChart,
  TopCountriesList,
  TopCountriesMap,
} from "./analytics-widgets";

export function AnalyticsClient({
  range,
  from,
  to,
  pageViewStats,
  dailySeries,
  topCountries,
  revenueByCategory,
}: {
  range: string;
  from: string | null;
  to: string | null;
  pageViewStats: PageViewStats;
  dailySeries: DailyPoint[];
  topCountries: CountryRow[];
  revenueByCategory: CategoryRow[];
}) {
  const viewsSeries = dailySeries.map((d) => d.views);
  const uniqueSeries = dailySeries.map((d) => d.uniqueVisitors);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground mt-1 text-base">Track your business performance and key metrics.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border bg-card p-1">
            {RANGES.map((r) => (
              <Link key={r.key} href={`/dashboard/analytics?range=${r.key}`}>
                <Button variant={range === r.key ? "default" : "ghost"} size="sm" className="h-7 px-2.5 text-xs">
                  {r.label}
                </Button>
              </Link>
            ))}
          </div>
          <DateRangePicker from={from} to={to} active={range === "custom"} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Card className="gap-0 py-5">
          <CardContent>
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Page Views</p>
              <div className="rounded-xl bg-emerald-500/10 p-2 text-emerald-600 dark:text-emerald-400">
                <Eye className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">{pageViewStats.total.toLocaleString()}</p>
            <TrendLine pct={pageViewStats.trend} />
            <div className="-mb-2 mt-1">
              <Sparkline id="spark-pageviews" data={viewsSeries} color="var(--chart-1)" height={40} />
            </div>
          </CardContent>
        </Card>

        <Card className="gap-0 py-5">
          <CardContent>
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Unique Visitors</p>
              <div className="rounded-xl bg-blue-500/10 p-2 text-blue-600 dark:text-blue-400">
                <Users className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">
              {pageViewStats.uniqueVisitors.toLocaleString()}
            </p>
            <TrendLine pct={pageViewStats.uniqueVisitorsTrend} />
            <div className="-mb-2 mt-1">
              <Sparkline id="spark-unique" data={uniqueSeries} color="var(--chart-2)" height={40} />
            </div>
          </CardContent>
        </Card>

        <Card className="gap-0 py-5">
          <CardContent>
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Bounce Rate</p>
              <MiniGauge pct={pageViewStats.bounceRate} />
            </div>
            <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">{pageViewStats.bounceRate.toFixed(1)}%</p>
            <TrendLine pct={pageViewStats.bounceRateTrend} />
          </CardContent>
        </Card>

        <Card className="gap-0 py-5">
          <CardContent>
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">Avg. Session</p>
              <div className="rounded-xl bg-amber-500/10 p-2 text-amber-600 dark:text-amber-400">
                <Timer className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">
              {formatDuration(pageViewStats.avgSessionSeconds)}
            </p>
            <TrendLine pct={pageViewStats.avgSessionTrend} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Page Views Over Time</CardTitle>
            <CardDescription>Checkout page traffic trend</CardDescription>
          </CardHeader>
          <CardContent>
            <PageViewsChart data={dailySeries} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Revenue by Category</CardTitle>
            <CardDescription>Distribution across product types</CardDescription>
          </CardHeader>
          <CardContent>
            {revenueByCategory.length > 0 ? (
              <RevenueByCategoryChart categories={revenueByCategory} />
            ) : (
              <p className="py-8 text-center text-sm text-muted-foreground">No categorized sales yet</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Top Countries</CardTitle>
          <CardDescription>Where your customers are shipping to</CardDescription>
        </CardHeader>
        <CardContent>
          {topCountries.length > 0 ? (
            <Tabs defaultValue="list">
              <TabsList>
                <TabsTrigger value="list">List</TabsTrigger>
                <TabsTrigger value="map">Map</TabsTrigger>
              </TabsList>
              <TabsContent value="list" className="mt-4">
                <TopCountriesList countries={topCountries} />
              </TabsContent>
              <TabsContent value="map" className="mt-4">
                <TopCountriesMap countries={topCountries} />
              </TabsContent>
            </Tabs>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">No customer geography yet</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
