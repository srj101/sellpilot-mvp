import { redirect } from "next/navigation";
import Link from "next/link";
import { TrendingUp, ArrowUpRight, DollarSign, Users, CreditCard, Layers, Activity } from "lucide-react";

import { getSession } from "~/auth/server";
import { DashboardShell } from "../(home)/_components/dashboard-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@acme/ui/card";
import { Button } from "@acme/ui/button";

export default async function SaaSPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // Format currency helper
  const formatCurrency = (val: number) => `৳${Math.round(val).toLocaleString()}`;

  // Static mock SaaS metrics for high-fidelity Haze emulation
  const mrr = 48500 * 120; // in BDT
  const arr = mrr * 12;
  const activeSubs = 1247;
  const churnRate = 2.4;
  const ltv = 45000;
  const cac = 8500;

  return (
    <DashboardShell>
      <div className="space-y-6">
        {/* Welcome SaaS Header / MRR Banner */}
        <div
          className="relative overflow-hidden rounded-2xl p-6 sm:p-8"
          style={{ background: "linear-gradient(135deg, var(--haze-primary-darker), oklch(0.15 0.05 230))" }}
        >
          <div className="relative z-10 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-white/60">Monthly Recurring Revenue (MRR)</p>
              <p className="mt-2 text-4xl font-bold text-white sm:text-5xl">{formatCurrency(mrr)}</p>
              <div className="mt-3 flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-green-500/20 px-2.5 py-1 text-xs font-medium text-green-400">
                  <TrendingUp className="h-3 w-3" /> +৳3,84,000
                </span>
                <span className="text-sm text-white/50">from last month</span>
              </div>
              <Link href="/dashboard/analytics">
                <Button size="sm" className="mt-5 bg-white text-indigo-950 hover:bg-white/90 rounded-lg shadow-sm">
                  View MRR Breakdown
                  <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              </Link>
            </div>
          </div>
          <svg className="absolute inset-0 h-full w-full opacity-[0.03]" width="100%" height="100%">
            <defs>
              <pattern id="saasGrid" width="32" height="32" patternUnits="userSpaceOnUse">
                <path d="M 32 0 L 0 0 0 32" fill="none" stroke="white" stroke-width="1"></path>
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#saasGrid)"></rect>
          </svg>
        </div>

        {/* 4 Stat Cards */}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="card-hover p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">Annual Recurring Revenue</p>
              <div className="rounded-xl bg-primary/10 p-2 text-primary">
                <DollarSign className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-3 text-2xl font-bold tabular-nums text-foreground">{formatCurrency(arr)}</p>
            <p className="mt-1 text-xs text-muted-foreground">MRR extrapolated x 12</p>
          </Card>

          <Card className="card-hover p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">Active Subscriptions</p>
              <div className="rounded-xl bg-blue-500/10 p-2 text-blue-500">
                <Layers className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-3 text-2xl font-bold tabular-nums text-foreground">{activeSubs.toLocaleString()}</p>
            <p className="mt-1 text-xs text-green-500">+4.8% vs last month</p>
          </Card>

          <Card className="card-hover p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">Customer Churn Rate</p>
              <div className="rounded-xl bg-rose-500/10 p-2 text-rose-500">
                <Activity className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-3 text-2xl font-bold tabular-nums text-foreground">{churnRate}%</p>
            <p className="mt-1 text-xs text-green-500">-0.3% improvement</p>
          </Card>

          <Card className="card-hover p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">LTV / CAC Ratio</p>
              <div className="rounded-xl bg-violet-500/10 p-2 text-violet-500">
                <Users className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-3 text-2xl font-bold tabular-nums text-foreground">
              {(ltv / cac).toFixed(1)}x
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              LTV: {formatCurrency(ltv)} | CAC: {formatCurrency(cac)}
            </p>
          </Card>
        </div>

        {/* Subscription Plans & Billing Schedule */}
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="card-hover lg:col-span-2">
            <CardHeader>
              <CardTitle>MRR Growth Performance</CardTitle>
              <CardDescription>Monthly recurring revenue gains over time</CardDescription>
            </CardHeader>
            <CardContent>
              {/* Emulating Chart Space */}
              <div className="h-[240px] flex items-end justify-between gap-2 pt-4">
                {[42, 45, 48, 44, 49, 52, 58, 62, 60, 64, 68, 72].map((h, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-2">
                    <div
                      className="w-full bg-primary rounded-t-sm hover:opacity-80 transition-opacity"
                      style={{ height: `${h * 3}px` }}
                    />
                    <span className="text-[10px] text-muted-foreground font-medium">
                      {["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][i]}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="card-hover">
            <CardHeader>
              <CardTitle>Plans Breakdown</CardTitle>
              <CardDescription>Distribution of subscribers per tier</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex justify-between text-sm font-medium mb-1.5">
                  <span>Starter (৳2,500/mo)</span>
                  <span className="text-muted-foreground">420 users (34%)</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-blue-500 rounded-full" style={{ width: "34%" }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-sm font-medium mb-1.5">
                  <span>Professional (৳7,500/mo)</span>
                  <span className="text-muted-foreground">648 users (52%)</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-primary rounded-full" style={{ width: "52%" }} />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-sm font-medium mb-1.5">
                  <span>Enterprise (৳25,000/mo)</span>
                  <span className="text-muted-foreground">179 users (14%)</span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-violet-500 rounded-full" style={{ width: "14%" }} />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Subscription logs / transactions */}
        <Card className="card-hover">
          <CardHeader className="border-b py-4">
            <CardTitle>Recent Subscriptions</CardTitle>
            <CardDescription>Latest plan upgrades and activations</CardDescription>
          </CardHeader>
          <CardContent className="py-2">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="py-3 font-medium">Customer</th>
                    <th className="py-3 font-medium">Plan</th>
                    <th className="py-3 font-medium">Billing Period</th>
                    <th className="py-3 font-medium">Status</th>
                    <th className="py-3 text-right font-medium">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {[
                    { name: "John Doe", email: "john@example.com", plan: "Professional", period: "Monthly", status: "Active", amount: 7500 },
                    { name: "Sarah Smith", email: "sarah@corp.com", plan: "Enterprise", period: "Annual", status: "Active", amount: 250000 },
                    { name: "David Miller", email: "david@mill.io", plan: "Starter", period: "Monthly", status: "Active", amount: 2500 },
                    { name: "Emily Green", email: "emily@green.net", plan: "Professional", period: "Monthly", status: "Cancelled", amount: 7500 },
                  ].map((s, idx) => (
                    <tr key={idx}>
                      <td className="py-3">
                        <div>
                          <p className="font-medium text-foreground">{s.name}</p>
                          <p className="text-xs text-muted-foreground">{s.email}</p>
                        </div>
                      </td>
                      <td className="py-3 text-muted-foreground">{s.plan}</td>
                      <td className="py-3 text-muted-foreground">{s.period}</td>
                      <td className="py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                          s.status === "Active" ? "bg-green-500/10 text-green-500" : "bg-rose-500/10 text-rose-500"
                        }`}>
                          {s.status}
                        </span>
                      </td>
                      <td className="py-3 text-right font-bold text-foreground">{formatCurrency(s.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardShell>
  );
}
