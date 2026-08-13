"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Banknote, Package, RefreshCcw, Search, Undo2 } from "lucide-react";

import { Card, CardContent } from "@acme/ui/card";
import { Input } from "@acme/ui/input";
import { Button } from "@acme/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@acme/ui/dialog";
import { Skeleton } from "@acme/ui/skeleton";
import { toast } from "@acme/ui/toast";
import { cn } from "@acme/ui";

import { useTRPC } from "~/trpc/react";
import { usePermissions } from "~/hooks/use-permissions";
import { MethodStatusStrip } from "./method-status-strip";
import { GatewaySettings } from "./gateway-settings";
import type { TransactionRow } from "./transaction-table";
import { TransactionTable } from "./transaction-table";

function formatCurrency(val: number) {
  return `৳${Math.round(val).toLocaleString()}`;
}

interface StatCardProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  trendPct?: number | null;
  /** Whether an increase in this metric is a good thing (Collected) or bad (Refunds). */
  increaseIsGood?: boolean;
  /** While true, shows a skeleton instead of `value`/`sub` — otherwise every card
   * defaults to "৳0" for an instant before the real summary loads (same "wrong value
   * flashes before the real one arrives" bug class as the onboarding lock icons). */
  isPending?: boolean;
}

function StatCard({ icon: Icon, label, value, sub, trendPct, increaseIsGood = true, isPending }: StatCardProps) {
  const isUp = (trendPct ?? 0) >= 0;
  const isGoodTrend = trendPct === null || trendPct === undefined ? null : isUp === increaseIsGood;
  return (
    <Card>
      <CardContent className="space-y-2 py-5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
          <Icon className="size-4 text-muted-foreground/60" />
        </div>
        {isPending ? (
          <>
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-3 w-20" />
          </>
        ) : (
          <>
            <p className="text-2xl font-bold tabular-nums tracking-tight text-foreground">{value}</p>
            <div className="flex items-center justify-between text-[11px]">
              {sub && <span className="text-muted-foreground">{sub}</span>}
              {trendPct !== null && trendPct !== undefined && (
                <span className={cn("inline-flex items-center gap-0.5 font-semibold", isGoodTrend ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
                  {isUp ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
                  {Math.abs(trendPct).toFixed(0)}%
                </span>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

const METHOD_OPTIONS = [
  { value: "", label: "All methods" },
  { value: "bkash", label: "bKash" },
  { value: "nagad", label: "Nagad" },
  { value: "card", label: "Card" },
  { value: "internetbank", label: "Bank" },
  { value: "cod", label: "COD" },
];

const STATUS_OPTIONS = [
  { value: "", label: "All statuses" },
  { value: "success", label: "Success" },
  { value: "pending", label: "Pending" },
  { value: "failed", label: "Failed" },
  { value: "refund_pending", label: "Refund pending" },
  { value: "refunded", label: "Refunded" },
];

type MethodFilter = "" | "bkash" | "nagad" | "card" | "internetbank" | "cod";
type StatusFilter = "" | "success" | "pending" | "failed" | "refunded" | "refund_pending";

export function PaymentsClient() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const { can } = usePermissions();
  const canRefund = can("payments", "edit");
  const [search, setSearch] = useState("");
  const [method, setMethod] = useState<MethodFilter>("");
  const [status, setStatus] = useState<StatusFilter>("");
  const [refundingId, setRefundingId] = useState<string | null>(null);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [refundTarget, setRefundTarget] = useState<TransactionRow | null>(null);
  const [refundAmount, setRefundAmount] = useState("");
  /** Refunds move real money, so the amount step and the irreversible confirmation are
   * deliberately separate — no single click can send money back to a customer. */
  const [refundStep, setRefundStep] = useState<"amount" | "confirm">("amount");

  const { data: summary, isPending: summaryPending } = useQuery(trpc.payments.getSummary.queryOptions({ range: "30d" }));
  const { data: rows, isLoading } = useQuery(
    trpc.payments.list.queryOptions({
      search: search || undefined,
      method: method || undefined,
      status: status || undefined,
      limit: 100,
    }),
  );

  function invalidatePayments() {
    void qc.invalidateQueries({ queryKey: trpc.payments.list.queryKey() });
    void qc.invalidateQueries({ queryKey: trpc.payments.getSummary.queryKey() });
  }

  const refund = useMutation(
    trpc.payments.refund.mutationOptions({
      onSuccess: (res) => {
        // "processing" is the normal outcome for a gateway refund — the bank settles it
        // afterwards. Saying "refunded" here would tell the owner the customer has their
        // money back when they may not yet.
        if (res.settlement === "processing") {
          toast.success("Refund sent to the gateway. It settles in a few working days.");
        } else if (res.settlement === "recorded") {
          toast.success("Refund recorded. Return the cash to the customer directly.");
        } else {
          toast.success("Refund completed.");
        }
        setRefundTarget(null);
        invalidatePayments();
      },
      onError: (err) => toast.error(err.message),
      onSettled: () => setRefundingId(null),
    }),
  );

  const syncRefund = useMutation(
    trpc.payments.syncRefundStatus.mutationOptions({
      onSuccess: (res) => {
        if (!res.changed) toast.info("Still processing at the gateway.");
        else if (res.status === "refunded") toast.success("Refund has settled.");
        else if (res.status === "success") toast.warning("The gateway did not complete this refund — it has been reversed.");
        else toast.success("Refund status updated.");
        invalidatePayments();
      },
      onError: (err) => toast.error(err.message),
      onSettled: () => setSyncingId(null),
    }),
  );

  function handleRefund(row: TransactionRow) {
    setRefundTarget(row);
    setRefundAmount(String(row.amount - row.refundedAmount));
    setRefundStep("amount");
  }

  function handleSyncRefund(row: TransactionRow) {
    setSyncingId(row.id);
    syncRefund.mutate({ id: row.id });
  }

  const refundAmountValue = Number(refundAmount);
  const refundAmountValid =
    refundTarget !== null &&
    Number.isFinite(refundAmountValue) &&
    refundAmountValue > 0 &&
    refundAmountValue <= refundTarget.amount - refundTarget.refundedAmount;

  function handleContinueToConfirm() {
    if (!refundAmountValid) {
      toast.error("Enter a valid refund amount.");
      return;
    }
    setRefundStep("confirm");
  }

  function handleConfirmRefund() {
    if (!refundTarget || !refundAmountValid) return;
    setRefundingId(refundTarget.id);
    refund.mutate({ id: refundTarget.id, amount: refundAmountValue });
  }

  return (
    <div className="space-y-6">
      <MethodStatusStrip />
      <GatewaySettings />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Banknote}
          label="Total Collected"
          value={formatCurrency(summary?.totalCollected ?? 0)}
          sub="Last 30 days"
          trendPct={summary?.totalCollectedTrendPct ?? null}
          increaseIsGood
          isPending={summaryPending}
        />
        <StatCard
          icon={Package}
          label="Pending COD"
          value={formatCurrency(summary?.pendingCod ?? 0)}
          sub={`${summary?.pendingCodCount ?? 0} orders`}
          isPending={summaryPending}
        />
        <StatCard
          icon={ArrowUpRight}
          label="Delivery Charges Collected"
          value={formatCurrency(summary?.deliveryChargesCollected ?? 0)}
          sub="Last 30 days"
          trendPct={summary?.deliveryChargesTrendPct ?? null}
          increaseIsGood
          isPending={summaryPending}
        />
        <StatCard
          icon={Undo2}
          label="Refunds"
          value={formatCurrency(summary?.refunds ?? 0)}
          sub="Last 30 days"
          trendPct={summary?.refundsTrendPct ?? null}
          increaseIsGood={false}
          isPending={summaryPending}
        />
      </div>

      <Card>
        <CardContent className="space-y-4 py-5">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search reference, order, customer, phone…"
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              className="h-9 rounded-md border bg-background px-3 text-sm"
              value={method}
              onChange={(e) => setMethod(e.target.value as MethodFilter)}
            >
              {METHOD_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <select
              className="h-9 rounded-md border bg-background px-3 text-sm"
              value={status}
              onChange={(e) => setStatus(e.target.value as StatusFilter)}
            >
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => {
                void qc.invalidateQueries({ queryKey: trpc.payments.list.queryKey() });
                void qc.invalidateQueries({ queryKey: trpc.payments.getSummary.queryKey() });
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm text-muted-foreground hover:text-foreground"
            >
              <RefreshCcw className="size-3.5" />
              Refresh
            </button>
          </div>

          <TransactionTable
            rows={rows?.items ?? []}
            isLoading={isLoading}
            onRefund={handleRefund}
            onSyncRefund={handleSyncRefund}
            refundingId={refundingId}
            syncingId={syncingId}
            canRefund={canRefund}
          />
        </CardContent>
      </Card>

      <Dialog
        open={refundTarget !== null}
        onOpenChange={(open) => {
          if (!open && refundingId === null) setRefundTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          {refundStep === "amount" ? (
            <>
              <DialogHeader>
                <DialogTitle>Refund payment</DialogTitle>
                <DialogDescription>
                  {refundTarget && (
                    <>
                      Refund how much of {formatCurrency(refundTarget.amount - refundTarget.refundedAmount)} for{" "}
                      <span className="font-mono">{refundTarget.reference.slice(0, 12)}</span>?
                    </>
                  )}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Input
                  type="number"
                  min={1}
                  step="any"
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  placeholder="Refund amount"
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">Partial refunds are allowed, up to the amount charged.</p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setRefundTarget(null)}>
                  Cancel
                </Button>
                <Button onClick={handleContinueToConfirm} disabled={!refundAmountValid}>
                  Continue
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-rose-500" />
                  {refundTarget?.canApiRefund ? "Send this money back?" : "Record this refund?"}
                </DialogTitle>
                <DialogDescription>This cannot be undone from SellPilot.</DialogDescription>
              </DialogHeader>

              <div className="space-y-3">
                <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3 text-sm">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-muted-foreground">Refund amount</span>
                    <span className="text-lg font-bold text-foreground">{formatCurrency(refundAmountValue)}</span>
                  </div>
                  {refundTarget && (
                    <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                      <div className="flex justify-between gap-3">
                        <span>To</span>
                        <span className="text-foreground">{refundTarget.customerName ?? "Customer"}</span>
                      </div>
                      <div className="flex justify-between gap-3">
                        <span>Transaction</span>
                        <span className="font-mono text-foreground">{refundTarget.reference.slice(0, 12)}</span>
                      </div>
                      {refundAmountValue < refundTarget.amount - refundTarget.refundedAmount && (
                        <div className="flex justify-between gap-3">
                          <span>Remaining after this</span>
                          <span className="text-foreground">
                            {formatCurrency(refundTarget.amount - refundTarget.refundedAmount - refundAmountValue)}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {refundTarget?.canApiRefund ? (
                  <p className="text-xs leading-5 text-muted-foreground">
                    This sends a <strong className="text-foreground">real refund</strong> to the payment gateway and the
                    money leaves your account. Gateway refunds are not instant — the status stays{" "}
                    <strong className="text-foreground">Refund pending</strong> until the customer&apos;s bank settles it,
                    usually within a few working days.
                  </p>
                ) : (
                  <p className="text-xs leading-5 text-muted-foreground">
                    {refundTarget?.method === "cod"
                      ? "This was a cash-on-delivery order, so no gateway is involved. This only records the refund in your ledger — you still need to return the cash to the customer yourself."
                      : "This payment has no gateway refund reference, so SellPilot cannot refund it automatically. This only records the refund in your ledger — issue the actual refund from your SSLCommerz merchant portal."}
                  </p>
                )}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setRefundStep("amount")} disabled={refundingId !== null}>
                  Back
                </Button>
                <Button variant="destructive" onClick={handleConfirmRefund} disabled={refundingId !== null}>
                  {refundingId
                    ? "Processing…"
                    : refundTarget?.canApiRefund
                      ? `Yes, refund ${formatCurrency(refundAmountValue)}`
                      : `Yes, record ${formatCurrency(refundAmountValue)}`}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
