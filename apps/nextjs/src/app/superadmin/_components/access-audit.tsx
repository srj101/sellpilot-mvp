"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Building2,
  ChevronRight,
  History,
  RefreshCw,
  Search,
  Shield,
  ShieldOff,
  Users,
} from "lucide-react";

import { cn } from "@acme/ui";
import { Badge } from "@acme/ui/badge";
import { Button } from "@acme/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@acme/ui/card";
import { Input } from "@acme/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeleton,
} from "@acme/ui/table";
import { toast } from "@acme/ui/toast";

import type { UserRow } from "./platform-users";
import { useTRPC } from "~/trpc/react";

const ACTION_COLORS: Record<string, string> = {
  "store.suspended": "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400",
  "store.reactivated": "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  "product.create": "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400",
  "order.update_status": "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400",
  "team.invite_member": "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
};

export function AccessAudit() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<"users" | "audit">("users");

  const { data: users = [], isLoading: usersLoading, refetch: refetchUsers } = useQuery(
    trpc.superadmin.listUsers.queryOptions(),
  );

  const { data: allLogs = [], isLoading: logsLoading, refetch: refetchLogs } = useQuery({
    ...trpc.superadmin.getAuditLogs.queryOptions({ limit: 100 }),
    refetchInterval: 30_000,
  });

  const setBanStatus = useMutation(
    trpc.superadmin.setBanStatus.mutationOptions({
      onSuccess: (_data, vars) => {
        toast.success(vars.banned ? "User banned" : "User unbanned");
        void queryClient.invalidateQueries({
          queryKey: trpc.superadmin.listUsers.queryKey(),
        });
        if (selectedUser?.id === vars.userId) {
          setSelectedUser((prev) =>
            prev
              ? {
                  ...prev,
                  banned: vars.banned,
                  banReason: vars.banReason ?? prev.banReason,
                }
              : null,
          );
        }
      },
      onError: (e: { message: string }) => toast.error(e.message),
    }),
  );

  const storesQuery = useQuery({
    ...trpc.superadmin.listStoresOfUser.queryOptions({
      userId: selectedUser?.id ?? "",
    }),
    enabled: Boolean(selectedUser),
  });

  const filteredUsers = useMemo(() => {
    return users.filter(
      (u) =>
        u.name.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase()),
    );
  }, [users, search]);

  const userLogs = useMemo(() => {
    if (!selectedUser) return [];
    return allLogs.filter(
      (l) =>
        l.actorName.toLowerCase() === selectedUser.name.toLowerCase() ||
        l.summary.toLowerCase().includes(selectedUser.name.toLowerCase()),
    );
  }, [allLogs, selectedUser]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">Access & Audit Trail</h1>
            <Badge variant="outline" className="border-primary/30 text-primary text-xs">
              Staff & Merchant Security
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Manage user accounts, inspect linked store memberships, and examine per-user audit trails.
          </p>
        </div>

        {/* View Switcher */}
        <div className="bg-card flex items-center gap-1 rounded-lg border p-1 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setActiveSubTab("users")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors",
              activeSubTab === "users"
                ? "bg-primary text-primary-foreground font-semibold"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Users className="h-3.5 w-3.5" />
            Users & Inline Audit
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab("audit")}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors",
              activeSubTab === "audit"
                ? "bg-primary text-primary-foreground font-semibold"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <History className="h-3.5 w-3.5" />
            Global Audit Stream
          </button>
        </div>
      </div>

      {activeSubTab === "users" ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
          {/* Left: User list */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold">Registered Accounts</h2>
                <p className="text-muted-foreground text-xs">
                  {users.length} registered platform users
                </p>
              </div>

              <Button
                variant="ghost"
                size="sm"
                className="h-8 gap-1 text-xs"
                onClick={() => void refetchUsers()}
              >
                <RefreshCw className="h-3 w-3" />
                Refresh
              </Button>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
              <Input
                placeholder="Search user by name or email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 pl-9 text-xs"
              />
            </div>

            {/* User rows */}
            <Card className="border-border/60 overflow-hidden">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 text-muted-foreground hover:bg-muted/40 text-xs">
                      <TableHead className="px-4 py-3 font-medium">User</TableHead>
                      <TableHead className="px-4 py-3 font-medium">Role</TableHead>
                      <TableHead className="px-4 py-3 font-medium">Status</TableHead>
                      <TableHead className="px-4 py-3 text-right font-medium">
                        Actions
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody className="divide-y text-xs">
                    {usersLoading && users.length === 0 ? (
                      <TableSkeleton columns={4} rows={6} />
                    ) : filteredUsers.length === 0 ? (
                      <TableEmpty colSpan={4}>No users found</TableEmpty>
                    ) : (
                      filteredUsers.map((u) => {
                        const isSelected = selectedUser?.id === u.id;
                        return (
                          <TableRow
                            key={u.id}
                            className={cn(
                              "hover:bg-muted/50 cursor-pointer transition-colors",
                              isSelected && "bg-muted/50 font-medium",
                            )}
                            onClick={() => setSelectedUser(u)}
                          >
                            <TableCell className="px-4 py-3">
                              <p className="text-foreground font-semibold">{u.name}</p>
                              <p className="text-muted-foreground text-[11px]">{u.email}</p>
                            </TableCell>
                            <TableCell className="px-4 py-3">
                              {u.role === "superadmin" ? (
                                <Badge className="bg-rose-500/10 text-rose-600 border-rose-500/20 text-[10px] gap-1">
                                  <Shield className="h-3 w-3" /> Superadmin
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px] capitalize">
                                  {u.role ?? "client"}
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="px-4 py-3">
                              {u.banned ? (
                                <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-600">
                                  Banned
                                </span>
                              ) : (
                                <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-medium text-green-600">
                                  Active
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="px-4 py-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                {u.banned ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 gap-1 text-xs text-emerald-600"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setBanStatus.mutate({
                                        userId: u.id,
                                        banned: false,
                                      });
                                    }}
                                    disabled={setBanStatus.isPending}
                                  >
                                    <Shield className="h-3 w-3" /> Unban
                                  </Button>
                                ) : u.role !== "superadmin" ? (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-destructive hover:text-destructive h-7 gap-1 text-xs"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setBanStatus.mutate({
                                        userId: u.id,
                                        banned: true,
                                        banReason: "Banned by superadmin via access console",
                                      });
                                    }}
                                    disabled={setBanStatus.isPending}
                                  >
                                    <ShieldOff className="h-3 w-3" /> Ban
                                  </Button>
                                ) : null}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 px-2"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedUser(u);
                                  }}
                                >
                                  <ChevronRight className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>

          {/* Right: User Detail, Stores & Inline Audit Trail */}
          <div className="space-y-4">
            {!selectedUser ? (
              <Card className="flex h-72 items-center justify-center border-dashed">
                <CardContent className="flex flex-col items-center gap-2 text-center">
                  <Users className="text-muted-foreground/40 h-8 w-8" />
                  <p className="text-muted-foreground text-xs">
                    Select an account on the left to view stores and audit history
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Account Details */}
                <Card className="border-border/60">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base">{selectedUser.name}</CardTitle>
                        <CardDescription className="text-xs">{selectedUser.email}</CardDescription>
                      </div>
                      <div className="bg-primary/10 text-primary flex h-9 w-9 items-center justify-center rounded-xl text-sm font-bold">
                        {selectedUser.name[0]?.toUpperCase() ?? "?"}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 text-xs">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Platform role</span>
                      <span className="font-semibold text-foreground capitalize">
                        {selectedUser.role ?? "client"}
                      </span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Account Status</span>
                      <span
                        className={cn(
                          "font-semibold",
                          selectedUser.banned ? "text-destructive" : "text-emerald-600",
                        )}
                      >
                        {selectedUser.banned ? "Banned" : "Active"}
                      </span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Member Since</span>
                      <span className="font-semibold text-foreground">
                        {new Date(selectedUser.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </CardContent>
                </Card>

                {/* Linked Stores */}
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    <Building2 className="h-3.5 w-3.5" />
                    <span>Store Memberships</span>
                  </div>

                  {storesQuery.isLoading ? (
                    <div className="space-y-2">
                      {[1, 2].map((i) => (
                        <div key={i} className="bg-muted h-14 animate-pulse rounded-lg" />
                      ))}
                    </div>
                  ) : (storesQuery.data ?? []).length === 0 ? (
                    <Card className="border-dashed p-4 text-center text-xs text-muted-foreground">
                      No merchant stores linked to this user.
                    </Card>
                  ) : (
                    <div className="space-y-2">
                      {(storesQuery.data ?? []).map((store) => (
                        <Card key={store.businessId} className="border-border/60">
                          <CardContent className="flex items-center justify-between p-3 text-xs">
                            <div>
                              <p className="font-semibold text-foreground">{store.name}</p>
                              <div className="text-muted-foreground font-mono text-[10px]">
                                /{store.slug} · <span className="capitalize">{store.memberRole}</span>
                              </div>
                            </div>
                            <Button asChild size="sm" variant="outline" className="h-7 px-2 text-xs gap-1">
                              <Link href={`/superadmin/stores/${store.businessId}`}>
                                Inspect
                                <ArrowUpRight className="h-3 w-3" />
                              </Link>
                            </Button>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>

                {/* User's Inline Audit Trail */}
                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <History className="h-3.5 w-3.5" />
                      <span>Audit Trail ({userLogs.length})</span>
                    </div>
                  </div>

                  {userLogs.length === 0 ? (
                    <Card className="border-dashed p-4 text-center text-xs text-muted-foreground">
                      No administrative audit entries logged for {selectedUser.name}.
                    </Card>
                  ) : (
                    <div className="space-y-2 max-h-72 overflow-y-auto">
                      {userLogs.map((log) => (
                        <div
                          key={log.id}
                          className="bg-card border rounded-lg p-2.5 text-xs space-y-1"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-[10px] text-muted-foreground">
                              {new Date(log.createdAt).toLocaleDateString()}
                            </span>
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[9px] font-mono",
                                ACTION_COLORS[log.action] ?? "text-muted-foreground",
                              )}
                            >
                              {log.action}
                            </Badge>
                          </div>
                          <p className="text-foreground text-[11px] font-medium">{log.summary}</p>
                          {log.businessName && (
                            <p className="text-muted-foreground text-[10px]">
                              Store: {log.businessName}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      ) : (
        /* Global Platform Audit Logs */
        <Card className="border-border/60 overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Immutable Audit Stream</CardTitle>
              <CardDescription className="text-xs">
                System-wide timeline of role modifications, bans, suspensions, and configurations
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => void refetchLogs()}
            >
              <RefreshCw className="h-3 w-3" />
              Refresh
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/40 text-muted-foreground hover:bg-muted/40 text-xs">
                  <TableHead className="px-4 py-3">Timestamp</TableHead>
                  <TableHead className="px-4 py-3">Actor</TableHead>
                  <TableHead className="px-4 py-3">Action</TableHead>
                  <TableHead className="px-4 py-3">Store Context</TableHead>
                  <TableHead className="px-4 py-3">Summary</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="text-xs divide-y">
                {logsLoading ? (
                  <TableSkeleton columns={5} rows={8} />
                ) : allLogs.length === 0 ? (
                  <TableEmpty colSpan={5}>No audit logs found</TableEmpty>
                ) : (
                  allLogs.map((log) => (
                    <TableRow key={log.id} className="hover:bg-muted/30">
                      <TableCell className="px-4 py-3 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                        {new Date(log.createdAt).toLocaleString()}
                      </TableCell>
                      <TableCell className="px-4 py-3 font-medium text-foreground">
                        {log.actorName}
                      </TableCell>
                      <TableCell className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] font-mono",
                            ACTION_COLORS[log.action] ?? "text-muted-foreground",
                          )}
                        >
                          {log.action}
                        </Badge>
                      </TableCell>
                      <TableCell className="px-4 py-3 text-muted-foreground">
                        {log.businessName ?? "—"}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-foreground font-medium">
                        {log.summary}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
