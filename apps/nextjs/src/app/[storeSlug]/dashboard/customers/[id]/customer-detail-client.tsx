"use client";

import Link from "next/link";
import {
  ArrowLeft,
  Mail,
  Phone,
  MapPin,
  Calendar,
  ShoppingBag,
  DollarSign,
  TrendingUp,
  StickyNote,
  Package,
} from "lucide-react";

import { Button } from "@acme/ui/button";
import { formatCurrency, initials, avatarColor } from "../../(home)/_components/dashboard-utils";
import { useStoreSlug } from "~/hooks/use-store-slug";

type Order = {
  id: string;
  orderNumber: string;
  status: string;
  total: number;
  customerName: string;
  createdAt: string;
};

type CustomerDetail = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  district: string | null;
  country: string | null;
  notes: string | null;
  totalOrders: number;
  totalSpent: number;
  createdAt: string;
  recentOrders: Order[];
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  confirmed: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  paid: "bg-green-500/10 text-green-600 dark:text-green-400",
  shipped: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  delivered: "bg-green-500/10 text-green-600 dark:text-green-400",
  cancelled: "bg-red-500/10 text-red-600 dark:text-red-400",
  returned: "bg-red-500/10 text-red-600 dark:text-red-400",
};

export function CustomerDetailClient({ customer }: { customer: CustomerDetail }) {
  const storeSlug = useStoreSlug();
  const aov = customer.totalOrders > 0 ? customer.totalSpent / customer.totalOrders : 0;

  return (
    <div>
      {/* Back Button + Header */}
      <div className="mb-6">
        <Link href={`/${storeSlug}/dashboard/customers`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4">
          <ArrowLeft className="h-4 w-4" />
          Back to Customers
        </Link>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Customer Details</h1>
            <p className="mt-1 text-sm text-muted-foreground">View customer information and order history</p>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[340px_1fr]">
        {/* Left Column – Customer Overview Card */}
        <div className="space-y-6">
          {/* Profile Card */}
          <div className="rounded-[var(--radius-card-lg,20px)] border border-border bg-card p-6 shadow-sm">
            <div className="flex flex-col items-center text-center">
              <span className={`flex h-16 w-16 items-center justify-center rounded-full text-xl font-bold text-white ${avatarColor(customer.name)}`}>
                {initials(customer.name)}
              </span>
              <h2 className="mt-4 text-lg font-semibold text-foreground">{customer.name}</h2>
              <span className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                customer.totalOrders > 0
                  ? "bg-green-500/10 text-green-600 dark:text-green-400"
                  : "bg-gray-500/10 text-gray-500"
              }`}>
                <span className={`h-1.5 w-1.5 rounded-full ${customer.totalOrders > 0 ? "bg-green-500" : "bg-gray-400"}`} />
                {customer.totalOrders > 0 ? "Active" : "Inactive"}
              </span>
            </div>

            <div className="mt-6 space-y-3">
              {customer.email && (
                <div className="flex items-center gap-3 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-foreground truncate">{customer.email}</span>
                </div>
              )}
              {customer.phone && (
                <div className="flex items-center gap-3 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-foreground">{customer.phone}</span>
                </div>
              )}
              {(customer.district || customer.country) && (
                <div className="flex items-center gap-3 text-sm">
                  <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-foreground capitalize">
                    {[customer.address, customer.district, customer.country].filter(Boolean).join(", ")}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-3 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">
                  Joined {new Date(customer.createdAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                </span>
              </div>
            </div>
          </div>

          {/* Notes Card */}
          <div className="rounded-[var(--radius-card-lg,20px)] border border-border bg-card p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <StickyNote className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-foreground">Notes</h3>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {customer.notes || "No notes added yet."}
            </p>
          </div>
        </div>

        {/* Right Column – Stats + Orders */}
        <div className="space-y-6">
          {/* Stats Grid */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-[var(--radius-card-lg,20px)] border border-border bg-card p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                  <DollarSign className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Total Spent</p>
                  <p className="text-xl font-bold text-foreground">{formatCurrency(customer.totalSpent)}</p>
                </div>
              </div>
            </div>
            <div className="rounded-[var(--radius-card-lg,20px)] border border-border bg-card p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10">
                  <ShoppingBag className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Total Orders</p>
                  <p className="text-xl font-bold text-foreground">{customer.totalOrders}</p>
                </div>
              </div>
            </div>
            <div className="rounded-[var(--radius-card-lg,20px)] border border-border bg-card p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10">
                  <TrendingUp className="h-5 w-5 text-violet-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground font-medium">Avg. Order Value</p>
                  <p className="text-xl font-bold text-foreground">{formatCurrency(aov)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Orders Table */}
          <div className="rounded-[var(--radius-card-lg,20px)] border border-border bg-card shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold text-foreground">Recent Orders</h3>
              </div>
              <span className="text-xs text-muted-foreground">{customer.recentOrders.length} orders</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left">
                    <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Order #</th>
                    <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Date</th>
                    <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-3 text-xs font-medium text-muted-foreground text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {customer.recentOrders.map((order) => (
                    <tr key={order.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-mono text-sm font-semibold text-foreground">
                        #{order.orderNumber}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {new Date(order.createdAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${
                          STATUS_COLORS[order.status] ?? "bg-gray-500/10 text-gray-500"
                        }`}>
                          {order.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-foreground text-right">
                        {formatCurrency(order.total)}
                      </td>
                    </tr>
                  ))}

                  {customer.recentOrders.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-12 text-center text-muted-foreground text-sm">
                        No orders yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
