"use client";

import { useState } from "react";
import { Shield, Plus, Trash2 } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@acme/ui/card";
import { Button } from "@acme/ui/button";
import { useTRPC } from "~/trpc/react";
import { useSession } from "next-auth/react";

interface Role {
  name: string;
  key: string;
  description: string;
  permissions: string[];
}

export function RolesClient() {
  const trpc = useTRPC();
  const utils = trpc.useUtils();
  const { data: roles, isLoading } = trpc.roles.list.useQuery();
  const createMutation = trpc.roles.create.useMutation({
    onSuccess: () => {
      utils.roles.list.invalidate();
    },
  });
  const deleteMutation = trpc.roles.delete.useMutation({
    onSuccess: () => {
      utils.roles.list.invalidate();
    },
  });

  const [showCreate, setShowCreate] = useState(false);
  const [newRole, setNewRole] = useState({ name: "", key: "", description: "", permissions: [] as string[] });

  const allPermissions: Permission[] = [
    { key: "inbox_read", name: "Read Chat History", category: "Messaging" },
    { key: "inbox_write", name: "Send Chat Replies", category: "Messaging" },
    { key: "orders_manage", name: "Create & Fulfill Orders", category: "ECommerce" },
    { key: "billing_manage", name: "Manage Subscriptions & Billing", category: "Account" },
    { key: "saas_view", name: "Access SaaS Metrics", category: "Super Admin" },
    { key: "integrations_edit", name: "Link Meta Pages & Tokens", category: "Integrations" },
    { key: "users_manage", name: "Manage Team Members", category: "Admin" },
    { key: "roles_manage", name: "Manage Roles & Permissions", category: "Admin" },
  ];

  const categories = [...new Set(allPermissions.map((p) => p.category))];

  const togglePermission = (permKey: string) => {
    setNewRole((prev) => ({
      ...prev,
      permissions: prev.permissions.includes(permKey)
        ? prev.permissions.filter((p) => p !== permKey)
        : [...prev.permissions, permKey],
    }));
  };

  const handleCreate = () => {
    if (!newRole.name || !newRole.key) {
      toast.error("Name and key are required");
      return;
    }
    createRole.mutate(newRole);
    setShowCreate(false);
    setNewRole({ name: "", key: "", description: "", permissions: [] });
  };

  if (isLoading) {
    return <div className="grid gap-6 lg:grid-cols-2"><div className="animate-pulse h-48 bg-muted rounded-lg" /><div className="animate-pulse h-48 bg-muted rounded-lg" /></div>;
  }

  const displayRoles = roles ?? [];

  return (
    <>
      {showCreate && (
        <Card className="mb-6 border-dashed border-2">
          <CardHeader>
            <CardTitle className="text-lg">Create Custom Role</CardTitle>
            <CardDescription>Add a new role with specific permissions</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <input
                placeholder="Role Name"
                value={newRole.name}
                onChange={(e) => setNewRole({ ...newRole, name: e.target.value })}
                className="flex h-9 w-full rounded-md border bg-background px-3 text-sm"
              />
              <input
                placeholder="key_slug (a-z underscores)"
                value={newRole.key}
                onChange={(e) => setNewRole({ ...newRole, key: e.target.value.replace(/[^a-z_]/g, "") })}
                className="flex h-9 w-full rounded-md border bg-background px-3 text-sm"
              />
            </div>
            <textarea
              placeholder="Description (optional)"
              value={newRole.description}
              onChange={(e) => setNewRole({ ...newRole, description: e.target.value })}
              className="flex w-full rounded-md border bg-background px-3 py-2 text-sm"
              rows={2}
            />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {categories.map((cat) => (
                <div key={cat}>
                  <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase">{cat}</p>
                  {allPermissions.filter((p) => p.category === cat).map((p) => (
                    <label key={p.key} className="flex items-center gap-2 py-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={newRole.permissions.includes(p.key)}
                        onChange={() => togglePermission(p.key)}
                        className="rounded"
                      />
                      <span className="text-sm">{p.name}</span>
                    </label>
                  ))}
                </div>
              ))}
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
        {displayRoles.map((r) => (
          <Card key={r.key} className="relative overflow-hidden">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                    <Shield className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-base">{r.name}</CardTitle>
                    <p className="text-xs text-muted-foreground font-mono">{r.key}</p>
                  </div>
                </div>
                {r.key !== "super_admin" && r.key !== "client" && (
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
              {r.description && (
                <CardDescription className="mt-2">{r.description}</CardDescription>
              )}
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1.5">
                {r.permissions.map((perm) => {
                  const permInfo = allPermissions.find((p) => p.key === perm);
                  return (
                    <span
                      key={perm}
                      className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs text-primary"
                    >
                      {permInfo?.name ?? perm}
                    </span>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        ))}

        {displayRoles.length === 0 && !showCreate && (
          <Card className="border-dashed col-span-full">
            <CardContent className="flex flex-col items-center justify-center py-10">
              <Shield className="h-10 w-10 text-muted-foreground mb-3" />
              <p className="text-muted-foreground text-sm mb-3">No custom roles yet</p>
              <Button size="sm" variant="outline" onClick={() => setShowCreate(true)}>
                <Plus className="h-4 w-4 mr-1" /> Create Role
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {!showCreate && displayRoles.length > 0 && (
        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={() => setShowCreate(true)}
        >
          <Plus className="h-4 w-4 mr-1" /> Create Custom Role
        </Button>
      )}
    </>
  );
}