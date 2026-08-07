"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowUpRight, CreditCard, Download, Plus, Star, Trash2 } from "lucide-react";

import type { BillingCycle, PlanKey } from "@acme/api/plans";
import { CYCLE_META, PLAN_CATALOG } from "@acme/api/plans";
import { Button } from "@acme/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@acme/ui/card";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@acme/ui/sheet";
import { toast } from "@acme/ui/toast";
import { cn } from "@acme/ui";
import { Skeleton } from "@acme/ui/skeleton";

import { PlanGrid } from "~/app/_components/pricing/plan-grid";
import { ConfirmDialog } from "~/app/[businessSlug]/dashboard/_components/confirm-dialog";
import { useTRPC } from "~/trpc/react";

function formatCurrency(val: number) {
  return `৳${Math.round(val).toLocaleString()}`;
}

function formatDate(date: string | Date) {
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const STATUS_STYLE: Record<string, string> = {
  trialing: "bg-(--warning)/10 text-(--warning)",
  active: "bg-(--success)/10 text-(--success)",
  past_due: "bg-(--destructive)/10 text-(--destructive)",
  cancelled: "bg-muted text-muted-foreground",
};

const STATUS_LABEL: Record<string, string> = {
  trialing: "Trialing",
  active: "Active",
  past_due: "Past Due",
  cancelled: "Cancelled",
};

function Meter({ label, used, limit, customDisplay }: { label: string; used: number; limit: number | null; customDisplay?: string }) {
  const pct = limit === null ? 0 : Math.min(100, Math.round((used / limit) * 100));
  const barColor = limit !== null && pct >= 100 ? "bg-(--destructive)" : limit !== null && pct >= 80 ? "bg-(--warning)" : "bg-primary";
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-medium text-foreground">{label}</span>
        <span className="text-muted-foreground">
          {customDisplay ?? `${used.toLocaleString()} ${limit === null ? "· Unlimited" : `/ ${limit.toLocaleString()}`}`}
        </span>
      </div>
      {limit !== null && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className={cn("h-full rounded-full transition-all", barColor)} style={{ width: `${pct}%` }} />
        </div>
      )}
      {limit !== null && pct >= 100 && (
        <p className="text-[11px] text-(--destructive)">
          You&apos;ve hit your {label.toLowerCase()} limit. Upgrade or remove some to add more.
        </p>
      )}
    </div>
  );
}

