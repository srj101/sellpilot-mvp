"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Building2,
  ChevronRight,
  ExternalLink,
  Search,
  Shield,
  ShieldOff,
  Store,
  Users,
} from "lucide-react";

import { Button } from "@acme/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@acme/ui/card";
import { toast } from "@acme/ui/toast";
import { useTRPC } from "~/trpc/react";

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: string | null;
  banned: boolean | null;
  banReason: string | null;
  createdAt: Date;
};

export function SuperadminClient({ initialUsers }: { initialUsers: UserRow[] }) {
  const trpc = useTRPC();
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);

  const setBanStatus = useMutation(
    trpc.superadmin.setBanStatus.mutationOptions({
      onSuccess: (_data: unknown, vars: { userId: string; banned: boolean; banReason?: string }) => {
        toast.success(vars.banned ? "User banned" : "User unbanned");
      },
      onError: (e: { message: string }) => toast.error(e.message),
    }),
  );

  const storesQuery = useQuery({
    ...trpc.superadmin.listStoresOfUser.queryOptions(
      { userId: selectedUser?.id ?? "" },
    ),
    enabled: !!selectedUser,
  });

  const filtered = initialUsers.filter(
    (u) =>
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
      {/* Left: User list */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold">All Users</h2>
            <p className="text-sm text-muted-foreground">
              {initialUsers.length} registered users on the platform
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex h-9 w-full rounded-md border bg-background pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* User rows */}
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">User</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((u) => (
                  <tr
                    key={u.id}
                    className={`cursor-pointer transition-colors hover:bg-muted/50 ${
                      selectedUser?.id === u.id ? "bg-muted/50" : ""
                    }`}
                    onClick={() => setSelectedUser(u)}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{u.name}</p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                    </td>
                    <td className="px-4 py-3">
                      {u.role === "superadmin" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
                          <Shield className="h-3 w-3" /> Superadmin
                        </span>
                      ) : (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground capitalize">
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
                              setBanStatus.mutate({ userId: u.id, banned: false });
                            }}
                            disabled={setBanStatus.isPending}
                          >
                            <Shield className="h-3 w-3" /> Unban
                          </Button>
                        ) : u.role !== "superadmin" ? (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 gap-1 text-xs text-destructive hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              setBanStatus.mutate({ userId: u.id, banned: true, banReason: "Banned by superadmin" });
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
                          onClick={(e) => { e.stopPropagation(); setSelectedUser(u); }}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">
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
              <Users className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">
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
                    <CardTitle className="text-base">{selectedUser.name}</CardTitle>
                    <CardDescription>{selectedUser.email}</CardDescription>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-base font-bold text-primary">
                    {selectedUser.name[0]?.toUpperCase() ?? "?"}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Platform role</span>
                  <span className="font-medium text-foreground capitalize">{selectedUser.role ?? "client"}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Status</span>
                  <span className={`font-medium ${selectedUser.banned ? "text-destructive" : "text-green-600"}`}>
                    {selectedUser.banned ? "Banned" : "Active"}
                  </span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span>Joined</span>
                  <span className="font-medium text-foreground">
                    {new Date(selectedUser.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </CardContent>
            </Card>

            <div>
              <div className="mb-3 flex items-center gap-2">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <h3 className="text-sm font-semibold">Stores</h3>
              </div>

              {storesQuery.isLoading ? (
                <div className="space-y-2">
                  {[1, 2].map((i) => (
                    <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
                  ))}
                </div>
              ) : (storesQuery.data ?? []).length === 0 ? (
                <Card className="flex h-24 items-center justify-center border-dashed">
                  <p className="text-sm text-muted-foreground">No stores found</p>
                </Card>
              ) : (
                <div className="space-y-2">
                  {(storesQuery.data ?? []).map((store) => (
                    <Card key={store.organizationId} className="overflow-hidden">
                      <CardContent className="flex items-center justify-between p-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                            <Store className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <p className="text-sm font-medium">{store.name}</p>
                            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <span>/{store.slug}</span>
                              <span>·</span>
                              <span className="capitalize">{store.memberRole}</span>
                            </div>
                          </div>
                        </div>
                        <a
                          href={`/${store.slug}/dashboard`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex h-8 items-center gap-1 rounded-md border bg-background px-3 text-xs font-medium transition-colors hover:bg-muted"
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
  );
}
