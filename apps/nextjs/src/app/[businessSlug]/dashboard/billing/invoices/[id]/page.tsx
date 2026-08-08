import { headers } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Building2 } from "lucide-react";

import type { PlanKey } from "@acme/api/plans";
import { PLAN_CATALOG } from "@acme/api/plans";
import { Button } from "@acme/ui/button";

import { getSession } from "~/auth/server";
import { createCaller } from "~/trpc/caller";
import { PrintButton } from "./print-button";

function formatCurrency(val: number) {
  return `৳${Math.round(val).toLocaleString()}`;
}

function formatDate(date: Date) {
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default async function SaasInvoiceDetailPage({
  params,
}: {
  params: Promise<{ businessSlug: string; id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { businessSlug, id } = await params;

  const caller = await createCaller(await headers());
  const invoice = await caller.subscription.getInvoice({ id }).catch(() => null);
  if (!invoice) notFound();

  const plan = PLAN_CATALOG[invoice.plan as PlanKey];

  return (
      <div className="mx-auto max-w-4xl space-y-6 print:m-0 print:max-w-none print:p-0">
        <div className="flex items-center justify-between print:hidden">
          <Link href={`/${businessSlug}/dashboard/billing`}>
            <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
              Back to Billing
            </Button>
          </Link>
          <PrintButton />
        </div>

        {/* Invoice Card */}
        <div className="relative overflow-hidden rounded-[24px] border bg-card shadow-sm print:rounded-none print:border-none print:shadow-none">
          {/* Watermark */}
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden z-0 opacity-[0.03] print:opacity-[0.05]">
            <span className="text-[10rem] sm:text-[14rem] font-black uppercase tracking-tighter -rotate-45 select-none whitespace-nowrap">
              SELLPILOT
            </span>
          </div>

          <div className="relative z-10 h-2 bg-primary print:hidden" />
          
          <div className="relative z-10 p-8 sm:p-12 print:p-0">
            {/* Header: Company & Invoice Info */}
            <div className="flex flex-col justify-between gap-8 sm:flex-row sm:items-start">
              <div>
                <div className="flex items-center gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <span className="text-2xl font-bold tracking-tight text-foreground">SellPilot</span>
                </div>
                <div className="mt-4 space-y-1 text-sm text-muted-foreground">
                  <p>123 Commerce Avenue</p>
                  <p>Suite 400</p>
                  <p>Dhaka, Bangladesh 1212</p>
                  <p>billing@sellpilot.com</p>
                </div>
              </div>

              <div className="text-left sm:text-right">
                <h1 className="text-4xl font-black tracking-tight text-foreground/10 uppercase">Invoice</h1>
                <p className="mt-2 text-base font-semibold text-foreground">{invoice.invoiceNumber}</p>
                <div className="mt-1 flex items-center sm:justify-end">
                  <span
                    className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold capitalize ${
                      invoice.status === "paid"
                        ? "bg-emerald-500/10 text-emerald-600"
                        : invoice.status === "pending"
                          ? "bg-amber-500/10 text-amber-600"
                          : "bg-rose-500/10 text-rose-600"
                    }`}
                  >
                    {invoice.status}
                  </span>
                </div>
                
                <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-1 sm:text-right">
                  <div>
                    <span className="text-muted-foreground">Date Issued:</span>
                    <span className="ml-2 font-medium text-foreground">{formatDate(invoice.createdAt)}</span>
                  </div>
                  {invoice.paidAt && (
                    <div>
                      <span className="text-muted-foreground">Date Paid:</span>
                      <span className="ml-2 font-medium text-foreground">{formatDate(invoice.paidAt)}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <hr className="my-8 border-border" />

            {/* Bill To */}
            <div className="space-y-1 text-sm">
              <p className="font-semibold text-muted-foreground uppercase tracking-wider text-xs">Billed To</p>
              <p className="text-base font-bold text-foreground">{invoice.businessName}</p>
              <p className="text-muted-foreground">Business Workspace: {businessSlug}</p>
            </div>

            {/* Line Items */}
            <div className="mt-10">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-border/60 text-left">
                      <th className="py-3 font-semibold text-muted-foreground">Description</th>
                      <th className="py-3 text-center font-semibold text-muted-foreground">Qty</th>
                      <th className="py-3 text-right font-semibold text-muted-foreground">Unit Price</th>
                      <th className="py-3 text-right font-semibold text-muted-foreground">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    <tr>
                      <td className="py-5">
                        <p className="font-medium text-foreground">
                          SellPilot {plan.name} Plan
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {invoice.billingCycle} billing cycle ({formatDate(invoice.periodStart)} – {formatDate(invoice.periodEnd)})
                        </p>
                      </td>
                      <td className="py-5 text-center text-foreground">1</td>
                      <td className="py-5 text-right text-foreground">{formatCurrency(invoice.amount)}</td>
                      <td className="py-5 text-right font-medium text-foreground">{formatCurrency(invoice.amount)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Totals */}
            <div className="mt-8 flex justify-end">
              <div className="w-full max-w-sm space-y-3 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span>
                  <span>{formatCurrency(invoice.amount)}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Tax (0%)</span>
                  <span>{formatCurrency(0)}</span>
                </div>
                <div className="flex justify-between border-t border-border pt-3 text-lg font-bold text-foreground">
                  <span>Total Due</span>
                  <span>{formatCurrency(invoice.amount)}</span>
                </div>
                {invoice.status === "paid" && (
                  <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-semibold pt-1">
                    <span>Amount Paid</span>
                    <span>-{formatCurrency(invoice.amount)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-border pt-3 font-semibold text-foreground">
                  <span>Balance Due</span>
                  <span>{invoice.status === "paid" ? formatCurrency(0) : formatCurrency(invoice.amount)}</span>
                </div>
              </div>
            </div>

            <hr className="my-10 border-border" />

            {/* Footer */}
            <div className="space-y-2 text-xs text-muted-foreground text-center sm:text-left">
              <p className="font-medium text-foreground">Thank you for your business!</p>
              <p>If you have any questions about this invoice, please contact billing@sellpilot.com.</p>
              {invoice.providerTransactionId && (
                <p className="pt-2">Transaction Ref: <span className="font-mono">{invoice.providerTransactionId}</span></p>
              )}
            </div>
          </div>
        </div>
      </div>
  );
}
