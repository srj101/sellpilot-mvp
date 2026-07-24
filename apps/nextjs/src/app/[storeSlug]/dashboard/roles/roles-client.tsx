"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Mail,
  Pencil,
  Shield,
  Trash2,
  UserPlus,
  Users as UsersIcon,
  X,
  Check,
  Package,
  ShoppingCart,
  User,
  FileText,
  Inbox as InboxIcon,
  BarChart2,
  Sparkles,
  Gift,
  Plug,
  Settings as SettingsIcon,
  ChevronRight,
  Plus
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@acme/ui/card";
import { Button } from "@acme/ui/button";
import { toast } from "@acme/ui/toast";
import { cn } from "@acme/ui";
import { useTRPC } from "~/trpc/react";

/* ─── Constants & Icon Mapping ───────────────────────────────────────── */

const RESOURCES = [
  { key: "orders",       label: "Orders",       icon: ShoppingCart },
  { key: "products",     label: "Products",     icon: Package },
  { key: "customers",    label: "Customers",    icon: User },
  { key: "invoices",     label: "Invoices",     icon: FileText },
  { key: "users",        label: "Users",        icon: UsersIcon },
  { key: "inbox",        label: "Inbox",        icon: InboxIcon },
  { key: "analytics",    label: "Analytics",    icon: BarChart2 },
  { key: "agent",        label: "AI Agent",     icon: Sparkles },
  { key: "offers",       label: "Offers",       icon: Gift },
  { key: "integrations", label: "Integrations", icon: Plug },
  { key: "settings",     label: "Settings",     icon: SettingsIcon },
] as const;

const ACTIONS = [
  { key: "view",   label: "View" },
  { key: "create", label: "Create" },
  { key: "edit",   label: "Edit" },
  { key: "delete", label: "Delete" },
] as const;

function initials(name: string | null) {
  const safeName = name ?? "User";
  const parts = safeName.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "??";
}

interface RoleRow {
  id: string;
  name: string;
  key: string;
  description: string;
  permissions: string[];
}

type Tab = "roles" | "team";

/* ─── Tab bar ─────────────────────────────────────────────────────────── */

