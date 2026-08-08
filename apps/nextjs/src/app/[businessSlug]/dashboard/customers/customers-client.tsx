"use client";

import type { ChangeEvent, FormEvent } from "react";
import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Loader2, Plus, Search } from "lucide-react";

import { cn } from "@acme/ui";
import { Button } from "@acme/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@acme/ui/dialog";
import { Input } from "@acme/ui/input";
import { Skeleton } from "@acme/ui/skeleton";
import { toast } from "@acme/ui/toast";

import { useBusinessSlug } from "~/hooks/use-business-slug";
import { useTRPC } from "~/trpc/react";
import { avatarColor, formatCurrency, initials } from "../(home)/_components/dashboard-utils";

export function CustomersClient() {
  const trpc = useTRPC();
  const qc = useQueryClient();
  const businessSlug = useBusinessSlug();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "",
    phone: "",
    email: "",
    district: "",
    country: "",
  });
  const [cursor, setCursor] = useState<string | undefined>(undefined);

  const { data, isPending } = useQuery(
    trpc.customers.list.queryOptions()
  );
  const customers = (data as any[]) ?? [];

  const createCustomer = useMutation(
    trpc.customers.create.mutationOptions({
      onSuccess: () => {
        setIsCreateDialogOpen(false);
        setCreateForm({ name: "", phone: "", email: "", district: "", country: "" });
        void qc.invalidateQueries({
          queryKey: trpc.customers.list.queryKey(),
        });
        toast.success("Customer created");
      },
      onError: (err) => toast.error(err.message),
    })
  );

  const handleCreateSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    createCustomer.mutate(createForm);
  };

  const handleLoadMore = () => {};

  const handleSearchChange = (e: ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value);
  };

  const handleStatusChange = (s: "all" | "active" | "inactive") => {
    setStatusFilter(s);
  };

  return (
    <div>
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between" style={{ marginBottom: "var(--haze-section-gap, 24px)" }}>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Customers</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage your customer database</p>
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="h-8 gap-1.5 px-2.5">
                <Plus className="mr-1 h-4 w-4" />
                New Customer
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>New Customer</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreateSubmit}>
                <div className="grid gap-4 py-4">
                  <div className="space-y-2">
                    <label htmlFor="name" className="text-sm font-medium">
                      Name *
                    </label>
                    <Input
                      id="name"
                      value={createForm.name}
                      onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                      placeholder="Customer name"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="phone" className="text-sm font-medium">
                      Phone
                    </label>
                    <Input
                      id="phone"
                      value={createForm.phone}
                      onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                      placeholder="+8801XXXXXXXXX"
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="email" className="text-sm font-medium">
                      Email
                    </label>
                    <Input
                      id="email"
                      type="email"
                      value={createForm.email}
                      onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                      placeholder="customer@example.com"
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="district" className="text-sm font-medium">
                      District
                    </label>
                    <Input
                      id="district"
                      value={createForm.district}
                      onChange={(e) => setCreateForm({ ...createForm, district: e.target.value })}
                      placeholder="Dhaka"
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="country" className="text-sm font-medium">
                      Country
                    </label>
                    <Input
                      id="country"
                      value={createForm.country}
                      onChange={(e) => setCreateForm({ ...createForm, country: e.target.value })}
                      placeholder="Bangladesh"
                    />
                  </div>
                </div>
                <DialogFooter className="gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsCreateDialogOpen(false)}
                    disabled={createCustomer.isPending}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createCustomer.isPending}>
                    {createCustomer.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
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
                onChange={handleSearchChange}
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
                onClick={() => handleStatusChange(s)}
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
                {isPending ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
                          <Skeleton className="h-4 w-28" />
                        </div>
                      </td>
                      <td className="px-4 py-3"><Skeleton className="h-4 w-32" /></td>
                      <td className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                      <td className="px-4 py-3 text-right"><Skeleton className="ml-auto h-4 w-8" /></td>
                      <td className="px-4 py-3 text-right"><Skeleton className="ml-auto h-4 w-16" /></td>
                      <td className="px-4 py-3 text-center"><Skeleton className="mx-auto h-5 w-16 rounded-full" /></td>
                      <td className="px-4 py-3" />
                    </tr>
                  ))
                ) : customers.map((c) => {
                  const isActive = c.totalOrders > 0;
                  return (
                    <tr key={c.id} className="hover:bg-muted/30 transition-colors group">
                      <td className="px-4 py-3">
                        <Link href={`/${businessSlug}/dashboard/customers/${c.id}`} className="flex items-center gap-3 no-underline">
                          <span
                            className={cn(
                              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white",
                              avatarColor(c.name),
                            )}
                          >
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
                        {c.email ?? "—"}
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
                        <Link href={`/${businessSlug}/dashboard/customers/${c.id}`}>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  );
                })}

                {!isPending && customers.length === 0 && (
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
              Showing {customers.length} customers
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
