"use client";

import { useState } from "react";
import { CheckCircle, ShieldAlert, Search, Ban, UserCheck } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@acme/ui/card";
import { Button } from "@acme/ui/button";
import { Input } from "@acme/ui/input";
import { Badge } from "@acme/ui/badge";

export function UsersClient() {
  const [search, setSearch] = useState("");
  const [users, setUsers] = useState([
    { id: "1", name: "Sr Joy", email: "srjoy@sellpilot.com", role: "super_admin", status: "Active" },
    { id: "2", name: "Jane Miller", email: "jane@client.com", role: "client", status: "Active" },
    { id: "3", name: "David Johnson", email: "david@support.com", role: "support", status: "Active" },
    { id: "4", name: "Spammy User", email: "spam@bad.com", role: "client", status: "Banned" },
  ]);

  const toggleBan = (id: string) => {
    setUsers(users.map(u => {
      if (u.id === id) {
        return { ...u, status: u.status === "Active" ? "Banned" : "Active" };
      }
      return u;
    }));
  };

  const changeRole = (id: string, newRole: string) => {
    setUsers(users.map(u => {
      if (u.id === id) {
        return { ...u, role: newRole };
      }
      return u;
    }));
  };

  const filteredUsers = users.filter(u => 
    u.name.toLowerCase().includes(search.toLowerCase()) || 
    u.email.toLowerCase().includes(search.toLowerCase())
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
              {filteredUsers.map((u) => (
                <tr key={u.id} className="hover:bg-muted/10 transition-colors">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <span className="h-9 w-9 flex items-center justify-center rounded-full bg-primary text-white font-semibold text-sm">
                        {u.name[0]}
                      </span>
                      <div>
                        <p className="font-semibold text-foreground">{u.name}</p>
                        <p className="text-xs text-muted-foreground">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <Badge className="capitalize" variant={u.role === "super_admin" ? "default" : "secondary"}>
                      {u.role.replace("_", " ")}
                    </Badge>
                  </td>
                  <td className="p-4">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                      u.status === "Active" ? "bg-green-500/10 text-green-500" : "bg-rose-500/10 text-rose-500"
                    }`}>
                      {u.status === "Active" ? (
                        <CheckCircle className="h-3 w-3" />
                      ) : (
                        <ShieldAlert className="h-3 w-3" />
                      )}
                      {u.status}
                    </span>
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {u.role !== "super_admin" && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => changeRole(u.id, u.role === "client" ? "support" : "client")}
                            className="rounded-lg h-7 text-[11px]"
                          >
                            Toggle Role
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => toggleBan(u.id)}
                            className={`h-7 w-7 rounded-lg ${
                              u.status === "Active" ? "text-rose-500 hover:bg-rose-500/5" : "text-emerald-500 hover:bg-emerald-500/5"
                            }`}
                          >
                            {u.status === "Active" ? <Ban className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
