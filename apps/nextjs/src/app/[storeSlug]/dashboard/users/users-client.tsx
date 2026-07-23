"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle, ShieldAlert, Search, Ban, UserCheck } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@acme/ui/card";
import { Button } from "@acme/ui/button";
import { Input } from "@acme/ui/input";
import { Badge } from "@acme/ui/badge";
import { toast } from "@acme/ui/toast";
import { useTRPC } from "~/trpc/react";
import { authClient } from "~/auth/client";

export function UsersClient() {
  const trpc = useTRPC();
  const session = authClient.useSession();
  const myRole = session.data?.user?.role ?? "client";
  const myId = session.data?.user?.id;

  const [search, setSearch] = useState("");
  const usersQuery = useQuery(trpc.users.list.queryOptions());

  const setRole = useMutation(trpc.users.setRole.mutationOptions({ onSuccess: () => { usersQuery.refetch(); toast.success("Role updated"); }, onError: (e) => toast.error(e.message) }));
  const banUser = useMutation(trpc.users.banUser.mutationOptions({ onSuccess: () => { usersQuery.refetch(); toast.success("User banned"); }, onError: (e) => toast.error(e.message) }));
  const unbanUser = useMutation(trpc.users.unbanUser.mutationOptions({ onSuccess: () => { usersQuery.refetch(); toast.success("User unbanned"); }, onError: (e) => toast.error(e.message) }));

  const users = usersQuery.data ?? [];
  const filteredUsers = users.filter(
    (u) => u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <Card className="card-hover">
      <CardHeader className="pb-3 border-b">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <CardTitle>Registered Users</CardTitle>
            <CardDescription>A list of all users on your instance.</CardDescription>
          </div>
          <div className="relative w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search users..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 rounded-lg"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {usersQuery.isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading users...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b bg-muted/30">
                  <th className="p-4 font-medium">User Info</th>
                  <th className="p-4 font-medium">System Role</th>
                  <th className="p-4 font-medium">Status</th>
                  <th className="p-4 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredUsers.map((u) => {
                  const role = u.role ?? "client";
                  const status = u.banned ? "Banned" : "Active";
                  return (
                    <tr key={u.id} className="hover:bg-muted/10 transition-colors">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <span className="h-9 w-9 flex items-center justify-center rounded-full bg-primary text-white font-semibold text-sm">
                            {u.name[0]?.toUpperCase()}
                          </span>
                          <div>
                            <p className="font-semibold text-foreground">{u.name}</p>
                            <p className="text-xs text-muted-foreground">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4">
                        {myRole === "super_admin" && u.id !== myId ? (
                          <select
                            value={role}
                            onChange={(e) => setRole.mutate({ userId: u.id, role: e.target.value as "client" | "admin" | "super_admin" })}
                            className="h-7 rounded-md border bg-background px-2 text-xs capitalize"
                          >
                            <option value="client">Client</option>
                            <option value="admin">Admin</option>
                            <option value="super_admin">Super Admin</option>
                          </select>
                        ) : (
                          <Badge className="capitalize" variant={role === "super_admin" ? "default" : "secondary"}>
                            {role.replace("_", " ")}
                          </Badge>
                        )}
                      </td>
                      <td className="p-4">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                            status === "Active" ? "bg-green-500/10 text-green-500" : "bg-rose-500/10 text-rose-500"
                          }`}
                        >
                          {status === "Active" ? <CheckCircle className="h-3 w-3" /> : <ShieldAlert className="h-3 w-3" />}
                          {status}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {role !== "super_admin" && u.id !== myId && (
                            <Button
                              size="icon"
                              variant="ghost"
                              disabled={banUser.isPending || unbanUser.isPending}
                              onClick={() => (u.banned ? unbanUser.mutate({ userId: u.id }) : banUser.mutate({ userId: u.id }))}
                              className={`h-7 w-7 rounded-lg ${
                                !u.banned ? "text-rose-500 hover:bg-rose-500/5" : "text-emerald-500 hover:bg-emerald-500/5"
                              }`}
                            >
                              {!u.banned ? <Ban className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-sm text-muted-foreground">No users match your search.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
