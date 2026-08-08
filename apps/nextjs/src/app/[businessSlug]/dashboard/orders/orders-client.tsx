"use client";

import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Package,
  Search,
  ChevronDown,
  ChevronUp,
  Clock,
  CheckCircle2,
  Truck,
  XCircle,
  CreditCard,
  RotateCcw,
  MessageSquare,
  Loader2,
} from "lucide-react";

import { Badge } from "@acme/ui/badge";
import { Button } from "@acme/ui/button";
import { Input } from "@acme/ui/input";
import { Skeleton } from "@acme/ui/skeleton";
import { toast } from "@acme/ui/toast";
import { cn } from "@acme/ui";
import { useTRPC } from "~/trpc/react";
import { OrderStatusTimeline } from "./_components/order-status-timeline";

const UPDATABLE_STATUSES = ["pending", "confirmed", "paid", "shipped", "delivered", "cancelled", "returned"] as const;
const NOTIFIES_CUSTOMER = new Set(["shipped", "delivered", "cancelled", "returned"]);

type Order = {
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
  channel: string | null;
  paymentMethod: string | null;
  notes: string | null;
  createdAt: Date;
};

type OrderItem = {
  id: string;
  orderId: string;
  name: string;
  variantTitle: string | null;
  sku: string | null;
  qty: number;
  unitPrice: number;
  lineTotal: number;
  imageUrl: string | null;
};

const STATUS_CONFIG: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" | "success"; icon: typeof Clock }> = {
  pending:   { label: "Pending",   variant: "secondary",    icon: Clock },
  confirmed: { label: "Confirmed", variant: "default",      icon: CheckCircle2 },
  paid:      { label: "Paid",      variant: "default",      icon: CreditCard },
  shipped:   { label: "Shipped",   variant: "default",      icon: Truck },
  delivered: { label: "Delivered", variant: "success",      icon: CheckCircle2 },
  cancelled: { label: "Cancelled", variant: "destructive",  icon: XCircle },
  returned:  { label: "Returned",  variant: "destructive",  icon: RotateCcw },
};

const ALL_STATUSES = ["all", "pending", "confirmed", "paid", "shipped", "delivered", "cancelled", "returned"];

function formatCurrency(amount: number) {
  return `৳${amount.toLocaleString()}`;
}

function formatDate(date: Date) {
  return new Date(date).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function channelLabel(channel: string | null) {
  if (!channel) return null;
  const map: Record<string, string> = {
    instagram: "Instagram",
    whatsapp: "WhatsApp",
    messenger: "Messenger",
    web: "Web",
  };
  return map[channel] ?? channel;
}

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  bkash: "bKash",
  nagad: "Nagad",
  card: "Card",
  sslcommerz: "Card/Online",
  cod: "Cash on Delivery",
};

