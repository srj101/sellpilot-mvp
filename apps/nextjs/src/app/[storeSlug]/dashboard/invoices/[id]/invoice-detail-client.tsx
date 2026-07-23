"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import {
  ArrowLeft,
  Printer,
  Trash2,
  CheckCircle,
  Clock,
  AlertTriangle,
  Building,
  Calendar,
  CreditCard,
  User,
  Check,
} from "lucide-react";

import { Button } from "@acme/ui/button";
import { useTRPC } from "~/trpc/react";
import { useStoreSlug } from "~/hooks/use-store-slug";
import { formatCurrency } from "../../(home)/_components/dashboard-utils";

type OrderItem = {
  id: string;
  name: string;
  variantTitle: string | null;
  sku: string | null;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  imageUrl: string | null;
};

type InvoiceDetail = {
  id: string;
  orderNumber: string;
  status: string;
  subtotal: number;
  shippingCost: number;
  discountAmount: number;
  total: number;
  customerName: string;
  customerPhone: string | null;
  customerEmail: string | null;
  shippingAddress: string | null;
  shippingDistrict: string | null;
  couponCode: string | null;
  paymentMethod: string | null;
  createdAt: string;
  items: OrderItem[];
};

export function InvoiceDetailClient({ invoice }: { invoice: InvoiceDetail }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const trpc = useTRPC();
  const storeSlug = useStoreSlug();

  const updateStatusMutation = useMutation(trpc.orders.updateStatus.mutationOptions());
  const deleteMutation = useMutation(trpc.orders.delete.mutationOptions());

  const [status, setStatus] = useState(invoice.status);
  const [isUpdating, setIsUpdating] = useState(false);

  // Automatically trigger print dialog if print parameter exists
  useEffect(() => {
    if (searchParams.get("print") === "true") {
      window.print();
    }
  }, [searchParams]);

  const handlePrint = () => {
    window.print();
  };

  const handleStatusChange = async (newStatus: string) => {
    setIsUpdating(true);
    try {
      await updateStatusMutation.mutateAsync({
        id: invoice.id,
        status: newStatus,
      });
      setStatus(newStatus);
      router.refresh();
    } catch (err) {
      alert("Failed to update status");
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async () => {
    if (confirm("Are you sure you want to delete this invoice/order?")) {
      try {
        await deleteMutation.mutateAsync({ id: invoice.id });
        router.push(`/${storeSlug}/dashboard/invoices`);
        router.refresh();
      } catch (err) {
        alert("Failed to delete invoice");
      }
    }
  };

  // Derived fields
  const invoiceId = `INV-${invoice.orderNumber}`;
  const createdDate = new Date(invoice.createdAt);
  const dueDate = new Date(createdDate.getTime() + 14 * 86400000);

  return (
    <div className="space-y-6 max-w-4xl mx-auto print:p-0 print:border-none print:shadow-none">
      {/* Back button and actions bar - hide during print */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <Link
          href={`/${storeSlug}/dashboard/invoices`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Invoices
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          {/* Status selector */}
          <div className="flex items-center gap-1.5 border border-border rounded-lg bg-card px-2.5 py-1">
            <span className="text-xs text-muted-foreground font-medium">Status:</span>
            <select
              value={status}
              disabled={isUpdating}
              onChange={(e) => handleStatusChange(e.target.value)}
              className="text-xs font-semibold bg-transparent border-none outline-none text-foreground cursor-pointer"
            >
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
              <option value="shipped">Shipped</option>
              <option value="delivered">Delivered</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </div>

          <Button variant="outline" size="sm" onClick={handlePrint} className="h-8 gap-1.5 text-xs">
            <Printer className="h-4 w-4" />
            Print
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleDelete}
            className="h-8 gap-1.5 text-xs text-red-500 hover:text-red-600 hover:bg-red-500/10 border-red-500/20"
          >
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
        </div>
      </div>

      {/* Invoice Card */}
      <div className="bg-card border border-border rounded-[28px] shadow-sm overflow-hidden print:border-none print:shadow-none">
        {/* Decorative Top Accent Line - hide on print */}
        <div className="h-1.5 bg-gradient-to-r from-primary to-primary-lighter print:hidden" />

        <div className="p-8 space-y-8">
          {/* Row 1: Header / Logo & Invoice Info */}
          <div className="flex flex-col gap-6 md:flex-row md:justify-between md:items-start border-b border-border pb-8">
            <div className="space-y-2">
              <div className="flex items-center gap-2.5">
                <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-white font-bold text-lg">
                  S
                </div>
                <span className="text-xl font-bold tracking-tight text-foreground">SellPilot</span>
              </div>
              <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">
                Empowering meta messaging commerce. Automated checkouts, tracking, & AI recommendation.
              </p>
            </div>

            <div className="text-left md:text-right space-y-1">
              <div className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize bg-primary/10 text-primary">
                {status}
              </div>
              <h2 className="text-2xl font-mono font-bold text-foreground tracking-tight">{invoiceId}</h2>
              <p className="text-xs text-muted-foreground">Order ID: {invoice.id.slice(0, 8)}</p>
            </div>
          </div>

          {/* Row 2: Addresses & Dates */}
          <div className="grid gap-6 grid-cols-1 md:grid-cols-3">
            {/* Bill To */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <User className="h-3.5 w-3.5" />
                Bill To
              </div>
              <div className="text-sm font-semibold text-foreground">{invoice.customerName}</div>
              <div className="text-xs text-muted-foreground space-y-1">
                {invoice.customerEmail && <p>{invoice.customerEmail}</p>}
                {invoice.customerPhone && <p>{invoice.customerPhone}</p>}
              </div>
            </div>

            {/* Ship To */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <Building className="h-3.5 w-3.5" />
                Ship To
              </div>
              <div className="text-sm font-semibold text-foreground capitalize">
                {invoice.shippingDistrict || "General Delivery"}
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {invoice.shippingAddress || "No shipping address provided."}
              </p>
            </div>

            {/* Dates & Payments */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                <Calendar className="h-3.5 w-3.5" />
                Invoice Details
              </div>
              <div className="text-xs text-foreground space-y-1">
                <div className="flex justify-between md:justify-start md:gap-4">
                  <span className="text-muted-foreground">Issue Date:</span>
                  <span className="font-medium">
                    {createdDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                </div>
                <div className="flex justify-between md:justify-start md:gap-4">
                  <span className="text-muted-foreground">Due Date:</span>
                  <span className="font-medium">
                    {dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </span>
                </div>
                <div className="flex justify-between md:justify-start md:gap-4 items-center">
                  <span className="text-muted-foreground">Payment:</span>
                  <span className="font-semibold uppercase tracking-wider flex items-center gap-1 text-[10px] bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                    <CreditCard className="h-3 w-3" />
                    {invoice.paymentMethod || "COD"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Row 3: Items Table */}
          <div className="border border-border rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-left">
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Item Description</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground text-center w-16">Qty</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground text-right w-24">Price</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground text-right w-28">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {invoice.items.map((item) => (
                  <tr key={item.id} className="hover:bg-muted/10 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-foreground text-sm">{item.name}</p>
                      {item.variantTitle && (
                        <p className="text-xs text-muted-foreground mt-0.5">Variant: {item.variantTitle}</p>
                      )}
                      {item.sku && (
                        <p className="text-[10px] font-mono text-muted-foreground mt-0.5">SKU: {item.sku}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center text-muted-foreground">{item.qty}</td>
                    <td className="px-4 py-3 text-right font-medium text-muted-foreground">
                      {formatCurrency(item.unitPrice)}
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-foreground">
                      {formatCurrency(item.lineTotal)}
                    </td>
                  </tr>
                ))}

                {invoice.items.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                      No items in this invoice.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Row 4: Totals Summary */}
          <div className="flex flex-col md:flex-row md:justify-between items-start gap-6 border-t border-border pt-6">
            {/* Payment status notice */}
            <div className="max-w-xs space-y-1.5">
              <h4 className="text-xs font-semibold text-foreground uppercase tracking-wider">Payment Instructions</h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Thank you for your business. Please complete the payment via {invoice.paymentMethod || "COD"} before the due date. For payment support, reach out to contact@sellpilot.com.
              </p>
            </div>

            {/* Pricing Summary */}
            <div className="w-full md:w-80 space-y-2 text-sm">
              <div className="flex justify-between text-muted-foreground">
                <span>Subtotal</span>
                <span className="font-medium text-foreground">{formatCurrency(invoice.subtotal)}</span>
              </div>
              {invoice.shippingCost > 0 && (
                <div className="flex justify-between text-muted-foreground">
                  <span>Shipping Cost</span>
                  <span className="font-medium text-foreground">+{formatCurrency(invoice.shippingCost)}</span>
                </div>
              )}
              {invoice.discountAmount > 0 && (
                <div className="flex justify-between text-green-600 dark:text-green-400">
                  <span>Discount {invoice.couponCode ? `(${invoice.couponCode})` : ""}</span>
                  <span className="font-medium">-{formatCurrency(invoice.discountAmount)}</span>
                </div>
              )}
              <div className="border-t border-border my-2 pt-2 flex justify-between text-base font-bold text-foreground">
                <span>Total Amount</span>
                <span className="text-primary">{formatCurrency(invoice.total)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
