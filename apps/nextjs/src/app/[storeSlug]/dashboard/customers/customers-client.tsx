"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Search,
  Plus,
  ChevronRight,
  MoreHorizontal,
} from "lucide-react";

import { Button } from "@acme/ui/button";
import { Input } from "@acme/ui/input";
import { initials, avatarColor, formatCurrency } from "../(home)/_components/dashboard-utils";
import { useStoreSlug } from "~/hooks/use-store-slug";

type Customer = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  district: string | null;
  country: string | null;
  totalOrders: number;
  totalSpent: number;
  createdAt: string | Date;
};

export function CustomersClient({ initialCustomers }: { initialCustomers: Customer[] }) {
  const storeSlug = useStoreSlug();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");

  const filtered = initialCustomers.filter((c) => {
    const s = search.toLowerCase();
    const matchSearch =
      c.name.toLowerCase().includes(s) ||
      (c.phone && c.phone.includes(s)) ||
      (c.email && c.email.toLowerCase().includes(s)) ||
      (c.district && c.district.toLowerCase().includes(s));

    if (statusFilter === "all") return matchSearch;
    const isActive = c.totalOrders > 0;
    return matchSearch && (statusFilter === "active" ? isActive : !isActive);
  });

  return (
    <div>
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between" style={{ marginBottom: "var(--haze-section-gap, 24px)" }}>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage your customer database</p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" className="h-8 gap-1.5 px-2.5">
            <Plus className="mr-1 h-4 w-4" />
            New Customer
          </Button>
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
                placeholder="Search customers..."
                className="h-8 pl-8 text-sm rounded-lg"
              />
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {(["all", "active", "inactive"] as const).map((s) => (
              <Button
                key={s}
                variant={statusFilter === s ? "default" : "outline"}
                size="sm"
                onClick={() => setStatusFilter(s)}
                className="h-7 text-xs capitalize rounded-lg"
              >
                {s}
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
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Name</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Email</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground">Location</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground text-right">Total Orders</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground text-right">Total Spent</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground text-center">Status</th>
                  <th className="px-4 py-3 text-xs font-medium text-muted-foreground w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((c) => {
                  const isActive = c.totalOrders > 0;
                  return (
                    <tr key={c.id} className="hover:bg-muted/30 transition-colors group">
                      <td className="px-4 py-3">
                        <Link href={`/${storeSlug}/dashboard/customers/${c.id}`} className="flex items-center gap-3 no-underline">
                          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${avatarColor(c.name)}`}>
                            {initials(c.name)}
                          </span>
                          <div>
                            <p className="font-semibold text-foreground text-sm">{c.name}</p>
                            {c.phone && (
                              <p className="text-xs text-muted-foreground">{c.phone}</p>
                            )}
                          </div>
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {c.email || "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-muted-foreground capitalize">
                        {[c.district, c.country].filter(Boolean).join(", ") || "—"}
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-foreground text-right">
                        {c.totalOrders}
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-foreground text-right">
                        {formatCurrency(c.totalSpent)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          isActive
                            ? "bg-green-500/10 text-green-600 dark:text-green-400"
                            : "bg-gray-500/10 text-gray-500"
                        }`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${isActive ? "bg-green-500" : "bg-gray-400"}`} />
                          {isActive ? "Active" : "Inactive"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Link href={`/${storeSlug}/dashboard/customers/${c.id}`}>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  );
                })}

                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-16 text-center text-muted-foreground text-sm">
                      No customers match your query.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-border px-4 py-3">
            <p className="text-xs text-muted-foreground">
              Showing {filtered.length} of {initialCustomers.length} customers
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
