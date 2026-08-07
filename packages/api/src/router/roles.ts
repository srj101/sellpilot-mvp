import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";

import { desc, eq, and } from "@acme/db";
import { role, businessMember, businessInvitation, user, business } from "@acme/db/schema";

import { DEFAULT_ROLES, resolvePermissions } from "../lib/permissions";
import { assertPlanLimit } from "../lib/plan-limits";
import { businessProcedure, protectedProcedure, permissionProcedure, publicProcedure, businessScopedProcedure } from "../trpc";

export const rolesRouter = {
  list: permissionProcedure("users", "view").query(async ({ ctx }) => {
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

  /** Resolves the caller's own effective permissions — used by the dashboard nav to hide pages the member can't reach. */
  getMyPermissions: businessScopedProcedure.query(async ({ ctx }) => {
    if (ctx.memberRole === "owner") {
      return { role: ctx.memberRole, permissions: ["*"] };
    }
    const permissions = await resolvePermissions(ctx.db, {
      memberRole: ctx.memberRole,
      customRoleKey: ctx.customRoleKey,
      businessId: ctx.businessId,
    });
    return { role: ctx.memberRole, permissions };
  }),

  create: permissionProcedure("users", "create")
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
        throw new TRPCError({ code: "CONFLICT", message: "Role with this key already exists" });
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

  update: permissionProcedure("users", "edit")
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

  delete: permissionProcedure("users", "delete")
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
          businessId: businessInvitation.businessId,
        })
        .from(businessInvitation)
        .innerJoin(business, eq(businessInvitation.businessId, business.id))
        .where(eq(businessInvitation.id, input.invitationId))
        .limit(1);

      if (!row) return null;

      // Only meaningful once a session exists — logged-out visitors just see the invite itself.
      let alreadyMember = false;
      if (ctx.session?.user) {
        const [existingMembership] = await ctx.db
          .select({ id: businessMember.id })
          .from(businessMember)
          .where(and(eq(businessMember.businessId, row.businessId), eq(businessMember.userId, ctx.session.user.id)))
          .limit(1);
        alreadyMember = !!existingMembership;
      }

      return { ...row, alreadyMember };
    }),

  /**
   * Stays on the plain `businessProcedure` (not `businessScopedProcedure`) because a brand-new account
   * with no store yet is a legitimate state here — it falls back to a self-only view
   * instead of throwing. Once `ctx.businessId` is set, it's already resolved from the
   * URL (not re-derived from a possibly-ambiguous `businessMember.userId` lookup), so it's correct
   * even for an account that owns more than one store.
   */
  listMembers: businessProcedure.query(async ({ ctx }) => {
    if (
      ctx.businessId &&
      !ctx.permissions.includes("*") &&
      !ctx.permissions.includes("users:view")
    ) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Your role doesn't allow you to view team members.",
      });
    }
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
      // Skip the seat gate for a business created moments ago by this very call (below) —
      // it has no subscription row yet, and the fallback-to-Starter default in
      // assertPlanLimit would otherwise block the owner's very first invite.
      const hadExistingBusiness = Boolean(ctx.businessId);

      if (
        ctx.businessId &&
        !ctx.permissions.includes("*") &&
        !ctx.permissions.includes("users:create")
      ) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Your role doesn't allow you to invite team members.",
        });
      }

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
        if (!membership) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create business" });
        memberRole = membership.role;
        customRoleKey = membership.customRoleKey;
      } else if (memberRole !== "owner" && customRoleKey !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the store owner or an Admin can invite team members" });
      }

      if (hadExistingBusiness) {
        await assertPlanLimit({ db: ctx.db, businessId }, "seats");
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

  cancelInvitation: permissionProcedure("users", "edit")
    .input(z.object({ invitationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.memberRole !== "owner" && ctx.customRoleKey !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the store owner or an Admin can manage team members" });
      }
      await ctx.authApi.cancelInvitation({ body: { invitationId: input.invitationId }, headers: ctx.headers });
      return { success: true };
    }),

  acceptInvitation: businessProcedure
    .input(z.object({ invitationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [inv] = await ctx.db.select().from(businessInvitation).where(eq(businessInvitation.id, input.invitationId)).limit(1);
      if (!inv) throw new TRPCError({ code: "NOT_FOUND", message: "Invitation not found or already used" });

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

  updateMemberRole: permissionProcedure("users", "edit")
    .input(z.object({ memberId: z.string(), customRoleKey: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.memberRole !== "owner" && ctx.customRoleKey !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the store owner or an Admin can manage team members" });
      }
      await ctx.db
        .update(businessMember)
        .set({ customRoleKey: input.customRoleKey })
        .where(and(eq(businessMember.id, input.memberId), eq(businessMember.businessId, ctx.businessId)));
      return { success: true };
    }),

  removeMember: permissionProcedure("users", "delete")
    .input(z.object({ memberId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.memberRole !== "owner" && ctx.customRoleKey !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only the store owner or an Admin can manage team members" });
      }
      await ctx.authApi.removeMember({
        body: { memberIdOrEmail: input.memberId, businessId: ctx.businessId },
        headers: ctx.headers,
      });
      return { success: true };
    }),
} satisfies TRPCRouterRecord;
