import { redirect } from "next/navigation";
import Link from "next/link";
import { CreditCard, ArrowUpRight, Plus, Download, ShieldCheck } from "lucide-react";

import { getSession } from "~/auth/server";
import { DashboardShell } from "../(home)/_components/dashboard-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@acme/ui/card";
import { Button } from "@acme/ui/button";

export default async function BillingPage({ params }: { params: Promise<{ storeSlug: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { storeSlug } = await params;

  // Format currency helper
  const formatCurrency = (val: number) => `৳${Math.round(val).toLocaleString()}`;

  return (
    <DashboardShell>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Billing & Subscriptions</h1>
          <p className="text-muted-foreground mt-1 text-sm">Manage your billing plans, invoices, and credit card details.</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Current subscription tier details */}
          <Card className="card-hover lg:col-span-2">
            <CardHeader>
              <CardTitle>Current Plan</CardTitle>
              <CardDescription>Details of your active subscription plan</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-start justify-between border-b pb-4">
                <div>
                  <h3 className="text-lg font-bold text-foreground">Professional Plan</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Automated channels, advanced AI workflows, custom agents.</p>
                </div>
                <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-500">
                  Active
                </span>
              </div>

              <div className="grid gap-6 md:grid-cols-3">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Billing Frequency</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">Monthly</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Subscription Cost</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">{formatCurrency(7500)} / mo</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Next Billing Date</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">August 19, 2026</p>
                </div>
              </div>

              <div className="flex items-center gap-3 pt-4">
                <Link href={`/${storeSlug}/dashboard/pricing`}>
                  <Button size="sm" className="rounded-lg shadow-sm">
                    Upgrade Plan
                    <ArrowUpRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Button size="sm" variant="outline" className="rounded-lg text-rose-500 hover:bg-rose-500/5 hover:text-rose-600">
                  Cancel Subscription
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Payment Methods */}
          <Card className="card-hover">
            <CardHeader>
              <CardTitle>Payment Methods</CardTitle>
              <CardDescription>Primary payment option for billing renewals</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Primary Visa Card */}
              <div className="flex items-center justify-between rounded-xl border bg-muted/20 p-3.5 shadow-xs">
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-card border p-1 text-foreground shrink-0">
                    <CreditCard className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-foreground">Visa ending in 4242</p>
                    <p className="text-[10px] text-muted-foreground">Expires 12/28 · Primary</p>
                  </div>
                </div>
                <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Primary</span>
              </div>

              {/* bKash Mapped Option */}
              <div className="flex items-center justify-between rounded-xl border bg-muted/20 p-3.5 shadow-xs">
                <div className="flex items-center gap-3">
                  <span className="h-8 w-8 flex items-center justify-center rounded-lg bg-pink-500 text-white font-bold text-xs">
                    bk
                  </span>
                  <div>
                    <p className="text-xs font-semibold text-foreground">bKash Wallet</p>
                    <p className="text-[10px] text-muted-foreground">017****4242</p>
                  </div>
                </div>
              </div>

              <Button size="sm" variant="outline" className="w-full gap-2 rounded-lg mt-2">
                <Plus className="h-4 w-4" />
                Add Payment Method
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Invoice Logs */}
        <Card className="card-hover">
          <CardHeader className="border-b py-4">
            <CardTitle>Billing Receipts & Invoices</CardTitle>
            <CardDescription>Download past transaction logs for accounting</CardDescription>
          </CardHeader>
          <CardContent className="py-2">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="py-3 font-medium">Invoice ID</th>
                    <th className="py-3 font-medium">Billing Date</th>
                    <th className="py-3 font-medium">Description</th>
                    <th className="py-3 font-medium">Payment Method</th>
                    <th className="py-3 text-right font-medium">Amount</th>
                    <th className="py-3 text-center font-medium">Receipt</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {[
                    { id: "INV-0012", date: "Jul 19, 2026", desc: "Professional Subscription Renewal", method: "Visa *4242", amount: 7500 },
                    { id: "INV-0008", date: "Jun 19, 2026", desc: "Professional Subscription Renewal", method: "Visa *4242", amount: 7500 },
                    { id: "INV-0004", date: "May 19, 2026", desc: "Starter Subscription Activation", method: "bKash wallet", amount: 2500 },
                  ].map((inv) => (
                    <tr key={inv.id}>
                      <td className="py-3 font-mono font-semibold text-foreground">{inv.id}</td>
                      <td className="py-3 text-muted-foreground">{inv.date}</td>
                      <td className="py-3 text-muted-foreground">{inv.desc}</td>
                      <td className="py-3 text-muted-foreground">{inv.method}</td>
                      <td className="py-3 text-right font-bold text-foreground">{formatCurrency(inv.amount)}</td>
                      <td className="py-3 text-center">
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground">
                          <Download className="h-4 w-4" />
                        </Button>
                      </td>
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
