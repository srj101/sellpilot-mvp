"use client";

import Link from "next/link";
import { MessageSquare, Forward, Activity, Heart, ArrowUpRight } from "lucide-react";

import { Button } from "@acme/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@acme/ui/card";
import { RANGES } from "./analytics-utils";

export function AnalyticsClient({
  range,
  from,
  to,
}: {
  range: string;
  from: string | null;
  to: string | null;
}) {
  // Format currency helper
  const formatCurrency = (val: number) => `৳${Math.round(val).toLocaleString()}`;

  // Weekly inquiries daily counts
  const inquiryDays = [
    { label: "Mon", count: 48 },
    { label: "Tue", count: 52 },
    { label: "Wed", count: 68 },
    { label: "Thu", count: 45 },
    { label: "Fri", count: 72 },
    { label: "Sat", count: 90 },
    { label: "Sun", count: 85 },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground mt-1 text-sm">Detailed performance graphs and metrics for your business.</p>
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
        </div>
      </div>

      {/* Segment 1: Chat Sessions & Orders Line Chart */}
      <Card className="card-hover">
        <CardHeader>
          <CardTitle>Sessions & Orders Performance</CardTitle>
          <CardDescription>Daily breakdown of customer chat interactions and order volumes</CardDescription>
        </CardHeader>
        <CardContent>
          {(() => {
            const chartData = [
              { label: "01 Jul", chats: 120, orders: 40 },
              { label: "02 Jul", chats: 145, orders: 48 },
              { label: "03 Jul", chats: 130, orders: 38 },
              { label: "04 Jul", chats: 165, orders: 55 },
              { label: "05 Jul", chats: 180, orders: 60 },
              { label: "06 Jul", chats: 210, orders: 72 },
              { label: "07 Jul", chats: 195, orders: 65 },
              { label: "08 Jul", chats: 220, orders: 80 },
              { label: "09 Jul", chats: 240, orders: 95 },
              { label: "10 Jul", chats: 215, orders: 82 },
              { label: "11 Jul", chats: 230, orders: 88 },
              { label: "12 Jul", chats: 260, orders: 104 },
            ];

            const maxVal = 300;
            const svgWidth = 1000;
            const svgHeight = 200;

            const points = chartData.map((d, i) => {
              const x = (i / (chartData.length - 1)) * svgWidth;
              const yChats = svgHeight - (d.chats / maxVal) * (svgHeight - 40) - 20;
              const yOrders = svgHeight - (d.orders / maxVal) * (svgHeight - 40) - 20;
              return { x, yChats, yOrders, label: d.label, chats: d.chats, orders: d.orders };
            });

            const chatsPath = `M ${points.map((p) => `${p.x},${p.yChats}`).join(" L ")}`;
            const ordersPath = `M ${points.map((p) => `${p.x},${p.yOrders}`).join(" L ")}`;

            return (
              <div className="relative h-[240px] w-full pt-6">
                <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-[200px] overflow-visible">
                  {/* Grid Lines */}
                  <line x1="0" y1={20} x2={svgWidth} y2={20} stroke="currentColor" className="text-border" strokeOpacity="0.2" strokeDasharray="4 4" />
                  <line x1="0" y1={70} x2={svgWidth} y2={70} stroke="currentColor" className="text-border" strokeOpacity="0.2" strokeDasharray="4 4" />
                  <line x1="0" y1={120} x2={svgWidth} y2={120} stroke="currentColor" className="text-border" strokeOpacity="0.2" strokeDasharray="4 4" />
                  <line x1="0" y1={170} x2={svgWidth} y2={170} stroke="currentColor" className="text-border" strokeOpacity="0.2" strokeDasharray="4 4" />
                  <line x1="0" y1={svgHeight} x2={svgWidth} y2={svgHeight} stroke="currentColor" className="text-border" strokeOpacity="0.4" />

                  {/* Chats Line */}
                  <path
                    d={chatsPath}
                    fill="none"
                    stroke="var(--haze-primary)"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  {/* Orders Line */}
                  <path
                    d={ordersPath}
                    fill="none"
                    stroke="#3b82f6"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />

                  {/* Interactive Dots */}
                  {points.map((p, idx) => (
                    <g key={idx} className="group/dot">
                      <line
                        x1={p.x}
                        y1={10}
                        x2={p.x}
                        y2={svgHeight}
                        stroke="currentColor"
                        className="text-border"
                        strokeOpacity="0"
                        strokeDasharray="2 2"
                      />
                      <circle
                        cx={p.x}
                        cy={p.yChats}
                        r="4"
                        fill="var(--haze-primary)"
                        stroke="#ffffff"
                        strokeWidth="1.5"
                        className="cursor-pointer hover:r-6 transition-all"
                      />
                      <circle
                        cx={p.x}
                        cy={p.yOrders}
                        r="4"
                        fill="#3b82f6"
                        stroke="#ffffff"
                        strokeWidth="1.5"
                        className="cursor-pointer hover:r-6 transition-all"
                      />
                    </g>
                  ))}
                </svg>

                {/* Labels beneath the SVG */}
                <div className="absolute inset-x-0 bottom-0 flex justify-between px-2 text-[10px] text-muted-foreground font-semibold">
                  {chartData.map((d, i) => (
                    <span key={i} className="text-center w-8 truncate">
                      {d.label}
                    </span>
                  ))}
                </div>
              </div>
            );
          })()}
          <div className="mt-4 flex items-center justify-center gap-6 text-xs font-semibold">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-primary" />
              <span>Chat Sessions</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
              <span>Orders Placed</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Segment 2: Cards Section (Recommendations, Follow-ups, Conversion Rate, Product Inquiries Bar Chart) */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {/* Recommendation Sent Count */}
        <Card className="card-hover p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-muted-foreground">Recommendations Sent</p>
            <div className="rounded-xl bg-primary/10 p-2 text-primary">
              <Forward className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-bold tabular-nums text-foreground">1,842</p>
          <p className="mt-1 text-xs text-green-500">+12% from last week</p>
        </Card>

        {/* Follow up Sent Count */}
        <Card className="card-hover p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-muted-foreground">Follow-Ups Sent</p>
            <div className="rounded-xl bg-blue-500/10 p-2 text-blue-500">
              <MessageSquare className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-bold tabular-nums text-foreground">928</p>
          <p className="mt-1 text-xs text-green-500">+8.5% from last week</p>
        </Card>

        {/* Rate of Conversion */}
        <Card className="card-hover p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-muted-foreground">Rate of Conversion</p>
            <div className="rounded-xl bg-violet-500/10 p-2 text-violet-500">
              <Activity className="h-4 w-4" />
            </div>
          </div>
          <p className="mt-3 text-2xl font-bold tabular-nums text-foreground">14.82%</p>
          <p className="mt-1 text-xs text-green-500">+1.2% improvement</p>
        </Card>

        {/* Product Inquiries Bar Chart */}
        <Card className="card-hover p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">Inquiries Last Week</p>
              <div className="rounded-xl bg-pink-500/10 p-2 text-pink-500">
                <Heart className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">470</p>
          </div>
          <div className="h-10 flex items-end gap-1.5 pt-2">
            {inquiryDays.map((d, i) => {
              const heightPct = (d.count / 100) * 100;
              return (
                <div
                  key={i}
                  className="flex-1 bg-pink-500 rounded-t-xs hover:opacity-80 transition-all"
                  style={{ height: `${heightPct}%` }}
                  title={`${d.count} inquiries on ${d.label}`}
                />
              );
            })}
          </div>
        </Card>
      </div>

      {/* Segment 3: Top Selling Products & Customers Per City */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top Selling Products */}
        <Card className="card-hover">
          <CardHeader className="border-b py-4">
            <CardTitle>Top Selling Products</CardTitle>
            <CardDescription>Highest revenue generators in your catalog</CardDescription>
          </CardHeader>
          <CardContent className="py-2">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="py-3 font-medium">Product</th>
                    <th className="py-3 font-medium">Sales Count</th>
                    <th className="py-3 text-right font-medium">Total Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {[
                    { name: "Premium Wireless Headphones", sales: 240, revenue: 192000 },
                    { name: "Ergonomic Office Chair", sales: 120, revenue: 360000 },
                    { name: "Mechanical Gaming Keyboard", sales: 180, revenue: 153000 },
                    { name: "Smart Fitness Watch", sales: 320, revenue: 256000 },
                  ].map((p, idx) => (
                    <tr key={idx}>
                      <td className="py-3 font-medium text-foreground">{p.name}</td>
                      <td className="py-3 text-muted-foreground">{p.sales} sold</td>
                      <td className="py-3 text-right font-bold text-foreground">{formatCurrency(p.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Customer Per City Counts */}
        <Card className="card-hover">
          <CardHeader className="border-b py-4">
            <CardTitle>Customers by City</CardTitle>
            <CardDescription>Distribution of active customer base across cities</CardDescription>
          </CardHeader>
          <CardContent className="py-2">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="py-3 font-medium">City</th>
                    <th className="py-3 font-medium">Progress</th>
                    <th className="py-3 text-right font-medium">Customer Count</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {[
                    { city: "Dhaka", count: 540, pct: 54 },
                    { city: "Chittagong", count: 280, pct: 28 },
                    { city: "Sylhet", count: 120, pct: 12 },
                    { city: "Gazipur", count: 95, pct: 9.5 },
                  ].map((c, idx) => (
                    <tr key={idx}>
                      <td className="py-3 font-medium text-foreground">{c.city}</td>
                      <td className="py-3 w-40">
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className="h-full bg-primary rounded-full" style={{ width: `${c.pct}%` }} />
                        </div>
                      </td>
                      <td className="py-3 text-right font-bold text-foreground">{c.count.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