export function BillingClient({ businessSlug }: { businessSlug: string }) {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const [changePlanOpen, setChangePlanOpen] = useState(false);
  const [busyPlan, setBusyPlan] = useState<PlanKey | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);

  const { data: current, isPending: currentPending } = useQuery(trpc.subscription.getCurrent.queryOptions());
  const { data: usage, isPending: usagePending } = useQuery(trpc.subscription.getUsage.queryOptions());
  const { data: methods, isPending: methodsPending } = useQuery(trpc.subscription.listPaymentMethods.queryOptions());
  const { data: invoices, isPending: invoicesPending } = useQuery(trpc.subscription.listInvoices.queryOptions({ limit: 20 }));

  const invalidateBilling = () => {
    void qc.invalidateQueries({ queryKey: trpc.subscription.getCurrent.queryKey() });
    void qc.invalidateQueries({ queryKey: trpc.subscription.getUsage.queryKey() });
  };

  const changePlan = useMutation(
    trpc.subscription.changePlan.mutationOptions({
      onSuccess: (result) => {
        if (result.applied) {
          toast.success("Plan updated.");
          setChangePlanOpen(false);
          invalidateBilling();
        } else if (result.gatewayUrl) {
          window.location.assign(result.gatewayUrl);
        } else {
          toast.success("Plan change scheduled for the end of your current period.");
          setChangePlanOpen(false);
          invalidateBilling();
        }
      },
      onError: (err) => toast.error(err.message),
      onSettled: () => setBusyPlan(null),
    }),
  );

  const cancelSub = useMutation(
    trpc.subscription.cancel.mutationOptions({
      onSuccess: (result) => {
        setCancelOpen(false);
        toast.success(`Subscription will end on ${result.effectiveAt ? formatDate(result.effectiveAt) : "your period end"}.`);
        invalidateBilling();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const resumeSub = useMutation(
    trpc.subscription.resume.mutationOptions({
      onSuccess: () => {
        toast.success("Subscription resumed.");
        invalidateBilling();
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const addPaymentMethod = useMutation(
    trpc.subscription.addPaymentMethod.mutationOptions({
      onSuccess: (result) => window.location.assign(result.gatewayUrl),
      onError: (err) => toast.error(err.message),
    }),
  );

  const retryInvoice = useMutation(
    trpc.subscription.retryInvoice.mutationOptions({
      onSuccess: (result) => window.location.assign(result.gatewayUrl),
      onError: (err) => toast.error(err.message),
    }),
  );

  const removeMethod = useMutation(
    trpc.subscription.removePaymentMethod.mutationOptions({
      onSuccess: () => {
        toast.success("Payment method removed.");
        void qc.invalidateQueries({ queryKey: trpc.subscription.listPaymentMethods.queryKey() });
      },
      onError: (err) => toast.error(err.message),
    }),
  );

  const setDefaultMethod = useMutation(
    trpc.subscription.setDefaultPaymentMethod.mutationOptions({
      onSuccess: () => void qc.invalidateQueries({ queryKey: trpc.subscription.listPaymentMethods.queryKey() }),
      onError: (err) => toast.error(err.message),
    }),
  );

  function handleChangePlan(plan: PlanKey, cycle: BillingCycle) {
    setBusyPlan(plan);
    changePlan.mutate({ plan, billingCycle: cycle });
  }

  function handleCancel() {
    setCancelOpen(true);
  }

  function handleConfirmCancel() {
    cancelSub.mutate();
  }

  const catalogEntry = current?.plan ? PLAN_CATALOG[current.plan] : null;
  const isTrialing = current?.status === "trialing";
  const isPastDue = current?.status === "past_due";

  return (
    <div className="space-y-6">
      {isPastDue && (
        <div className="flex items-start gap-3 rounded-xl border border-(--destructive)/30 bg-(--destructive)/5 p-4">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-(--destructive)" />
          <div className="flex-1 text-sm">
            <p className="font-semibold text-(--destructive)">Payment failed</p>
            <p className="mt-0.5 text-muted-foreground">
              We couldn&apos;t process your last payment. Update your payment method to avoid interruption.
            </p>
          </div>
          <Link href={`/${businessSlug}/dashboard/billing/payment-method`}>
            <Button size="sm" variant="outline">Update Payment Method</Button>
          </Link>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Current Plan</CardTitle>
            <CardDescription>Details of your active subscription plan</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {currentPending ? (
              <div className="space-y-6">
                <div className="flex items-start justify-between border-b pb-4">
                  <div>
                    <Skeleton className="h-7 w-32" />
                    <Skeleton className="mt-1 h-4 w-48" />
                  </div>
                  <Skeleton className="h-5 w-20 rounded-full" />
                </div>
                <div className="grid gap-6 md:grid-cols-3">
                  <div>
                    <Skeleton className="mb-1 h-3 w-24" />
                    <Skeleton className="h-5 w-20" />
                  </div>
                  <div>
                    <Skeleton className="mb-1 h-3 w-24" />
                    <Skeleton className="h-5 w-20" />
                  </div>
                  <div>
                    <Skeleton className="mb-1 h-3 w-24" />
                    <Skeleton className="h-5 w-20" />
                  </div>
                </div>
                <div className="flex items-center gap-3 pt-2">
                  <Skeleton className="h-9 w-28 rounded-lg" />
                  <Skeleton className="h-9 w-32 rounded-lg" />
                </div>
              </div>
            ) : !current?.plan || !catalogEntry ? (
              <div className="py-10 text-center text-sm text-muted-foreground">
                No subscription found for this business yet.
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between border-b pb-4">
                  <div>
                    <h3 className="text-lg font-bold text-foreground">{catalogEntry.name} Plan</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">{catalogEntry.tagline}</p>
                  </div>
                  <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", STATUS_STYLE[current.status])}>
                    {STATUS_LABEL[current.status]}
                  </span>
                </div>

                {isTrialing ? (
                  <div className="space-y-2">
                    <div className="flex items-baseline justify-between text-xs">
                      <span className="font-medium text-foreground">Trial period</span>
                      <span className="text-muted-foreground">{current.daysRemaining} day{current.daysRemaining === 1 ? "" : "s"} remaining</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-(--warning) transition-all"
                        style={{ width: `${Math.max(0, Math.min(100, ((14 - current.daysRemaining) / 14) * 100))}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid gap-6 md:grid-cols-3">
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Billing Frequency</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">{CYCLE_META[current.billingCycle].label}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Subscription Cost</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">{formatCurrency(current.amount)} {CYCLE_META[current.billingCycle].shortLabel}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                        {current.cancelAtPeriodEnd ? "Access Ends" : "Next Billing Date"}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-foreground">
                        {current.currentPeriodEnd ? formatDate(current.currentPeriodEnd) : "—"}
                      </p>
                    </div>
                  </div>
                )}

                {current.pendingPlan && (
                  <p className="rounded-lg bg-(--warning)/10 px-3 py-2 text-xs text-(--warning)">
                    Switching to <strong>{PLAN_CATALOG[current.pendingPlan].name}</strong> at the end of this period.
                  </p>
                )}

                <div className="flex items-center gap-3 pt-2">
                  <Sheet open={changePlanOpen} onOpenChange={setChangePlanOpen}>
                    <SheetTrigger asChild>
                      <Button size="sm" className="rounded-lg shadow-sm">
                        Change Plan
                        <ArrowUpRight className="h-4 w-4" />
                      </Button>
                    </SheetTrigger>
                    <SheetContent side="bottom" className="max-h-[92dvh] overflow-y-auto" title="Change your plan">
                      <SheetHeader>
                        <SheetTitle>Change your plan</SheetTitle>
                        <SheetDescription>Upgrades apply immediately with the unused portion of your current period credited. Downgrades apply at your next renewal.</SheetDescription>
                      </SheetHeader>
                      <div className="px-1 pb-4">
                        <PlanGrid
                          mode="dashboard"
                          dashboardState={{ currentPlan: current.plan, isTrialing, pendingPlan: current.pendingPlan }}
                          onChoosePlan={handleChangePlan}
                          busyPlan={busyPlan}
                          initialCycle={current.billingCycle}
                        />
                      </div>
                    </SheetContent>
                  </Sheet>

                  {current.cancelAtPeriodEnd ? (
                    <Button size="sm" variant="outline" className="rounded-lg" onClick={() => resumeSub.mutate()} disabled={resumeSub.isPending}>
                      Resume Subscription
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-lg text-(--destructive) hover:bg-(--destructive)/5 hover:text-(--destructive)"
                      onClick={handleCancel}
                      disabled={cancelSub.isPending}
                    >
                      Cancel Subscription
                    </Button>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Payment Methods</CardTitle>
            <CardDescription>Cards used for SellPilot billing renewals</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {methodsPending ? (
              <>
                <Skeleton className="h-[68px] w-full rounded-xl" />
                <Skeleton className="h-[68px] w-full rounded-xl" />
              </>
            ) : methods?.length ? (
              methods.map((m) => (
                <div key={m.id} className="flex items-center justify-between rounded-xl border bg-muted/20 p-3.5 shadow-xs">
                  <div className="flex items-center gap-3">
                    <div className="shrink-0 rounded-lg border bg-card p-1 text-foreground">
                      <CreditCard className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold capitalize text-foreground">{m.brand} ···· {m.last4}</p>
                      <p className="text-[10px] text-muted-foreground">
                        Expires {String(m.expiryMonth).padStart(2, "0")}/{String(m.expiryYear).slice(-2)} {m.isDefault && "· Default"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {!m.isDefault && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-(--warning)" title="Make default" onClick={() => setDefaultMethod.mutate({ id: m.id })}>
                        <Star className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-(--destructive)" title="Remove" onClick={() => removeMethod.mutate({ id: m.id })}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))
            ) : (
              <p className="rounded-xl border border-dashed p-4 text-center text-xs text-muted-foreground">No payment method on file yet.</p>
            )}

            <Button
              size="sm"
              variant="outline"
              className="mt-2 w-full gap-2 rounded-lg"
              onClick={() => addPaymentMethod.mutate()}
              disabled={addPaymentMethod.isPending || methodsPending}
            >
              <Plus className="h-4 w-4" />
              Add Payment Method
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Usage This Period</CardTitle>
          <CardDescription>Live counts against your {catalogEntry?.name ?? "active"} plan limits</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-4">
          {usagePending ? (
            <>
              <div className="flex flex-col gap-1.5"><Skeleton className="h-4 w-32"/><Skeleton className="h-1.5 w-full rounded-full"/></div>
              <div className="flex flex-col gap-1.5"><Skeleton className="h-4 w-32"/><Skeleton className="h-1.5 w-full rounded-full"/></div>
              <div className="flex flex-col gap-1.5"><Skeleton className="h-4 w-32"/><Skeleton className="h-1.5 w-full rounded-full"/></div>
              <div className="flex flex-col gap-1.5"><Skeleton className="h-4 w-32"/><Skeleton className="h-1.5 w-full rounded-full"/></div>
            </>
          ) : (
            <>
              <Meter label="AI Conversations" used={usage?.aiConversations.used ?? 0} limit={usage?.aiConversations.limit ?? null} />
              <Meter label="Products" used={usage?.products.used ?? 0} limit={usage?.products.limit ?? null} />
              <Meter label="Team Seats" used={usage?.seats.used ?? 0} limit={usage?.seats.limit ?? null} />
              <Meter label="Invoices" used={usage?.invoices.used ?? 0} limit={usage?.invoices.limit ?? null} />
              <Meter label="Media Storage" used={usage?.storage?.usedBytes ?? 0} limit={usage?.storage?.limitBytes ?? 3221225472} customDisplay={`${usage?.storage?.usedGb ?? "0.00"} GB / ${usage?.storage?.limitGb ?? 3} GB`} />
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b py-4">
          <CardTitle>Billing Receipts & Invoices</CardTitle>
          <CardDescription>Download past transaction logs for accounting</CardDescription>
        </CardHeader>
        <CardContent className="py-2">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-3 font-medium">Invoice</th>
                  <th className="py-3 font-medium">Date</th>
                  <th className="py-3 font-medium">Plan</th>
                  <th className="py-3 font-medium">Status</th>
                  <th className="py-3 text-right font-medium">Amount</th>
                  <th className="py-3 text-center font-medium">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {invoicesPending ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i}>
                      <td className="py-3"><Skeleton className="h-4 w-20" /></td>
                      <td className="py-3"><Skeleton className="h-4 w-24" /></td>
                      <td className="py-3"><Skeleton className="h-4 w-16" /></td>
                      <td className="py-3"><Skeleton className="h-5 w-16 rounded-full" /></td>
                      <td className="py-3"><Skeleton className="ml-auto h-4 w-16" /></td>
                      <td className="py-3"><Skeleton className="mx-auto h-7 w-7 rounded-md" /></td>
                    </tr>
                  ))
                ) : invoices?.length ? (
                  invoices.map((inv) => (
                    <tr key={inv.id}>
                      <td className="py-3 font-mono font-semibold text-foreground">{inv.invoiceNumber}</td>
                      <td className="py-3 text-muted-foreground">{formatDate(inv.createdAt)}</td>
                      <td className="py-3 capitalize text-muted-foreground">{PLAN_CATALOG[inv.plan as PlanKey].name}</td>
                      <td className="py-3">
                        <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
                          inv.status === "paid" ? "bg-(--success)/10 text-(--success)" : inv.status === "failed" ? "bg-(--destructive)/10 text-(--destructive)" : "bg-muted text-muted-foreground")}>
                          {inv.status}
                        </span>
                      </td>
                      <td className="py-3 text-right font-bold text-foreground">{formatCurrency(inv.amount)}</td>
                      <td className="py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {(inv.status === "pending" || inv.status === "failed") && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 rounded-md px-2 text-[11px]"
                              disabled={retryInvoice.isPending}
                              onClick={() => retryInvoice.mutate({ invoiceId: inv.id })}
                            >
                              Pay Now
                            </Button>
                          )}
                          <Link href={`/${businessSlug}/dashboard/billing/invoices/${inv.id}`}>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground">
                              <Download className="h-4 w-4" />
                            </Button>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-xs text-muted-foreground">
                      No invoices yet — you haven&apos;t been billed.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancel subscription?"
        description="You'll keep access until the end of your current period, then the business will be locked. Your data is never deleted."
        confirmLabel="Cancel Subscription"
        destructive
        loading={cancelSub.isPending}
        onConfirm={handleConfirmCancel}
      />
    </div>
  );
}
