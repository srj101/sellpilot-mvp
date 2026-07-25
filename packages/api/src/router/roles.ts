import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod/v4";

import { desc, eq, and } from "@acme/db";
import { role, businessMember, businessInvitation, user, business } from "@acme/db/schema";

import { businessProcedure, protectedProcedure, publicProcedure, businessScopedProcedure } from "../trpc";

const RESOURCES = [
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
const ACTIONS = ["view", "create", "edit", "delete"] as const;

function perms(resources: readonly string[], actions: readonly string[]) {
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
const DEFAULT_ROLES = [
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

export const rolesRouter = {
  list: businessScopedProcedure.query(async ({ ctx }) => {
    const roles = await ctx.db
      .select()
      .from(role)
      .where(eq(role.businessId, ctx.businessId))
      .orderBy(desc(role.createdAt));

    if (roles.length === 0) {
      return DEFAULT_ROLES.map((r) => ({ ...r, id: r.key }));
    }

    return roles.map((r) => ({
      id: r.id,
      name: r.name,
      key: r.key,
      description: r.description ?? "",
      permissions: r.permissions,
    }));
  }),

  create: businessScopedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        key: z.string().min(1).regex(/^[a-z_]+$/),
        description: z.string().optional(),
        permissions: z.array(z.string()),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db
        .select({ id: role.id })
        .from(role)
        .where(and(eq(role.businessId, ctx.businessId), eq(role.key, input.key)))
        .limit(1);

      if (existing.length > 0) {
        throw new Error("Role with this key already exists");
      }

      const [newRole] = await ctx.db
        .insert(role)
        .values({
          userId: ctx.businessOwnerId,
          businessId: ctx.businessId,
          name: input.name,
          key: input.key,
          description: input.description,
          permissions: input.permissions,
        })
        .returning();

      return newRole;
    }),

  update: businessScopedProcedure
    .input(
      z.object({
        key: z.string(),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        permissions: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [updated] = await ctx.db
        .update(role)
        .set({
          name: input.name,
          description: input.description,
          permissions: input.permissions,
        })
        .where(and(eq(role.businessId, ctx.businessId), eq(role.key, input.key)))
        .returning();

      return updated ?? null;
    }),

  delete: businessScopedProcedure
    .input(z.object({ key: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(role).where(and(eq(role.businessId, ctx.businessId), eq(role.key, input.key)));
      return { success: true };
    }),

  // --- Team members & invitations -------------------------------------------------

  getInvitationDetails: publicProcedure
    .input(z.object({ invitationId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .select({
          email: businessInvitation.email,
          status: businessInvitation.status,
          role: businessInvitation.customRoleKey,
          expiresAt: businessInvitation.expiresAt,
          businessName: business.name,
        })
        .from(businessInvitation)
        .innerJoin(business, eq(businessInvitation.businessId, business.id))
        .where(eq(businessInvitation.id, input.invitationId))
        .limit(1);

      return row ?? null;
    }),

  /**
   * Stays on the plain `businessProcedure` (not `businessScopedProcedure`) because a brand-new account
   * with no store yet is a legitimate state here — it falls back to a self-only view
   * instead of throwing. Once `ctx.businessId` is set, it's already resolved from the
   * URL (not re-derived from a possibly-ambiguous `businessMember.userId` lookup), so it's correct
   * even for an account that owns more than one store.
   */
  listMembers: businessProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    if (!ctx.businessId) {
      return {
        businessId: null as string | null,
        currentUserRole: "owner" as const,
        canManageTeam: true,
        members: [
          {
            id: "self",
            userId,
            name: ctx.session.user.name,
            email: ctx.session.user.email,
            role: "owner",
            customRoleKey: null as string | null,
            isYou: true,
          },
        ],
        invitations: [] as (typeof businessInvitation.$inferSelect)[],
      };
    }

    const orgId = ctx.businessId;
    const [memberRows, invitationRows] = await Promise.all([
      ctx.db
        .select({
          id: businessMember.id,
          userId: businessMember.userId,
          role: businessMember.role,
          customRoleKey: businessMember.customRoleKey,
          name: user.name,
          email: user.email,
        })
        .from(businessMember)
        .innerJoin(user, eq(businessMember.userId, user.id))
        .where(eq(businessMember.businessId, orgId)),
      ctx.db
        .select()
        .from(businessInvitation)
        .where(and(eq(businessInvitation.businessId, orgId), eq(businessInvitation.status, "pending"))),
    ]);

    return {
      businessId: orgId,
      currentUserRole: ctx.memberRole,
      canManageTeam: ctx.memberRole === "owner" || ctx.customRoleKey === "admin",
      members: memberRows.map((m) => ({ ...m, isYou: m.userId === userId })),
      invitations: invitationRows,
    };
  }),

  /** Stays on `businessProcedure`: the first invite ever sent by an account creates its
   * business lazily, so "no store yet" is a legitimate state to handle here. */
  inviteMember: businessProcedure
    .input(z.object({ email: z.string().email(), customRoleKey: z.string() }))
    .mutation(async ({ ctx, input }) => {
      let businessId = ctx.businessId;
      let memberRole = ctx.memberRole;
      let customRoleKey = ctx.customRoleKey;

      if (!businessId) {
        const userId = ctx.session.user.id;
        businessId = `business_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
        await ctx.db.insert(business).values({
          id: businessId,
          name: `${ctx.session.user.name}'s Store`,
          slug: `store-${userId.slice(0, 10)}-${Date.now().toString(36)}`,
          createdAt: new Date(),
        });
        await ctx.db.insert(businessMember).values({
          id: `member_${Date.now().toString(36)}`,
          businessId,
          userId,
          role: "owner",
          createdAt: new Date(),
        });

        const [membership] = await ctx.db.select().from(businessMember).where(eq(businessMember.userId, userId)).limit(1);
        if (!membership) throw new Error("Failed to create business");
        memberRole = membership.role;
        customRoleKey = membership.customRoleKey;
      } else if (memberRole !== "owner" && customRoleKey !== "admin") {
        throw new Error("Only the store owner or an Admin can invite team members");
      }

      await ctx.db.insert(businessInvitation).values({
        id: `invitation_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`,
        businessId,
        email: input.email,
        role: "member",
        status: "pending",
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
        createdAt: new Date(),
        inviterId: ctx.session.user.id,
        customRoleKey: input.customRoleKey,
      });

      return { success: true };
    }),

  cancelInvitation: businessScopedProcedure
    .input(z.object({ invitationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.memberRole !== "owner" && ctx.customRoleKey !== "admin") {
        throw new Error("Only the store owner or an Admin can manage team members");
      }
      await ctx.authApi.cancelInvitation({ body: { invitationId: input.invitationId }, headers: ctx.headers });
      return { success: true };
    }),

  acceptInvitation: businessProcedure
    .input(z.object({ invitationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [inv] = await ctx.db.select().from(businessInvitation).where(eq(businessInvitation.id, input.invitationId)).limit(1);
      if (!inv) throw new Error("Invitation not found or already used");

      await ctx.authApi.acceptInvitation({ body: { invitationId: input.invitationId }, headers: ctx.headers });

      if (inv.customRoleKey) {
        await ctx.db
          .update(businessMember)
          .set({ customRoleKey: inv.customRoleKey })
          .where(and(eq(businessMember.businessId, inv.businessId), eq(businessMember.userId, ctx.session.user.id)));
      }

      const [org] = await ctx.db
        .select({ slug: business.slug })
        .from(business)
        .where(eq(business.id, inv.businessId))
        .limit(1);

      return { success: true, businessSlug: org?.slug ?? null };
    }),

  /** Pending invitations addressed to the caller's own email — for the in-app store-switcher panel. */
  listMyInvitations: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        id: businessInvitation.id,
        businessId: businessInvitation.businessId,
        role: businessInvitation.role,
        customRoleKey: businessInvitation.customRoleKey,
        expiresAt: businessInvitation.expiresAt,
        businessName: business.name,
      })
      .from(businessInvitation)
      .innerJoin(business, eq(businessInvitation.businessId, business.id))
      .where(and(eq(businessInvitation.email, ctx.session.user.email), eq(businessInvitation.status, "pending")));
    return rows;
  }),

  rejectInvitation: protectedProcedure
    .input(z.object({ invitationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.authApi.rejectInvitation({ body: { invitationId: input.invitationId }, headers: ctx.headers });
      return { success: true };
    }),

  updateMemberRole: businessScopedProcedure
    .input(z.object({ memberId: z.string(), customRoleKey: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.memberRole !== "owner" && ctx.customRoleKey !== "admin") {
        throw new Error("Only the store owner or an Admin can manage team members");
      }
      await ctx.db
        .update(businessMember)
        .set({ customRoleKey: input.customRoleKey })
        .where(and(eq(businessMember.id, input.memberId), eq(businessMember.businessId, ctx.businessId)));
      return { success: true };
    }),

  removeMember: businessScopedProcedure
    .input(z.object({ memberId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.memberRole !== "owner" && ctx.customRoleKey !== "admin") {
        throw new Error("Only the store owner or an Admin can manage team members");
      }
      await ctx.authApi.removeMember({
        body: { memberIdOrEmail: input.memberId, businessId: ctx.businessId },
        headers: ctx.headers,
      });
      return { success: true };
    }),
} satisfies TRPCRouterRecord;
