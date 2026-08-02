"use client";

import { RotateCcw } from "lucide-react";

import { Button } from "@acme/ui/button";
import { Skeleton } from "@acme/ui/skeleton";
import { cn } from "@acme/ui";

export interface TransactionRow {
  id: string;
  reference: string;
  method: string;
  status: string;
  amount: number;
  deliveryCharge: number;
  refundedAmount: number;
  createdAt: Date | string;
  orderId: string | null;
  orderNumber: string | null;
  customerName: string | null;
  customerPhone: string | null;
}

const METHOD_LABEL: Record<string, string> = {
  bkash: "bKash",
  nagad: "Nagad",
  card: "Card",
  internetbank: "Bank",
  cod: "COD",
};

const STATUS_STYLE: Record<string, string> = {
  success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  pending: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  failed: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  refunded: "bg-muted text-muted-foreground",
};

function formatCurrency(val: number) {
  return `৳${Math.round(val).toLocaleString()}`;
}

function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

interface TransactionTableProps {
  rows: TransactionRow[];
  isLoading: boolean;
  onRefund: (row: TransactionRow) => void;
  refundingId: string | null;
}

export function TransactionTable({ rows, isLoading, onRefund, refundingId }: TransactionTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th className="py-3 font-medium">Reference</th>
            <th className="py-3 font-medium">Order</th>
            <th className="py-3 font-medium">Customer</th>
            <th className="py-3 font-medium">Method</th>
            <th className="py-3 font-medium">Status</th>
            <th className="py-3 text-right font-medium">Amount</th>
            <th className="py-3 text-right font-medium">Delivery</th>
            <th className="py-3 font-medium">Date</th>
            <th className="py-3 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <tr key={i}>
                <td className="py-3"><Skeleton className="h-4 w-20" /></td>
                <td className="py-3"><Skeleton className="h-4 w-16" /></td>
                <td className="py-3"><Skeleton className="h-4 w-24" /></td>
                <td className="py-3"><Skeleton className="h-4 w-14" /></td>
                <td className="py-3"><Skeleton className="h-5 w-16 rounded-full" /></td>
                <td className="py-3 flex justify-end"><Skeleton className="h-4 w-16" /></td>
                <td className="py-3 flex justify-end"><Skeleton className="h-4 w-12" /></td>
                <td className="py-3"><Skeleton className="h-4 w-24" /></td>
                <td className="py-3" />
              </tr>
            ))
          ) : rows.length ? (
            rows.map((r) => (
              <tr key={r.id}>
                <td className="py-3 font-mono text-xs font-semibold text-foreground">{r.reference.slice(0, 12)}</td>
                <td className="py-3 text-muted-foreground">{r.orderNumber ?? "—"}</td>
                <td className="py-3 text-muted-foreground">
                  {r.customerName ?? "—"}
                  {r.customerPhone && <span className="block text-[11px] text-muted-foreground/70">{r.customerPhone}</span>}
                </td>
                <td className="py-3 text-muted-foreground">{METHOD_LABEL[r.method] ?? r.method}</td>
                <td className="py-3">
                  <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize", STATUS_STYLE[r.status] ?? "bg-muted")}>
                    {r.status}
                  </span>
                </td>
                <td className="py-3 text-right font-bold text-foreground">
                  {formatCurrency(r.amount - r.refundedAmount)}
                  {r.refundedAmount > 0 && <span className="ml-1 text-[11px] font-normal text-muted-foreground">(−{formatCurrency(r.refundedAmount)})</span>}
                </td>
                <td className="py-3 text-right text-muted-foreground">{formatCurrency(r.deliveryCharge)}</td>
                <td className="py-3 text-muted-foreground">{formatDate(r.createdAt)}</td>
                <td className="py-3 text-right">
                  {r.status === "success" && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-rose-500"
                      title="Refund"
                      disabled={refundingId === r.id}
                      onClick={() => onRefund(r)}
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={9} className="py-10 text-center text-xs text-muted-foreground">
                No transactions match your filters yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
