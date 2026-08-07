import { and, eq } from "@acme/db";
import type { db as Db } from "@acme/db/client";
import { role } from "@acme/db/schema";

export const RESOURCES = [
  "orders",
  "products",
  "customers",
  "invoices",
  "users",
  "inbox",
  "analytics",
  "agent",
  "offers",
  "integrations",
  "settings",
] as const;
export const ACTIONS = ["view", "create", "edit", "delete"] as const;

export type Resource = (typeof RESOURCES)[number];
export type Action = (typeof ACTIONS)[number];

export function perms(resources: readonly string[], actions: readonly string[]) {
  return resources.flatMap((r) => actions.map((a) => `${r}:${a}`));
}

/**
 * Default roles returned when a store hasn't created any custom roles yet.
 *
 * - integrations:connect / integrations:disconnect are intentionally absent from
 *   all default roles — those actions are owner-only at the procedure level and
 *   cannot be delegated via a custom role.
 * - integrations:view lets editors/admins see the integrations page without
 *   being able to add or remove connections.
 */
export const DEFAULT_ROLES = [
  {
    name: "Admin",
    key: "admin",
    description: "Full access to every resource. Cannot connect/disconnect integrations (owner only).",
    permissions: [
      ...perms(["orders", "products", "customers", "invoices", "users"], ACTIONS),
      ...perms(["inbox", "analytics", "agent", "offers", "settings"], ACTIONS),
      "integrations:view",
    ],
  },
  {
    name: "Editor",
    key: "editor",
    description: "Can view, create, and edit records. Cannot delete or manage users/settings.",
    permissions: [
      ...perms(["orders", "products", "customers", "invoices"], ["view", "create", "edit"]),
      ...perms(["inbox", "offers"], ["view", "create", "edit"]),
      "users:view",
      "analytics:view",
      "agent:view",
      "integrations:view",
    ],
  },
  {
    name: "Viewer",
    key: "viewer",
    description: "Read-only access across the store.",
    permissions: perms(
      ["orders", "products", "customers", "invoices", "users", "inbox", "analytics", "agent", "offers", "integrations", "settings"],
      ["view"],
    ),
  },
];

/**
 * Resolves a business member's effective permission strings. Owners short-circuit to
 * "*" at the procedure layer (see businessProcedure) and never reach here.
 */
export async function resolvePermissions(
  db: typeof Db,
  args: { memberRole: string; customRoleKey: string | null; businessId: string },
): Promise<string[]> {
  if (!args.customRoleKey) {
    return [];
  }

  const [customRole] = await db
    .select({ permissions: role.permissions })
    .from(role)
    .where(and(eq(role.businessId, args.businessId), eq(role.key, args.customRoleKey)))
    .limit(1);

  if (customRole) {
    return customRole.permissions;
  }

  // No custom role row yet (business never created any) — the member's key may still
  // point at one of the synthesized defaults `list` falls back to (see DEFAULT_ROLES above).
  const fallback = DEFAULT_ROLES.find((r) => r.key === args.customRoleKey);
  return fallback?.permissions ?? [];
}
