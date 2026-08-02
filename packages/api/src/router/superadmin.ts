import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod/v4";

import { eq } from "@acme/db";
import { businessMember, business, platformSettings, user } from "@acme/db/schema";

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
   * List all stores (businesses) that a specific user belongs to.
   * Returns the member's business role alongside the store details.
   */
  listStoresOfUser: superadminProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({
          businessId: businessMember.businessId,
          memberRole: businessMember.role,
          customRoleKey: businessMember.customRoleKey,
          name: business.name,
          slug: business.slug,
          logo: business.logo,
          createdAt: business.createdAt,
        })
        .from(businessMember)
        .innerJoin(business, eq(businessMember.businessId, business.id))
        .where(eq(businessMember.userId, input.userId));

      return rows;
    }),

  /**
   * Enter any store by its businessId — no membership required.
   * Returns the slug so the superadmin can be redirected to
   * /{slug}/dashboard/* without needing to be a member.
   *
   * The superadmin's session is NOT switched to that org; they keep their
   * own identity. The frontend should open the store in a new tab or use
   * a read-only impersonation context.
   */
  getStoreAccess: superadminProcedure
    .input(z.object({ businessId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [org] = await ctx.db
        .select({
          id: business.id,
          name: business.name,
          slug: business.slug,
          logo: business.logo,
          createdAt: business.createdAt,
        })
        .from(business)
        .where(eq(business.id, input.businessId))
        .limit(1);

      if (!org) return null;

      // Fetch the owner of this store
      const [ownerRow] = await ctx.db
        .select({ userId: businessMember.userId, name: user.name, email: user.email })
        .from(businessMember)
        .innerJoin(user, eq(businessMember.userId, user.id))
        .where(eq(businessMember.businessId, input.businessId))
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

  /**
   * The PLATFORM's own SSLCommerz credentials — for SaaS billing only (business owners
   * paying SellPilot for their plan). Never used for any business's own customer checkout,
   * which reads that business's own credentials on businessProfile instead (see
   * checkout.ts / payments.ts). Never returns the password itself, just whether it's set —
   * same "don't echo secrets back" convention as anywhere else credentials are stored.
   */
  getPaymentSettings: superadminProcedure.query(async ({ ctx }) => {
    const [row] = await ctx.db.select().from(platformSettings).limit(1);
    return {
      storeId: row?.sslcommerzStoreId ?? "",
      hasPassword: Boolean(row?.sslcommerzStorePassword),
    };
  }),

  updatePaymentSettings: superadminProcedure
    .input(
      z.object({
        storeId: z.string().min(1),
        // Optional: leave blank on an update to keep the existing stored password.
        storePassword: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db.select().from(platformSettings).limit(1);
      const storePassword = input.storePassword?.trim() || existing?.sslcommerzStorePassword || null;

      if (existing) {
        await ctx.db
          .update(platformSettings)
          .set({ sslcommerzStoreId: input.storeId, sslcommerzStorePassword: storePassword })
          .where(eq(platformSettings.id, existing.id));
      } else {
        await ctx.db.insert(platformSettings).values({
          sslcommerzStoreId: input.storeId,
          sslcommerzStorePassword: storePassword,
        });
      }
      return { success: true };
    }),
} satisfies TRPCRouterRecord;
