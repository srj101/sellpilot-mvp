import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod/v4";

import { desc, eq, and } from "@acme/db";
import { role } from "@acme/db/schema";

import { protectedProcedure } from "../trpc";

const DEFAULT_ROLES = [
  {
    name: "Super Administrator",
    key: "super_admin",
    description: "Full instance owner. Access to all clients, billing, integrations, and server configs.",
    permissions: ["inbox_read", "inbox_write", "orders_manage", "billing_manage", "saas_view", "integrations_edit", "users_manage", "roles_manage"],
  },
  {
    name: "Administrator",
    key: "admin",
    description: "Business owner. Manage channels, catalogs, integrations, and orders.",
    permissions: ["inbox_read", "inbox_write", "orders_manage", "saas_view", "integrations_edit"],
  },
  {
    name: "Support Representative",
    key: "support",
    description: "Customer service agent. Direct chat capabilities and ticket resolution.",
    permissions: ["inbox_read", "inbox_write", "orders_manage"],
  },
  {
    name: "Client / Customer",
    key: "client",
    description: "Read-only access to custom storefront metrics and account billing.",
    permissions: ["inbox_read"],
  },
];

export const rolesRouter: TRPCRouterRecord = {
  list: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const roles = await ctx.db
      .select()
      .from(role)
      .where(eq(role.userId, userId))
      .orderBy(desc(role.createdAt));

    // If no custom roles, return defaults
    if (roles.length === 0) {
      return DEFAULT_ROLES;
    }

    return roles.map((r) => ({
      name: r.name,
      key: r.key,
      description: r.description ?? "",
      permissions: r.permissions,
    }));
  }),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      key: z.string().min(1).regex(/^[a-z_]+$/),
      description: z.string().optional(),
      permissions: z.array(z.string()),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const existing = await ctx.db
        .select({ id: role.id })
        .from(role)
        .where(and(eq(role.userId, userId), eq(role.key, input.key)))
        .limit(1);

      if (existing.length > 0) {
        throw new Error("Role with this key already exists");
      }

      const [newRole] = await ctx.db
        .insert(role)
        .values({
          userId,
          name: input.name,
          key: input.key,
          description: input.description,
          permissions: input.permissions,
        })
        .returning();

      return newRole;
    }),

  update: protectedProcedure
    .input(z.object({
      key: z.string(),
      name: z.string().min(1).optional(),
      description: z.string().optional(),
      permissions: z.array(z.string()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      const [updated] = await ctx.db
        .update(role)
        .set({
          name: input.name,
          description: input.description,
          permissions: input.permissions,
        })
        .where(and(eq(role.userId, userId), eq(role.key, input.key)))
        .returning();

      return updated ?? null;
    }),

  delete: protectedProcedure
    .input(z.object({ key: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id;

      await ctx.db
        .delete(role)
        .where(and(eq(role.userId, userId), eq(role.key, input.key)));

      return { success: true };
    }),
};