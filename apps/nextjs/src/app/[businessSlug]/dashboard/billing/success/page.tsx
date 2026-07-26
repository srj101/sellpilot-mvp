import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, Download } from "lucide-react";

import type { PlanKey } from "@acme/api/plans";
import { PLAN_CATALOG } from "@acme/api/plans";
import { Button } from "@acme/ui/button";

import { getSession } from "~/auth/server";
import { createCaller } from "~/trpc/caller";

function formatCurrency(val: number) {
  return `৳${Math.round(val).toLocaleString()}`;
}

function formatDate(date: Date) {
  return new Date(date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export default async function BillingSuccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<{ invoice?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { businessSlug } = await params;
  const { invoice: invoiceId } = await searchParams;

  const caller = await createCaller(await headers());
  const invoice = invoiceId ? await caller.subscription.getInvoice({ id: invoiceId }).catch(() => null) : null;
  const plan = invoice ? PLAN_CATALOG[invoice.plan as PlanKey] : null;

  return (
    <main className="auth-mesh relative flex min-h-screen items-center justify-center overflow-hidden p-3 sm:p-6 lg:p-8">
      <div className="auth-grid pointer-events-none absolute inset-0" />
      <div className="auth-scan pointer-events-none absolute inset-x-0 top-0 h-px" />

      <div className="relative w-full max-w-lg rounded-3xl border bg-card p-8 text-center shadow-2xl shadow-primary/5 sm:p-10">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
          <CheckCircle2 className="h-8 w-8 text-emerald-500" />
        </div>

        <h1 className="text-2xl font-semibold tracking-[-0.02em] sm:text-3xl">Payment successful</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {plan
            ? `You're now on the ${plan.name} plan. Your AI agent keeps selling without interruption.`
            : "Your subscription is active."}
        </p>

        {invoice && (
          <div className="mt-8 space-y-3 rounded-2xl border bg-background/60 p-5 text-left text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Amount charged</span>
              <span className="font-semibold text-foreground">{formatCurrency(invoice.amount)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Next billing date</span>
              <span className="font-semibold text-foreground">{formatDate(invoice.periodEnd)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Invoice</span>
              <span className="font-mono text-xs font-semibold text-foreground">{invoice.invoiceNumber}</span>
            </div>
          </div>
        )}

        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            href={`/${businessSlug}/dashboard/billing`}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 sm:w-auto"
          >
            Go to Billing
          </Link>
          {invoice && (
            <Link href={`/${businessSlug}/dashboard/billing/invoices/${invoice.id}?print=true`}>
              <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground">
                <Download className="h-4 w-4" />
                Download Invoice
              </Button>
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
