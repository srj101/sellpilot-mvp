"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Bug,
  Building2,
  ChevronRight,
  CreditCard,
  ExternalLink,
  LayoutDashboard,
  Search,
  Shield,
  ShieldOff,
  Store,
  Users,
} from "lucide-react";

import { cn } from "@acme/ui";
import { Button } from "@acme/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@acme/ui/card";
import { toast } from "@acme/ui/toast";

import type { SuperadminTab } from "./superadmin-sidebar";
import { useTRPC } from "~/trpc/react";
import { AiObservability } from "./ai-observability";
import { BugReports } from "./bug-reports";
import { ChannelHealth } from "./channel-health";
import { PlatformAuditLogs } from "./platform-audit-logs";
import { PlatformOverview } from "./platform-overview";
import { PlatformPaymentSettings } from "./platform-payment-settings";
import { QueueHealth } from "./queue-health";
import { StoresDirectory } from "./stores-directory";
import { SuperadminShell } from "./superadmin-shell";
import { SystemBroadcasts } from "./system-broadcasts";

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string | null;
  banned: boolean | null;
  banReason: string | null;
  createdAt: Date;
}

export function SuperadminClient({
  initialUsers,
  user,
}: {
  initialUsers: UserRow[];
  user?: { name: string; email: string; image?: string | null } | null;
}) {
  const trpc = useTRPC();
  const [users, setUsers] = useState<UserRow[]>(initialUsers);
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const [tab, setTab] = useState<SuperadminTab>("overview");

  const setBanStatus = useMutation(
    trpc.superadmin.setBanStatus.mutationOptions({
      onSuccess: (
        _data: unknown,
        vars: { userId: string; banned: boolean; banReason?: string },
      ) => {
        toast.success(vars.banned ? "User banned" : "User unbanned");
        setUsers((prev) =>
          prev.map((u) =>
            u.id === vars.userId
              ? {
                  ...u,
                  banned: vars.banned,
                  banReason: vars.banReason ?? u.banReason,
                }
              : u,
          ),
        );
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
    enabled: !!selectedUser,
  });

  const filtered = users.filter(
    (u) =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <SuperadminShell activeTab={tab} onSelectTab={setTab} user={user}>
      {tab === "overview" ? (
        <PlatformOverview onSwitchTab={(t) => setTab(t)} />
      ) : tab === "stores" ? (
        <StoresDirectory />
      ) : tab === "ai" ? (
        <AiObservability />
      ) : tab === "queues" ? (
        <QueueHealth />
      ) : tab === "channels" ? (
        <ChannelHealth />
      ) : tab === "broadcasts" ? (
        <SystemBroadcasts />
      ) : tab === "audit" ? (
        <PlatformAuditLogs />
      ) : tab === "bugs" ? (
        <BugReports />
      ) : tab === "payments" ? (
        <PlatformPaymentSettings />
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
          {/* Left: User list */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">All Users</h2>
                <p className="text-muted-foreground text-sm">
                  {initialUsers.length} registered users on the platform
                </p>
              </div>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search by name or email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="bg-background focus:ring-ring flex h-9 w-full rounded-md border pr-3 pl-9 text-sm focus:ring-2 focus:outline-none"
              />
            </div>

            {/* User rows */}
            <Card>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-muted-foreground border-b text-left text-xs">
                      <th className="px-4 py-3 font-medium">User</th>
                      <th className="px-4 py-3 font-medium">Role</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 text-right font-medium">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filtered.map((u) => (
                      <tr
                        key={u.id}
                        className={`hover:bg-muted/50 cursor-pointer transition-colors ${
                          selectedUser?.id === u.id ? "bg-muted/50" : ""
                        }`}
                        onClick={() => setSelectedUser(u)}
                      >
                        <td className="px-4 py-3">
                          <p className="text-foreground font-medium">
                            {u.name}
                          </p>
                          <p className="text-muted-foreground text-xs">
                            {u.email}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          {u.role === "superadmin" ? (
                            <span className="bg-destructive/10 text-destructive inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold">
                              <Shield className="h-3 w-3" /> Superadmin
                            </span>
                          ) : (
                            <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs capitalize">
                              {u.role ?? "client"}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {u.banned ? (
                            <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-600">
                              Banned
                            </span>
                          ) : (
                            <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-600">
                              Active
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {u.banned ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 gap-1 text-xs"
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
                                    banReason: "Banned by superadmin",
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
                        </td>
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr>
                        <td
                          colSpan={4}
                          className="text-muted-foreground px-4 py-8 text-center text-sm"
                        >
                          No users found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>

          {/* Right: User detail + stores */}
          <div className="space-y-4">
            {!selectedUser ? (
              <Card className="flex h-64 items-center justify-center border-dashed">
                <CardContent className="flex flex-col items-center gap-2 text-center">
                  <Users className="text-muted-foreground/40 h-8 w-8" />
                  <p className="text-muted-foreground text-sm">
                    Select a user to view their stores
                  </p>
                </CardContent>
              </Card>
            ) : (
              <>
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base">
                          {selectedUser.name}
                        </CardTitle>
                        <CardDescription>{selectedUser.email}</CardDescription>
                      </div>
                      <div className="bg-primary/10 text-primary flex h-10 w-10 items-center justify-center rounded-full text-base font-bold">
                        {selectedUser.name[0]?.toUpperCase() ?? "?"}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="text-muted-foreground flex justify-between">
                      <span>Platform role</span>
                      <span className="text-foreground font-medium capitalize">
                        {selectedUser.role ?? "client"}
                      </span>
                    </div>
                    <div className="text-muted-foreground flex justify-between">
                      <span>Status</span>
                      <span
                        className={`font-medium ${selectedUser.banned ? "text-destructive" : "text-green-600"}`}
                      >
                        {selectedUser.banned ? "Banned" : "Active"}
                      </span>
                    </div>
                    <div className="text-muted-foreground flex justify-between">
                      <span>Joined</span>
                      <span className="text-foreground font-medium">
                        {new Date(selectedUser.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </CardContent>
                </Card>

                <div>
                  <div className="mb-3 flex items-center gap-2">
                    <Building2 className="text-muted-foreground h-4 w-4" />
                    <h3 className="text-sm font-semibold">Stores</h3>
                  </div>

                  {storesQuery.isLoading ? (
                    <div className="space-y-2">
                      {[1, 2].map((i) => (
                        <div
                          key={i}
                          className="bg-muted h-16 animate-pulse rounded-lg"
                        />
                      ))}
                    </div>
                  ) : (storesQuery.data ?? []).length === 0 ? (
                    <Card className="flex h-24 items-center justify-center border-dashed">
                      <p className="text-muted-foreground text-sm">
                        No stores found
                      </p>
                    </Card>
                  ) : (
                    <div className="space-y-2">
                      {(storesQuery.data ?? []).map((store) => (
                        <Card
                          key={store.businessId}
                          className="overflow-hidden"
                        >
                          <CardContent className="flex items-center justify-between p-4">
                            <div className="flex items-center gap-3">
                              <div className="bg-primary/10 flex h-9 w-9 items-center justify-center rounded-lg">
                                <Store className="text-primary h-4 w-4" />
                              </div>
                              <div>
                                <p className="text-sm font-medium">
                                  {store.name}
                                </p>
                                <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
                                  <span>/{store.slug}</span>
                                  <span>·</span>
                                  <span className="capitalize">
                                    {store.memberRole}
                                  </span>
                                </div>
                              </div>
                            </div>
                            <a
                              href={`/${store.slug}/dashboard`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="bg-background hover:bg-muted inline-flex h-8 items-center gap-1 rounded-md border px-3 text-xs font-medium transition-colors"
                            >
                              Enter
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </SuperadminShell>
  );
}
