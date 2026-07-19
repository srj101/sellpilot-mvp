"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Search,
  FileText,
  Download,
  Printer,
  CheckCircle,
  Clock,
  AlertTriangle,
  ChevronRight,
  Plus,
} from "lucide-react";

import { Button } from "@acme/ui/button";
import { Input } from "@acme/ui/input";
import { formatCurrency } from "../(home)/_components/dashboard-utils";

type Order = {
  id: string;
  orderNumber: string;
  status: string;
  total: number;
  customerName: string;
  createdAt: string | Date;
};

export function InvoicesClient({ orders }: { orders: Order[] }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "paid" | "pending" | "overdue">("all");

  const invoices = useMemo(() => {
    const now = new Date().getTime();
    return orders.map((o) => {
      let invoiceStatus: "paid" | "pending" | "overdue" = "pending";
      if (["paid", "shipped", "delivered"].includes(o.status)) {
        invoiceStatus = "paid";
      } else {
        const ageMs = now - new Date(o.createdAt).getTime();
        const ageDays = ageMs / 86400000;
        if (ageDays > 14) {
          invoiceStatus = "overdue";
        }
      }

      // Due date = created + 14 days
      const dueDate = new Date(new Date(o.createdAt).getTime() + 14 * 86400000);

      return {
        id: `INV-${o.orderNumber}`,
        orderId: o.id,
        customerName: o.customerName,
        total: o.total,
        createdAt: o.createdAt,
        dueDate,
        status: invoiceStatus,
      };
    });
  }, [orders]);

  const filtered = useMemo(() => {
    return invoices.filter((inv) => {
      const matchesSearch =
        inv.id.toLowerCase().includes(search.toLowerCase()) ||
        inv.customerName.toLowerCase().includes(search.toLowerCase());
      const matchesStatus = statusFilter === "all" || inv.status === statusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [invoices, search, statusFilter]);

  const statusCounts = useMemo(() => {
    const counts = { all: invoices.length, paid: 0, pending: 0, overdue: 0 };
    for (const inv of invoices) counts[inv.status]++;
    return counts;
  }, [invoices]);

  const handlePrint = (invoiceId: string) => {
    // Find the order and open print dialog
    const inv = invoices.find((i) => i.id === invoiceId);
    if (inv) {
      window.open(`/dashboard/invoices/${inv.orderId}?print=true`, "_blank");
    }
  };

  return (
    <div>
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between" style={{ marginBottom: "var(--haze-section-gap, 24px)" }}>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Invoices</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage billing invoices and payment tracking</p>
        </div>
      </div>

      {/* Filters */}
      <div className="space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-1 items-center gap-3">
            <div className="relative w-full max-w-xs">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search invoices..."
                className="h-8 pl-8 text-sm rounded-lg"
              />
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {(["all", "paid", "pending", "overdue"] as const).map((s) => (
              <Button
                key={s}
                variant={statusFilter === s ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter(s)}
                className="h-7 text-xs capitalize rounded-lg gap-1"
              >
                {s}
                <span className="text-[10px] opacity-60">({statusCounts[s]})</span>
              </Button>
            ))}
          </div>
        </div>

        {/* Table */}
        <div className="rounded-[var(--radius-card-lg,20px)] border border-border bg-card shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left">
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Invoice</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Customer</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground text-right">Amount</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Due Date</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((inv) => (
                  <tr key={inv.id} className="hover:bg-muted/30 transition-colors group">
                    <td className="px-4 py-3">
                      <Link
                        href={`/dashboard/invoices/${inv.orderId}`}
                        className="flex items-center gap-2 no-underline"
                      >
                        <FileText className="h-4 w-4 text-primary shrink-0" />
                        <span className="font-mono font-semibold text-foreground text-sm">{inv.id}</span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-foreground">
                      {inv.customerName}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${
                          inv.status === "paid"
                            ? "bg-green-500/10 text-green-600 dark:text-green-400"
                            : inv.status === "pending"
                              ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
                              : "bg-red-500/10 text-red-600 dark:text-red-400"
                        }`}
                      >
                        {inv.status === "paid" ? (
                          <CheckCircle className="h-3 w-3" />
                        ) : inv.status === "pending" ? (
                          <Clock className="h-3 w-3" />
                        ) : (
                          <AlertTriangle className="h-3 w-3" />
                        )}
                        {inv.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-foreground text-right">
                      {formatCurrency(inv.total)}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {inv.dueDate.toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          onClick={() => handlePrint(inv.id)}
                          title="Print"
                        >
                          <Printer className="h-3.5 w-3.5" />
                        </Button>
                        <Link href={`/dashboard/invoices/${inv.orderId}`}>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            title="View"
                          >
                            <ChevronRight className="h-3.5 w-3.5" />
                          </Button>
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}

                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-16 text-center text-muted-foreground text-sm">
                      No invoices match your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-border px-4 py-3">
            <p className="text-xs text-muted-foreground">
              Showing {filtered.length} of {invoices.length} invoices
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
