import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod/v4";

import { eq } from "@acme/db";
import { member, organization, user } from "@acme/db/schema";

import { superadminProcedure } from "../trpc";

/**
 * Superadmin router — platform owner / developer only.
 *
 * Access is granted by setting user.role = 'superadmin' directly in the DB:
 *   UPDATE "user" SET role = 'superadmin' WHERE email = 'you@sellpilot.com';
 *
 * These routes bypass all store/org membership checks — the superadmin can
 * view any user's stores and enter any store dashboard without being a member.
 */
export const superadminRouter = {
  /**
   * List all registered users on the platform.
   * Returns lightweight info: id, name, email, role, banned, createdAt.
   */
  listUsers: superadminProcedure.query(async ({ ctx }) => {
    const users = await ctx.db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        banned: user.banned,
        banReason: user.banReason,
        createdAt: user.createdAt,
      })
      .from(user)
      .orderBy(user.createdAt);

    return users;
  }),

  /**
   * List all stores (organizations) that a specific user belongs to.
   * Returns the member's org role alongside the store details.
   */
  listStoresOfUser: superadminProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({
          organizationId: member.organizationId,
          memberRole: member.role,
          customRoleKey: member.customRoleKey,
          name: organization.name,
          slug: organization.slug,
          logo: organization.logo,
          createdAt: organization.createdAt,
        })
        .from(member)
        .innerJoin(organization, eq(member.organizationId, organization.id))
        .where(eq(member.userId, input.userId));

      return rows;
    }),

  /**
   * Enter any store by its organizationId — no membership required.
   * Returns the slug so the superadmin can be redirected to
   * /{slug}/dashboard/* without needing to be a member.
   *
   * The superadmin's session is NOT switched to that org; they keep their
   * own identity. The frontend should open the store in a new tab or use
   * a read-only impersonation context.
   */
  getStoreAccess: superadminProcedure
    .input(z.object({ organizationId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [org] = await ctx.db
        .select({
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
          logo: organization.logo,
          createdAt: organization.createdAt,
        })
        .from(organization)
        .where(eq(organization.id, input.organizationId))
        .limit(1);

      if (!org) return null;

      // Fetch the owner of this store
      const [ownerRow] = await ctx.db
        .select({ userId: member.userId, name: user.name, email: user.email })
        .from(member)
        .innerJoin(user, eq(member.userId, user.id))
        .where(eq(member.organizationId, input.organizationId))
        .limit(1);

      return {
        ...org,
        owner: ownerRow ?? null,
        dashboardUrl: `/${org.slug}/dashboard`,
      };
    }),

  /**
   * Ban or unban a user account.
   * Banned users cannot log in.
   */
  setBanStatus: superadminProcedure
    .input(
      z.object({
        userId: z.string(),
        banned: z.boolean(),
        banReason: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(user)
        .set({
          banned: input.banned,
          banReason: input.banned ? (input.banReason ?? null) : null,
          banExpires: null,
        })
        .where(eq(user.id, input.userId));

      return { success: true };
    }),
} satisfies TRPCRouterRecord;
