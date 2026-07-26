"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight, Banknote, Package, RefreshCcw, Search, Undo2 } from "lucide-react";

import { Card, CardContent } from "@acme/ui/card";
import { Input } from "@acme/ui/input";
import { toast } from "@acme/ui/toast";
import { cn } from "@acme/ui";

import { useTRPC } from "~/trpc/react";
import { MethodStatusStrip } from "./method-status-strip";
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
}

function StatCard({ icon: Icon, label, value, sub, trendPct, increaseIsGood = true }: StatCardProps) {
  const isUp = (trendPct ?? 0) >= 0;
  const isGoodTrend = trendPct === null || trendPct === undefined ? null : isUp === increaseIsGood;
  return (
    <Card>
      <CardContent className="space-y-2 py-5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
          <Icon className="size-4 text-muted-foreground/60" />
        </div>
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
  { value: "refunded", label: "Refunded" },
];

type MethodFilter = "" | "bkash" | "nagad" | "card" | "internetbank" | "cod";
type StatusFilter = "" | "success" | "pending" | "failed" | "refunded";

export function PaymentsClient() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [method, setMethod] = useState<MethodFilter>("");
  const [status, setStatus] = useState<StatusFilter>("");
  const [refundingId, setRefundingId] = useState<string | null>(null);

  const { data: summary } = useQuery(trpc.payments.getSummary.queryOptions({ range: "30d" }));
  const { data: rows, isLoading } = useQuery(
    trpc.payments.list.queryOptions({
      search: search || undefined,
      method: method || undefined,
      status: status || undefined,
      limit: 100,
    }),
  );

  const refund = useMutation(
    trpc.payments.refund.mutationOptions({
      onSuccess: () => {
        toast.success("Refund recorded.");
        void qc.invalidateQueries({ queryKey: trpc.payments.list.queryKey() });
        void qc.invalidateQueries({ queryKey: trpc.payments.getSummary.queryKey() });
      },
      onError: (err) => toast.error(err.message),
      onSettled: () => setRefundingId(null),
    }),
  );

  function handleRefund(row: TransactionRow) {
    const remaining = row.amount - row.refundedAmount;
    const input = window.prompt(`Refund how much of ${formatCurrency(remaining)} for ${row.reference.slice(0, 12)}?`, String(remaining));
    if (!input) return;
    const amount = Number(input);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter a valid refund amount.");
      return;
    }
    setRefundingId(row.id);
    refund.mutate({ id: row.id, amount });
  }

  return (
    <div className="space-y-6">
      <MethodStatusStrip />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Banknote}
          label="Total Collected"
          value={formatCurrency(summary?.totalCollected ?? 0)}
          sub="Last 30 days"
          trendPct={summary?.totalCollectedTrendPct ?? null}
          increaseIsGood
        />
        <StatCard
          icon={Package}
          label="Pending COD"
          value={formatCurrency(summary?.pendingCod ?? 0)}
          sub={`${summary?.pendingCodCount ?? 0} orders`}
        />
        <StatCard
          icon={ArrowUpRight}
          label="Delivery Charges Collected"
          value={formatCurrency(summary?.deliveryChargesCollected ?? 0)}
          sub="Last 30 days"
          trendPct={summary?.deliveryChargesTrendPct ?? null}
          increaseIsGood
        />
        <StatCard
          icon={Undo2}
          label="Refunds"
          value={formatCurrency(summary?.refunds ?? 0)}
          sub="Last 30 days"
          trendPct={summary?.refundsTrendPct ?? null}
          increaseIsGood={false}
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

          <TransactionTable rows={rows ?? []} isLoading={isLoading} onRefund={handleRefund} refundingId={refundingId} />
        </CardContent>
      </Card>
    </div>
  );
}
