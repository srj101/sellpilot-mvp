"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Mail, Pencil, Shield, Trash2, UserPlus, X } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@acme/ui/card";
import { Button } from "@acme/ui/button";
import { toast } from "@acme/ui/toast";
import { useTRPC } from "~/trpc/react";

const RESOURCES = [
  { key: "orders", label: "Orders" },
  { key: "products", label: "Products" },
  { key: "customers", label: "Customers" },
  { key: "invoices", label: "Invoices" },
  { key: "users", label: "Users" },
] as const;

const ACTIONS = [
  { key: "view", label: "View" },
  { key: "create", label: "Create" },
  { key: "edit", label: "Edit" },
  { key: "delete", label: "Delete" },
] as const;

const inputClass = "flex h-9 w-full rounded-md border bg-background px-3 text-sm";

interface RoleRow {
  id: string;
  name: string;
  key: string;
  description: string;
  permissions: string[];
}

export function RolesClient() {
  const trpc = useTRPC();
  const rolesQuery = useQuery(trpc.roles.list.queryOptions());
  const membersQuery = useQuery(trpc.roles.listMembers.queryOptions());

  const createRole = useMutation(trpc.roles.create.mutationOptions({ onSuccess: () => { rolesQuery.refetch(); toast.success("Role created"); }, onError: (e) => toast.error(e.message) }));
  const deleteRole = useMutation(trpc.roles.delete.mutationOptions({ onSuccess: () => { rolesQuery.refetch(); toast.success("Role deleted"); }, onError: (e) => toast.error(e.message) }));
  const inviteMember = useMutation(trpc.roles.inviteMember.mutationOptions({ onSuccess: () => { membersQuery.refetch(); toast.success("Invitation sent"); }, onError: (e) => toast.error(e.message) }));
  const cancelInvitation = useMutation(trpc.roles.cancelInvitation.mutationOptions({ onSuccess: () => { membersQuery.refetch(); toast.success("Invitation cancelled"); }, onError: (e) => toast.error(e.message) }));
  const removeMember = useMutation(trpc.roles.removeMember.mutationOptions({ onSuccess: () => { membersQuery.refetch(); toast.success("Member removed"); }, onError: (e) => toast.error(e.message) }));
  const updateMemberRole = useMutation(trpc.roles.updateMemberRole.mutationOptions({ onSuccess: () => { membersQuery.refetch(); toast.success("Role updated"); }, onError: (e) => toast.error(e.message) }));

  const [showCreate, setShowCreate] = useState(false);
  const [newRole, setNewRole] = useState({ name: "", key: "", description: "", permissions: [] as string[] });
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");

  const roles = (rolesQuery.data ?? []) as RoleRow[];

  function togglePermission(cell: string) {
    setNewRole((prev) => ({
      ...prev,
      permissions: prev.permissions.includes(cell) ? prev.permissions.filter((p) => p !== cell) : [...prev.permissions, cell],
    }));
  }

  function handleCreate() {
    if (!newRole.name.trim()) {
      toast.error("Role name is required");
      return;
    }
    createRole.mutate({
      name: newRole.name.trim(),
      key: newRole.name.trim().toLowerCase().replace(/[^a-z]+/g, "_").replace(/^_+|_+$/g, "") || `role_${Date.now()}`,
      description: undefined,
      permissions: newRole.permissions,
    });
    setShowCreate(false);
    setNewRole({ name: "", key: "", description: "", permissions: [] });
  }

  function handleInvite() {
    if (!inviteEmail.trim()) {
      toast.error("Email is required");
      return;
    }
    inviteMember.mutate({ email: inviteEmail.trim(), customRoleKey: inviteRole });
    setInviteEmail("");
    setShowInvite(false);
  }

  if (rolesQuery.isLoading) {
    return (
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="h-48 animate-pulse rounded-lg bg-muted" />
        <div className="h-48 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Role cards */}
      {showCreate && (
        <Card className="border-dashed border-2">
          <CardHeader>
            <CardTitle className="text-lg">Create Role</CardTitle>
            <CardDescription>Define a new role with permissions</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-muted-foreground">Role Name</label>
              <input
                placeholder="Enter role name"
                value={newRole.name}
                onChange={(e) => setNewRole({ ...newRole, name: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">Permissions</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="py-2 font-medium">Resource</th>
                      {ACTIONS.map((a) => (
                        <th key={a.key} className="py-2 text-center font-medium">{a.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {RESOURCES.map((r) => (
                      <tr key={r.key}>
                        <td className="py-2 font-medium text-foreground">{r.label}</td>
                        {ACTIONS.map((a) => {
                          const cell = `${r.key}:${a.key}`;
                          return (
                            <td key={a.key} className="py-2 text-center">
                              <input
                                type="checkbox"
                                checked={newRole.permissions.includes(cell)}
                                onChange={() => togglePermission(cell)}
                                className="rounded"
                              />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={handleCreate} disabled={createRole.isPending}>
                {createRole.isPending ? "Creating..." : "Create Role"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {roles.map((r) => (
          <Card key={r.key} className="relative overflow-hidden">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                    <Shield className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-base">{r.name}</CardTitle>
                    <p className="text-xs text-muted-foreground">
                      {(membersQuery.data?.members ?? []).filter((m) => m.customRoleKey === r.key).length} users
                    </p>
                  </div>
                </div>
                {!["admin", "editor", "viewer"].includes(r.key) && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-muted-foreground hover:text-rose-600"
                    onClick={() => deleteRole.mutate({ key: r.key })}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
              {r.description && <CardDescription className="mt-2">{r.description}</CardDescription>}
            </CardHeader>
            <CardContent>
              <p className="mb-2 text-xs font-semibold uppercase text-muted-foreground">{r.permissions.length} Permissions</p>
              <div className="flex flex-wrap gap-1.5">
                {r.permissions.slice(0, 8).map((perm) => (
                  <span key={perm} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs text-primary">
                    {perm}
                  </span>
                ))}
                {r.permissions.length > 8 && (
                  <span className="inline-flex items-center rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">
                    +{r.permissions.length - 8} more
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {!showCreate && (
        <Button variant="outline" size="sm" onClick={() => setShowCreate(true)}>
          <Pencil className="mr-1 h-4 w-4" /> New Role
        </Button>
      )}

      {/* Team members */}
      <div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Team Members</h2>
            <p className="text-sm text-muted-foreground">People with access to your store</p>
          </div>
          {membersQuery.data?.canManageTeam && (
            <Button size="sm" onClick={() => setShowInvite((v) => !v)}>
              <UserPlus className="mr-1.5 h-4 w-4" /> Invite Member
            </Button>
          )}
        </div>

        {showInvite && (
          <Card className="mb-4 border-dashed border-2">
            <CardContent className="flex flex-wrap items-end gap-3 pt-6">
              <div className="min-w-[220px] flex-1">
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Email</label>
                <input
                  type="email"
                  placeholder="teammate@company.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-muted-foreground">Role</label>
                <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value)} className={inputClass}>
                  {roles.map((r) => (
                    <option key={r.key} value={r.key}>{r.name}</option>
                  ))}
                </select>
              </div>
              <Button size="sm" onClick={handleInvite} disabled={inviteMember.isPending}>
                {inviteMember.isPending ? "Sending..." : "Send Invite"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowInvite(false)}>
                Cancel
              </Button>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  {membersQuery.data?.canManageTeam && <th className="px-4 py-3 text-right font-medium">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y">
                {(membersQuery.data?.members ?? []).map((m) => (
                  <tr key={m.id}>
                    <td className="px-4 py-3 font-medium text-foreground">{m.name} {m.isYou && <span className="text-muted-foreground">(You)</span>}</td>
                    <td className="px-4 py-3 text-muted-foreground">{m.email}</td>
                    <td className="px-4 py-3">
                      {m.role === "owner" ? (
                        <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-600">Owner</span>
                      ) : membersQuery.data?.canManageTeam && !m.isYou ? (
                        <select
                          value={m.customRoleKey ?? ""}
                          onChange={(e) => updateMemberRole.mutate({ memberId: m.id, customRoleKey: e.target.value })}
                          className="h-7 rounded-md border bg-background px-2 text-xs"
                        >
                          {roles.map((r) => (
                            <option key={r.key} value={r.key}>{r.name}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs text-muted-foreground capitalize">{m.customRoleKey ?? m.role}</span>
                      )}
                    </td>
                    {membersQuery.data?.canManageTeam && (
                      <td className="px-4 py-3 text-right">
                        {!m.isYou && m.role !== "owner" && (
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-rose-600" onClick={() => removeMember.mutate({ memberId: m.id })}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
                {(membersQuery.data?.invitations ?? []).map((inv) => (
                  <tr key={inv.id} className="bg-muted/30">
                    <td className="px-4 py-3 font-medium text-muted-foreground" colSpan={2}>
                      <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" /> {inv.email} <span className="text-xs">(pending)</span></span>
                    </td>
                    <td className="px-4 py-3 text-xs capitalize text-muted-foreground">{inv.customRoleKey ?? inv.role}</td>
                    {membersQuery.data?.canManageTeam && (
                      <td className="px-4 py-3 text-right">
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-rose-600" onClick={() => cancelInvitation.mutate({ invitationId: inv.id })}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