export function OrdersClient() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const { data, isPending } = useQuery(trpc.orders.list.queryOptions({}));
  const initialOrders = data?.orders ?? [];
  const initialItems = data?.items ?? [];
  const updateStatusMutation = useMutation(trpc.orders.updateStatus.mutationOptions());
  const [updatingOrderId, setUpdatingOrderId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);

  async function handleStatusChange(orderId: string, newStatus: (typeof UPDATABLE_STATUSES)[number], channel: string | null) {
    setUpdatingOrderId(orderId);
    try {
      await updateStatusMutation.mutateAsync({ id: orderId, status: newStatus });
      const canNotify = channel === "facebook_page" || channel === "instagram" || channel === "whatsapp";
      toast.success(
        NOTIFIES_CUSTOMER.has(newStatus) && canNotify
          ? `Order marked ${newStatus} — customer notified`
          : `Order marked ${newStatus}`,
      );
      void qc.invalidateQueries({ queryKey: trpc.orders.list.queryKey() });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update order status");
    } finally {
      setUpdatingOrderId(null);
    }
  }

  const itemsByOrder = useMemo(() => {
    const map = new Map<string, OrderItem[]>();
    for (const item of initialItems) {
      const arr = map.get(item.orderId) ?? [];
      arr.push(item);
      map.set(item.orderId, arr);
    }
    return map;
  }, [initialItems]);

  const filtered = useMemo(() => {
    return initialOrders.filter((o) => {
      if (statusFilter !== "all" && o.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          o.orderNumber.toLowerCase().includes(q) ||
          o.customerName.toLowerCase().includes(q) ||
          (o.customerPhone ?? "").toLowerCase().includes(q) ||
          (o.channel ?? "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [initialOrders, search, statusFilter]);

  const stats = useMemo(() => {
    const total = initialOrders.length;
    const pending = initialOrders.filter((o) => o.status === "pending").length;
    const delivered = initialOrders.filter((o) => o.status === "delivered").length;
    const revenue = initialOrders
      .filter((o) => o.status !== "cancelled" && o.status !== "returned")
      .reduce((sum, o) => sum + o.total, 0);
    return { total, pending, delivered, revenue };
  }, [initialOrders]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Orders</h1>
        <p className="text-muted-foreground mt-1 text-base">
          Track and manage customer orders.
        </p>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "Total Orders", value: stats.total, color: "from-(--chart-4)/10 to-(--chart-4)/5", text: "text-(--chart-4)" },
          { label: "Pending", value: stats.pending, color: "from-(--warning)/10 to-(--warning)/5", text: "text-(--warning)" },
          { label: "Delivered", value: stats.delivered, color: "from-(--success)/10 to-(--success)/5", text: "text-(--success)" },
          { label: "Revenue", value: formatCurrency(stats.revenue), color: "from-(--chart-5)/10 to-(--chart-5)/5", text: "text-(--chart-5)" },
        ].map((s) => (
          <div
            key={s.label}
            className={cn(
              "rounded-2xl border bg-gradient-to-br p-4 transition-shadow hover:shadow-md",
              s.color,
            )}
          >
            <p className="text-xs font-medium text-muted-foreground">{s.label}</p>
            {isPending ? (
              <Skeleton className="mt-1.5 h-7 w-16" />
            ) : (
              <p className={cn("mt-1 text-2xl font-bold tabular-nums", s.text)}>
                {s.value}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search orders by number, customer, phone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {ALL_STATUSES.map((s) => (
            <Button
              key={s}
              variant={statusFilter === s ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(s)}
              className="text-xs capitalize"
            >
              {s === "all" ? "All" : s}
            </Button>
          ))}
        </div>
      </div>

      {/* Orders List */}
      {isPending ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 rounded-2xl border bg-card p-4">
              <Skeleton className="h-10 w-10 shrink-0 rounded-xl" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-28" />
              </div>
              <div className="hidden space-y-2 text-right sm:block">
                <Skeleton className="ml-auto h-5 w-16" />
                <Skeleton className="ml-auto h-3 w-20" />
              </div>
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed py-16">
          <Package className="h-12 w-12 text-muted-foreground/40" />
          <p className="mt-4 text-lg font-medium text-muted-foreground">
            No orders found
          </p>
          <p className="text-sm text-muted-foreground/60">
            {search || statusFilter !== "all"
              ? "Try adjusting your filters"
              : "Orders will appear here when customers place them"}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((o) => {
            const config = STATUS_CONFIG[o.status] ?? STATUS_CONFIG.pending!;
            const StatusIcon = config.icon;
            const isExpanded = expandedOrder === o.id;
            const items = itemsByOrder.get(o.id) ?? [];
            const channel = channelLabel(o.channel);

            return (
              <div
                key={o.id}
                className="overflow-hidden rounded-2xl border bg-card transition-shadow hover:shadow-md"
              >
                {/* Order Header */}
                <button
                  onClick={() => setExpandedOrder(isExpanded ? null : o.id)}
                  className="flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-muted/30"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                    <Package className="h-5 w-5 text-primary" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground">
                        #{o.orderNumber}
                      </span>
                      <Badge variant={config.variant} className="gap-1">
                        <StatusIcon className="h-3 w-3" />
                        {config.label}
                      </Badge>
                      {channel && (
                        <Badge variant="outline" className="gap-1 text-[10px]">
                          <MessageSquare className="h-3 w-3" />
                          {channel}
                        </Badge>
                      )}
                      {o.paymentMethod && (
                        <Badge variant="outline" className="gap-1 text-[10px]">
                          <CreditCard className="h-3 w-3" />
                          {PAYMENT_METHOD_LABEL[o.paymentMethod] ?? o.paymentMethod}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {o.customerName}
                      {o.customerPhone && ` · ${o.customerPhone}`}
                    </p>
                  </div>

                  <div className="hidden text-right sm:block">
                    <p className="text-lg font-bold tabular-nums text-foreground">
                      {formatCurrency(o.total)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(o.createdAt)}
                    </p>
                  </div>

                  {isExpanded ? (
                    <ChevronUp className="h-5 w-5 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground" />
                  )}
                </button>

                {/* Expanded Detail */}
                {isExpanded && (
                  <div className="border-t bg-muted/20 px-4 py-4">
                    {/* Fulfillment status */}
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Update Status
                        </span>
                        {updatingOrderId === o.id && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                      </div>
                      <select
                        value={o.status}
                        disabled={updatingOrderId === o.id}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => handleStatusChange(o.id, e.target.value as (typeof UPDATABLE_STATUSES)[number], o.channel)}
                        className="rounded-lg border bg-background px-3 py-1.5 text-xs font-semibold capitalize outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {UPDATABLE_STATUSES.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                    {(o.channel === "facebook_page" || o.channel === "instagram" || o.channel === "whatsapp") && (
                      <p className="mb-4 text-xs text-muted-foreground">
                        Changing to Shipped, Delivered, Cancelled, or Returned sends the customer a message on {channelLabel(o.channel)}.
                      </p>
                    )}

                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                      {/* Customer Info */}
                      <div className="space-y-1.5">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Customer
                        </h4>
                        <p className="text-sm font-medium">{o.customerName}</p>
                        {o.customerPhone && (
                          <p className="text-sm text-muted-foreground">{o.customerPhone}</p>
                        )}
                        {o.customerEmail && (
                          <p className="text-sm text-muted-foreground">{o.customerEmail}</p>
                        )}
                      </div>

                      {/* Shipping */}
                      <div className="space-y-1.5">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Shipping
                        </h4>
                        <p className="text-sm">
                          {o.shippingAddress ?? "N/A"}
                        </p>
                        {o.shippingDistrict && (
                          <p className="text-sm text-muted-foreground">
                            District: {o.shippingDistrict}
                          </p>
                        )}
                      </div>

                      {/* Pricing */}
                      <div className="space-y-1.5">
                        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Breakdown
                        </h4>
                        <div className="space-y-0.5 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Payment Method</span>
                            <span>{o.paymentMethod ? (PAYMENT_METHOD_LABEL[o.paymentMethod] ?? o.paymentMethod) : "—"}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Subtotal</span>
                            <span>{formatCurrency(o.subtotal)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">Shipping</span>
                            <span>{formatCurrency(o.shippingCost)}</span>
                          </div>
                          {o.discountAmount > 0 && (
                            <div className="flex justify-between text-(--success)">
                              <span>Discount{o.couponCode ? ` (${o.couponCode})` : ""}</span>
                              <span>-{formatCurrency(o.discountAmount)}</span>
                            </div>
                          )}
                          <div className="flex justify-between border-t pt-1 font-bold">
                            <span>Total</span>
                            <span>{formatCurrency(o.total)}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Line Items */}
                    {items.length > 0 && (
                      <div className="mt-4">
                        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          Items ({items.length})
                        </h4>
                        <div className="space-y-2">
                          {items.map((item) => (
                            <div
                              key={item.id}
                              className="flex items-center gap-3 rounded-xl bg-background p-3"
                            >
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                                {item.imageUrl ? (
                                  <img
                                    src={item.imageUrl}
                                    alt={item.name}
                                    className="h-10 w-10 rounded-lg object-cover"
                                  />
                                ) : (
                                  <Package className="h-4 w-4 text-muted-foreground" />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium truncate">{item.name}</p>
                                {item.variantTitle && (
                                  <p className="text-xs text-muted-foreground">
                                    {item.variantTitle}
                                    {item.sku && ` · SKU: ${item.sku}`}
                                  </p>
                                )}
                              </div>
                              <div className="text-right text-sm">
                                <p className="font-medium">
                                  {item.qty} × {formatCurrency(item.unitPrice)}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {formatCurrency(item.lineTotal)}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {o.notes && (
                      <div className="mt-4 rounded-xl bg-(--warning)/10 p-3 text-sm text-(--warning)">
                        <strong>Note:</strong> {o.notes}
                      </div>
                    )}

                    <div className="mt-4 border-t pt-3">
                      <OrderStatusTimeline orderId={o.id} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
