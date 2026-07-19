import { redirect } from "next/navigation";
import Link from "next/link";
import { ShoppingBag, TrendingUp, Sparkles, AlertTriangle, ArrowUpRight, DollarSign, Percent, Gift } from "lucide-react";

import { getSession } from "~/auth/server";
import { DashboardShell } from "../(home)/_components/dashboard-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@acme/ui/card";
import { Button } from "@acme/ui/button";

export default async function EcommercePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // Format currency helper
  const formatCurrency = (val: number) => `৳${Math.round(val).toLocaleString()}`;

  // eCommerce mock values
  const totalSales = 1245000;
  const totalOrders = 345;
  const aov = totalSales / totalOrders;
  const conversionRate = 3.25;

  return (
    <DashboardShell>
      <div className="space-y-6">
        {/* Header Banner */}
        <div
          className="relative overflow-hidden rounded-2xl p-6 sm:p-8"
          style={{ background: "linear-gradient(135deg, var(--haze-primary-darker), oklch(0.15 0.05 230))" }}
        >
          <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-white/60">eCommerce Revenue Overview</p>
              <h1 className="text-3xl font-bold text-white sm:text-4xl">{formatCurrency(totalSales)}</h1>
              <p className="mt-2 text-xs text-white/50">
                Performance metrics for active stores linked to SellPilot
              </p>
            </div>
            <Link href="/dashboard/products">
              <Button size="sm" className="bg-white text-indigo-950 hover:bg-white/90 rounded-lg shadow-sm">
                Manage Products
                <ArrowUpRight className="ml-1 h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
          <svg className="absolute inset-0 h-full w-full opacity-10 pointer-events-none" preserveAspectRatio="none" viewBox="0 0 1200 200">
            <path d="M0,80 C300,150 600,20 900,100 C1050,140 1150,60 1200,80 L1200,200 L0,200 Z" fill="white"></path>
            <path d="M0,120 C200,60 500,160 800,90 C1000,50 1100,120 1200,100 L1200,200 L0,200 Z" fill="white" opacity="0.5"></path>
          </svg>
        </div>

        {/* eCommerce stat cards */}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="card-hover p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">Total Sales</p>
              <div className="rounded-xl bg-primary/10 p-2 text-primary">
                <DollarSign className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-3 text-2xl font-bold tabular-nums text-foreground">{formatCurrency(totalSales)}</p>
            <p className="mt-1 text-xs text-green-500">+12% vs last month</p>
          </Card>

          <Card className="card-hover p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">Total Orders</p>
              <div className="rounded-xl bg-blue-500/10 p-2 text-blue-500">
                <ShoppingBag className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-3 text-2xl font-bold tabular-nums text-foreground">{totalOrders.toLocaleString()}</p>
            <p className="mt-1 text-xs text-green-500">+8.5% vs last month</p>
          </Card>

          <Card className="card-hover p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">Average Order Value (AOV)</p>
              <div className="rounded-xl bg-amber-500/10 p-2 text-amber-500">
                <Percent className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-3 text-2xl font-bold tabular-nums text-foreground">{formatCurrency(aov)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Average basket value</p>
          </Card>

          <Card className="card-hover p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">Conversion Rate</p>
              <div className="rounded-xl bg-pink-500/10 p-2 text-pink-500">
                <TrendingUp className="h-4 w-4" />
              </div>
            </div>
            <p className="mt-3 text-2xl font-bold tabular-nums text-foreground">{conversionRate}%</p>
            <p className="mt-1 text-xs text-green-500">+0.4% from last period</p>
          </Card>
        </div>

        {/* Sales Performance Chart & Inventory status */}
        <div className="grid gap-6 lg:grid-cols-3">
          <Card className="card-hover lg:col-span-2">
            <CardHeader>
              <CardTitle>Sales Over Time</CardTitle>
              <CardDescription>Daily sales volume and checkout counts</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[220px] flex items-end justify-between gap-3 pt-4">
                {[120, 140, 110, 160, 150, 180, 200, 190, 210, 230, 220, 250].map((h, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
                    <div
                      className="w-full bg-primary rounded-t-xs hover:opacity-80 transition-all"
                      style={{ height: `${h * 0.7}px` }}
                    />
                    <span className="text-[9px] text-muted-foreground font-semibold">
                      {["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"][i]}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Inventory / Low stock alerts */}
          <Card className="card-hover">
            <CardHeader>
              <CardTitle>Inventory Status</CardTitle>
              <CardDescription>Low stock alerts and restock status</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { name: "Premium Wireless Headphones", stock: 4, status: "Low Stock" },
                { name: "Ergonomic Office Chair", stock: 0, status: "Out of Stock" },
                { name: "Mechanical Gaming Keyboard", stock: 8, status: "Low Stock" },
              ].map((item, idx) => (
                <div key={idx} className="flex items-center justify-between border-b pb-2 last:border-0 last:pb-0">
                  <div className="min-w-0 flex-1 pr-2">
                    <p className="truncate text-xs font-semibold text-foreground">{item.name}</p>
                    <p className="text-[10px] text-muted-foreground">{item.stock} items left in stock</p>
                  </div>
                  <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold ${
                    item.stock === 0 ? "bg-rose-500/10 text-rose-500" : "bg-amber-500/10 text-amber-500"
                  }`}>
                    <AlertTriangle className="h-3 w-3" />
                    {item.status}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Promo Codes & Offers performance */}
        <Card className="card-hover">
          <CardHeader className="border-b py-4">
            <CardTitle>Promo Code Performance</CardTitle>
            <CardDescription>Coupon usages and order counts</CardDescription>
          </CardHeader>
          <CardContent className="py-2">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="py-3 font-medium">Coupon Code</th>
                    <th className="py-3 font-medium">Usages</th>
                    <th className="py-3 font-medium">Discount Type</th>
                    <th className="py-3 text-right font-medium">Total Discounted</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {[
                    { code: "WELCOME10", usages: 140, type: "10% Off", discount: 34500 },
                    { code: "EID2026", usages: 85, type: "Fixed ৳500 Off", discount: 42500 },
                    { code: "FREESHIP", usages: 198, type: "Free Delivery", discount: 19800 },
                  ].map((c, idx) => (
                    <tr key={idx}>
                      <td className="py-3">
                        <span className="font-mono bg-muted text-foreground px-2 py-0.5 rounded text-xs border">
                          {c.code}
                        </span>
                      </td>
                      <td className="py-3 text-muted-foreground">{c.usages} times used</td>
                      <td className="py-3 text-muted-foreground">{c.type}</td>
                      <td className="py-3 text-right font-bold text-foreground">{formatCurrency(c.discount)}</td>
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
