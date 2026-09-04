import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod/v4";

import { and, desc, eq, inArray, sql } from "@acme/db";
import {
  business,
  businessMember,
  metaConnection,
  order,
  platformSettings,
  product,
  subscription,
  user,
} from "@acme/db/schema";

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
   * Platform KPI Overview — high-level metrics for the superadmin dashboard.
   */
  getPlatformOverview: superadminProcedure.query(async ({ ctx }) => {
    const [totalStoresRow] = await ctx.db
      .select({ count: sql<number>`count(*)::int` })
      .from(business);
    const totalStores = totalStoresRow?.count ?? 0;

    const [totalUsersRow] = await ctx.db
      .select({ count: sql<number>`count(*)::int` })
      .from(user);
    const totalUsers = totalUsersRow?.count ?? 0;

    const [ordersStats] = await ctx.db
      .select({
        count: sql<number>`count(*)::int`,
        gmv: sql<number>`coalesce(sum(case when status != 'cancelled' then total else 0 end), 0)::int`,
      })
      .from(order);
    const totalOrders = ordersStats?.count ?? 0;
    const totalGmv = ordersStats?.gmv ?? 0;

    const metaConnRows = await ctx.db
      .select({
        platform: metaConnection.platform,
        count: sql<number>`count(*)::int`,
      })
      .from(metaConnection)
      .groupBy(metaConnection.platform);

    const metaStats = {
      facebook: 0,
      instagram: 0,
      whatsapp: 0,
      total: 0,
    };
    for (const row of metaConnRows) {
      if (row.platform === "facebook_page") metaStats.facebook = row.count;
      else if (row.platform === "instagram") metaStats.instagram = row.count;
      else if (row.platform === "whatsapp") metaStats.whatsapp = row.count;
      metaStats.total += row.count;
    }

    const [aiUsageRow] = await ctx.db
      .select({
        total: sql<number>`coalesce(sum(ai_conversations_used), 0)::int`,
      })
      .from(subscription);
    const totalAiConversations = aiUsageRow?.total ?? 0;

    const subPlanRows = await ctx.db
      .select({
        plan: subscription.plan,
        count: sql<number>`count(*)::int`,
      })
      .from(subscription)
      .groupBy(subscription.plan);

    const recentStores = await ctx.db
      .select({
        id: business.id,
        name: business.name,
        slug: business.slug,
        logo: business.logo,
        createdAt: business.createdAt,
      })
      .from(business)
      .orderBy(desc(business.createdAt))
      .limit(5);

    const storeIds = recentStores.map((s) => s.id);
    const ownerRows =
      storeIds.length > 0
        ? await ctx.db
            .select({
              businessId: businessMember.businessId,
              name: user.name,
              email: user.email,
            })
            .from(businessMember)
            .innerJoin(user, eq(businessMember.userId, user.id))
            .where(
              and(
                inArray(businessMember.businessId, storeIds),
                eq(businessMember.role, "owner"),
              ),
            )
        : [];
    const ownerMap = new Map(ownerRows.map((o) => [o.businessId, o]));

    const recentOrders = await ctx.db
      .select({
        id: order.id,
        orderNumber: order.orderNumber,
        businessId: order.businessId,
        businessName: business.name,
        businessSlug: business.slug,
        customerName: order.customerName,
        total: order.total,
        status: order.status,
        channel: order.channel,
        createdAt: order.createdAt,
      })
      .from(order)
      .innerJoin(business, eq(order.businessId, business.id))
      .orderBy(desc(order.createdAt))
      .limit(5);

    return {
      kpis: {
        totalStores,
        totalUsers,
        totalOrders,
        totalGmv,
        metaStats,
        totalAiConversations,
      },
      storesByPlan: subPlanRows,
      recentStores: recentStores.map((s) => ({
        ...s,
        owner: ownerMap.get(s.id) ?? null,
      })),
      recentOrders,
    };
  }),

  /**
   * List all stores with their owner, team size, orders, GMV, products, channels, and subscription.
   */
  listStores: superadminProcedure.query(async ({ ctx }) => {
    const businesses = await ctx.db
      .select({
        id: business.id,
        name: business.name,
        slug: business.slug,
        logo: business.logo,
        createdAt: business.createdAt,
      })
      .from(business)
      .orderBy(desc(business.createdAt));

    if (businesses.length === 0) return [];

    const businessIds = businesses.map((b) => b.id);

    const ownerRows = await ctx.db
      .select({
        businessId: businessMember.businessId,
        userId: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
      })
      .from(businessMember)
      .innerJoin(user, eq(businessMember.userId, user.id))
      .where(
        and(
          inArray(businessMember.businessId, businessIds),
          eq(businessMember.role, "owner"),
        ),
      );
    const ownerByBusiness = new Map(ownerRows.map((o) => [o.businessId, o]));

    const memberCounts = await ctx.db
      .select({
        businessId: businessMember.businessId,
        count: sql<number>`count(*)::int`,
      })
      .from(businessMember)
      .where(inArray(businessMember.businessId, businessIds))
      .groupBy(businessMember.businessId);
    const memberCountByBusiness = new Map(
      memberCounts.map((m) => [m.businessId, m.count]),
    );

    const orderStats = await ctx.db
      .select({
        businessId: order.businessId,
        count: sql<number>`count(*)::int`,
        gmv: sql<number>`coalesce(sum(case when status != 'cancelled' then total else 0 end), 0)::int`,
      })
      .from(order)
      .where(inArray(order.businessId, businessIds))
      .groupBy(order.businessId);
    const orderStatsByBusiness = new Map(
      orderStats.map((o) => [o.businessId, o]),
    );

    const productCounts = await ctx.db
      .select({
        businessId: product.businessId,
        count: sql<number>`count(*)::int`,
      })
      .from(product)
      .where(inArray(product.businessId, businessIds))
      .groupBy(product.businessId);
    const productCountByBusiness = new Map(
      productCounts.map((p) => [p.businessId, p.count]),
    );

    const subscriptions = await ctx.db
      .select({
        businessId: subscription.businessId,
        plan: subscription.plan,
        status: subscription.status,
        aiConversationsUsed: subscription.aiConversationsUsed,
        amount: subscription.amount,
        billingCycle: subscription.billingCycle,
        currentPeriodEnd: subscription.currentPeriodEnd,
      })
      .from(subscription)
      .where(inArray(subscription.businessId, businessIds));
    const subByBusiness = new Map(subscriptions.map((s) => [s.businessId, s]));

    const metaConns = await ctx.db
      .select({
        businessId: metaConnection.businessId,
        platform: metaConnection.platform,
        platformAccountName: metaConnection.platformAccountName,
        facebookPageName: metaConnection.facebookPageName,
        instagramUsername: metaConnection.instagramUsername,
        status: metaConnection.status,
      })
      .from(metaConnection)
      .where(inArray(metaConnection.businessId, businessIds));
    const metaByBusiness = new Map<string, typeof metaConns>();
    for (const conn of metaConns) {
      const list = metaByBusiness.get(conn.businessId) ?? [];
      list.push(conn);
      metaByBusiness.set(conn.businessId, list);
    }

    return businesses.map((b) => {
      const orders = orderStatsByBusiness.get(b.id);
      const sub = subByBusiness.get(b.id);
      return {
        id: b.id,
        name: b.name,
        slug: b.slug,
        logo: b.logo,
        createdAt: b.createdAt,
        owner: ownerByBusiness.get(b.id) ?? null,
        membersCount: memberCountByBusiness.get(b.id) ?? 0,
        productsCount: productCountByBusiness.get(b.id) ?? 0,
        ordersCount: orders?.count ?? 0,
        totalGmv: orders?.gmv ?? 0,
        subscription: sub ?? null,
        metaConnections: metaByBusiness.get(b.id) ?? [],
      };
    });
  }),
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
        .select({
          userId: businessMember.userId,
          name: user.name,
          email: user.email,
        })
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
      const storePassword =
        input.storePassword?.trim() ||
        existing?.sslcommerzStorePassword ||
        null;

      if (existing) {
        await ctx.db
          .update(platformSettings)
          .set({
            sslcommerzStoreId: input.storeId,
            sslcommerzStorePassword: storePassword,
          })
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