function TabBar({
  active,
  onChange,
  memberCount,
  roleCount,
}: {
  active: Tab;
  onChange: (t: Tab) => void;
  memberCount: number;
  roleCount: number;
}) {
  const tabs: { key: Tab; label: string; icon: React.ElementType; count: number }[] = [
    { key: "roles", label: "Roles & Permissions", icon: Shield, count: roleCount },
    { key: "team",  label: "Team Members",        icon: UsersIcon,  count: memberCount },
  ];

  return (
    <div className="inline-flex gap-1.5 rounded-xl border border-border/80 bg-muted/30 p-1 backdrop-blur-sm">
      {tabs.map((t) => {
        const Icon = t.icon;
        const isActive = active === t.key;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={cn(
              "relative flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all duration-300",
              isActive
                ? "bg-card text-foreground shadow-sm ring-1 ring-border/50"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
            )}
          >
            <Icon className={cn("h-4 w-4 transition-colors", isActive ? "text-primary" : "text-muted-foreground")} />
            {t.label}
            {t.count > 0 && (
              <span
                className={cn(
                  "flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-bold transition-all",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "bg-muted/80 text-muted-foreground",
                )}
              >
                {t.count}
              </span>
            )}
            {isActive && (
              <span className="absolute bottom-0 left-1/2 h-[2px] w-6 -translate-x-1/2 rounded-full bg-primary" />
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ─── Main Component ──────────────────────────────────────────────────── */

export function RolesClient() {
  const trpc = useTRPC();
  const rolesQuery = useQuery(trpc.roles.list.queryOptions());
  const membersQuery = useQuery(trpc.roles.listMembers.queryOptions());

  const createRole = useMutation(trpc.roles.create.mutationOptions({
    onSuccess: () => { rolesQuery.refetch(); toast.success("Role created successfully"); },
    onError: (e) => toast.error(e.message),
  }));
  const deleteRole = useMutation(trpc.roles.delete.mutationOptions({
    onSuccess: () => { rolesQuery.refetch(); toast.success("Role deleted successfully"); },
    onError: (e) => toast.error(e.message),
  }));
  const inviteMember = useMutation(trpc.roles.inviteMember.mutationOptions({
    onSuccess: () => { membersQuery.refetch(); toast.success("Invitation sent successfully"); },
    onError: (e) => toast.error(e.message),
  }));
  const cancelInvitation = useMutation(trpc.roles.cancelInvitation.mutationOptions({
    onSuccess: () => { membersQuery.refetch(); toast.success("Invitation cancelled"); },
    onError: (e) => toast.error(e.message),
  }));
  const removeMember = useMutation(trpc.roles.removeMember.mutationOptions({
    onSuccess: () => { membersQuery.refetch(); toast.success("Member removed"); },
    onError: (e) => toast.error(e.message),
  }));
  const updateMemberRole = useMutation(trpc.roles.updateMemberRole.mutationOptions({
    onSuccess: () => { membersQuery.refetch(); toast.success("Role updated successfully"); },
    onError: (e) => toast.error(e.message),
  }));

  const [tab, setTab] = useState<Tab>("roles");
  const [showCreate, setShowCreate] = useState(false);
  const [newRole, setNewRole] = useState({ name: "", permissions: [] as string[] });
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("viewer");

  const roles = (rolesQuery.data ?? []) as RoleRow[];
  const members = membersQuery.data?.members ?? [];
  const invitations = membersQuery.data?.invitations ?? [];

  function togglePermission(cell: string) {
    setNewRole((prev) => ({
      ...prev,
      permissions: prev.permissions.includes(cell)
        ? prev.permissions.filter((p) => p !== cell)
        : [...prev.permissions, cell],
    }));
  }

  function handleCreate() {
    if (!newRole.name.trim()) { toast.error("Role name is required"); return; }
    createRole.mutate({
      name: newRole.name.trim(),
      key: newRole.name.trim().toLowerCase().replace(/[^a-z]+/g, "_").replace(/^_+|_+$/g, "") || `role_${Date.now()}`,
      description: undefined,
      permissions: newRole.permissions,
    });
    setShowCreate(false);
    setNewRole({ name: "", permissions: [] });
  }

  function handleInvite() {
    if (!inviteEmail.trim()) { toast.error("Email is required"); return; }
    inviteMember.mutate({ email: inviteEmail.trim(), customRoleKey: inviteRole });
    setInviteEmail("");
    setShowInvite(false);
  }

  const isLoading = rolesQuery.isLoading || membersQuery.isLoading;

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-14 animate-pulse rounded-xl bg-muted/40" />
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="h-48 animate-pulse rounded-2xl bg-muted/40" />
          <div className="h-48 animate-pulse rounded-2xl bg-muted/40" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Page Header & Inline Actions ── */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Roles & Permissions</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Define Access Control Levels (ACL) for system operations, and manage your team.
          </p>
        </div>
        
        {/* Inline Tab-Specific Buttons */}
        <div className="flex shrink-0 items-center gap-3">
          {tab === "roles" && !showCreate && (
            <Button
              onClick={() => setShowCreate(true)}
              size="sm"
              className="bg-primary hover:bg-primary/95 text-primary-foreground font-semibold"
            >
              <Plus className="mr-1.5 h-4 w-4" />
              New Role
            </Button>
          )}
          {tab === "team" && !showInvite && membersQuery.data?.canManageTeam && (
            <Button
              onClick={() => setShowInvite(true)}
              size="sm"
              className="bg-primary hover:bg-primary/95 text-primary-foreground font-semibold"
            >
              <UserPlus className="mr-1.5 h-4 w-4" />
              Invite Member
            </Button>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div>
        <TabBar
          active={tab}
          onChange={setTab}
          roleCount={roles.length}
          memberCount={members.length + invitations.length}
        />
      </div>

      {/* ══════════ TAB: Roles ══════════ */}
      {tab === "roles" && (
        <div className="space-y-6 animate-in fade-in-50 duration-300">
          
          {/* Create custom role */}
          {showCreate && (
            <Card className="overflow-hidden border border-border bg-card/60 shadow-lg backdrop-blur-sm">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base font-bold">New Role Builder</CardTitle>
                    <CardDescription className="text-xs">Establish modular access controls for specific features.</CardDescription>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => setShowCreate(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              
              <CardContent className="space-y-6">
                <div>
                  <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Role Identity</label>
                  <input
                    placeholder="e.g. Sales Manager"
                    value={newRole.name}
                    onChange={(e) => setNewRole({ ...newRole, name: e.target.value })}
                    className="flex h-10 w-full max-w-md rounded-lg border border-border/80 bg-background/50 px-3.5 text-sm font-medium transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                <div>
                  <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Module Granularity Matrix</p>
                      <p className="text-[11px] text-muted-foreground/60">Toggle action permissions for each feature module.</p>
                    </div>
                    <div className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/40 px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
                      Owner integrations are always protected
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-xl border border-border bg-background/30 shadow-inner scrollbar-thin">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border bg-muted/40 text-left text-xs font-semibold tracking-wider text-muted-foreground">
                          <th className="px-5 py-3 font-medium">Resource Module</th>
                          {ACTIONS.map((a) => (
                            <th key={a.key} className="px-5 py-3 text-center font-medium">{a.label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/40">
                        {RESOURCES.map((r) => {
                          const Icon = r.icon;
                          return (
                            <tr key={r.key} className="transition-colors hover:bg-muted/20">
                              <td className="px-5 py-3">
                                <div className="flex items-center gap-2.5">
                                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                    <Icon className="h-4 w-4" />
                                  </div>
                                  <span className="font-semibold text-foreground">{r.label}</span>
                                </div>
                              </td>
                              {ACTIONS.map((a) => {
                                const cell = `${r.key}:${a.key}`;
                                const isChecked = newRole.permissions.includes(cell);
                                return (
                                  <td key={a.key} className="px-5 py-3 text-center">
                                    <label className="relative inline-flex items-center justify-center cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={() => togglePermission(cell)}
                                        className="sr-only peer"
                                      />
                                      <div className="h-5 w-5 rounded border border-border/80 bg-background transition-all peer-checked:border-primary peer-checked:bg-primary/10 peer-checked:text-primary flex items-center justify-center hover:border-primary/60">
                                        <Check className={cn("h-3.5 w-3.5 scale-50 opacity-0 transition-all", isChecked && "scale-100 opacity-100")} />
                                      </div>
                                    </label>
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button size="sm" onClick={handleCreate} disabled={createRole.isPending} className="bg-primary hover:bg-primary/95 text-primary-foreground font-semibold px-4">
                    {createRole.isPending ? "Creating..." : "Save Role"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowCreate(false)} className="hover:bg-muted/80">Cancel</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Role grids */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {roles.map((r) => {
              const assignedMembersCount = members.filter((m) => m.customRoleKey === r.key).length;
              return (
                <div
                  key={r.key}
                  className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-border bg-card p-5 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg card-hover"
                >
                  <div>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-sm">
                          <Shield className="h-5 w-5" />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-foreground capitalize">{r.name}</h4>
                          <span className="inline-flex rounded bg-muted/80 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                            {assignedMembersCount} member{assignedMembersCount !== 1 ? "s" : ""} assigned
                          </span>
                        </div>
                      </div>

                      {!["admin", "editor", "viewer"].includes(r.key) && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 rounded-full text-muted-foreground/60 hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                          onClick={() => deleteRole.mutate({ key: r.key })}
                          disabled={deleteRole.isPending}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>

                    <p className="mt-3.5 text-xs leading-relaxed text-muted-foreground min-h-[32px]">
                      {r.description || `Custom permissions tailored specifically for your store operations.`}
                    </p>
                  </div>

                  <div className="mt-5 pt-4 border-t border-border/60">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground/80">Permissions Scope</span>
                      <span className="text-[11px] font-bold text-primary">{r.permissions.length} active</span>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {r.permissions.slice(0, 5).map((perm) => (
                        <span
                          key={perm}
                          className="inline-flex items-center rounded-md border border-primary/10 bg-primary/5 px-2 py-0.5 text-[10px] font-medium text-primary capitalize"
                        >
                          {perm.replace(":", " • ")}
                        </span>
                      ))}
                      {r.permissions.length > 5 && (
                        <span className="inline-flex items-center rounded-md border border-border/80 bg-muted/60 px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                          +{r.permissions.length - 5} others
                        </span>
                      )}
                      {r.permissions.length === 0 && (
                        <span className="text-xs text-muted-foreground/50 italic font-medium">None configured</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ══════════ TAB: Team Members ══════════ */}
      {tab === "team" && (
        <div className="space-y-6 animate-in fade-in-50 duration-300">
          
          {/* Quick Metrics Header */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Total Crew</span>
              <p className="text-2xl font-extrabold text-foreground mt-1">{members.length + invitations.length}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Active Members</span>
              <p className="text-2xl font-extrabold text-foreground mt-1">{members.length}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Pending Invitations</span>
              <p className="text-2xl font-extrabold text-foreground mt-1">{invitations.length}</p>
            </div>
          </div>

          {/* Invite workspace member */}
          {showInvite && (
            <Card className="overflow-hidden border border-border bg-card/60 shadow-lg backdrop-blur-sm">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-base font-bold">Invite to Store Workspace</CardTitle>
                    <CardDescription className="text-xs">Grant team members access using standard or custom roles.</CardDescription>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => setShowInvite(false)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="flex flex-wrap items-end gap-4">
                <div className="min-w-[240px] flex-1">
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Teammate Email</label>
                  <input
                    type="email"
                    placeholder="name@company.com"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="flex h-10 w-full rounded-lg border border-border/80 bg-background/50 px-3.5 text-sm font-medium transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div className="min-w-[160px]">
                  <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">Select Access Role</label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value)}
                    className="flex h-10 w-full rounded-lg border border-border/80 bg-background/50 px-3.5 text-sm font-medium transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    {roles.map((r) => (
                      <option key={r.key} value={r.key}>{r.name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleInvite} disabled={inviteMember.isPending} className="bg-primary hover:bg-primary/95 text-primary-foreground font-semibold px-4 h-10">
                    {inviteMember.isPending ? "Sending..." : "Send Invite"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setShowInvite(false)} className="h-10 hover:bg-muted/80">Cancel</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Members dynamic list */}
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="overflow-x-auto scrollbar-thin">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-left text-xs font-semibold tracking-wider text-muted-foreground">
                    <th className="px-6 py-4 font-medium">Store Member</th>
                    <th className="px-6 py-4 font-medium">Assigned Role</th>
                    <th className="px-6 py-4 font-medium">Status</th>
                    {membersQuery.data?.canManageTeam && (
                      <th className="px-6 py-4 text-right font-medium">Actions</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {members.map((m) => {
                    const isOwner = m.role === "owner";
                    const roleLabel = m.customRoleKey ?? m.role;
                    return (
                      <tr key={m.id} className="transition-colors hover:bg-muted/20">
                        {/* Member Profiler */}
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary font-bold text-sm shadow-sm border border-primary/20">
                              {initials(m.name)}
                              {/* status dot */}
                              <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card bg-emerald-500" />
                            </div>
                            <div>
                              <p className="font-bold text-foreground flex items-center gap-1.5">
                                {m.name}
                                {m.isYou && (
                                  <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wide text-primary">
                                    You
                                  </span>
                                )}
                              </p>
                              <p className="text-xs text-muted-foreground">{m.email}</p>
                            </div>
                          </div>
                        </td>

                        {/* Custom / Default dropdown roles setter */}
                        <td className="px-6 py-4">
                          {isOwner ? (
                            <span className="inline-flex rounded-full border border-border bg-muted/80 px-2.5 py-0.5 text-xs font-semibold text-muted-foreground capitalize">
                              Owner
                            </span>
                          ) : membersQuery.data?.canManageTeam && !m.isYou ? (
                            <div className="relative inline-flex">
                              <select
                                value={m.customRoleKey ?? ""}
                                onChange={(e) => updateMemberRole.mutate({ memberId: m.id, customRoleKey: e.target.value })}
                                className="h-8 rounded-lg border border-border bg-background px-3 pr-8 text-xs font-semibold focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20 appearance-none cursor-pointer"
                              >
                                {roles.map((r) => (
                                  <option key={r.key} value={r.key}>{r.name}</option>
                                ))}
                              </select>
                              <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-2.5 text-muted-foreground">
                                <ChevronRight className="h-3.5 w-3.5 rotate-90" />
                              </span>
                            </div>
                          ) : (
                            <span className="inline-flex rounded-full border border-border bg-muted/80 px-2.5 py-0.5 text-xs font-semibold text-muted-foreground capitalize">
                              {roleLabel}
                            </span>
                          )}
                        </td>

                        {/* Status Label */}
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-bold text-emerald-600 dark:text-emerald-400">
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                            Active
                          </span>
                        </td>

                        {/* Removal actions */}
                        {membersQuery.data?.canManageTeam && (
                          <td className="px-6 py-4 text-right">
                            {!m.isYou && m.role !== "owner" && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 rounded-full text-muted-foreground/60 hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                                onClick={() => removeMember.mutate({ memberId: m.id })}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}

                  {/* Pending invites styling */}
                  {invitations.map((inv) => {
                    const roleLabel = inv.customRoleKey ?? inv.role ?? "viewer";
                    return (
                      <tr key={inv.id} className="bg-muted/10 transition-colors hover:bg-muted/20">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted/60 border border-dashed border-border text-muted-foreground shadow-sm">
                              <Mail className="h-4 w-4" />
                            </div>
                            <div>
                              <p className="font-semibold text-muted-foreground">{inv.email}</p>
                              <p className="text-[10px] text-muted-foreground/50 font-bold uppercase tracking-wider">Invitation Pending</p>
                            </div>
                          </div>
                        </td>

                        <td className="px-6 py-4">
                          <span className="inline-flex rounded-full border border-border bg-muted/80 px-2.5 py-0.5 text-xs font-semibold text-muted-foreground capitalize">
                            {roleLabel}
                          </span>
                        </td>

                        <td className="px-6 py-4">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-bold text-amber-600 dark:text-amber-400">
                            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
                            Pending
                          </span>
                        </td>

                        {membersQuery.data?.canManageTeam && (
                          <td className="px-6 py-4 text-right">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 rounded-full text-muted-foreground/60 hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                              onClick={() => cancelInvitation.mutate({ invitationId: inv.id })}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </td>
                        )}
                      </tr>
                    );
                  })}

                  {members.length === 0 && invitations.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center text-sm font-medium text-muted-foreground">
                        No team members registered for this store.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
