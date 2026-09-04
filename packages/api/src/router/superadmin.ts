import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod/v4";

import { and, desc, eq, inArray, sql } from "@acme/db";
import {
  agentSession,
  business,
  businessMember,
  metaConnection,
  metaWebhookEvent,
  order,
  platformSettings,
  product,
  subscription,
  user,
} from "@acme/db/schema";
import { createQueue } from "@acme/queue";

import { PLAN_CATALOG, type PlanKey } from "../lib/plans";
import { superadminProcedure } from "../trpc";
import { env } from "@acme/env";

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

  /**
   * AI Usage, Costs & Token Analytics — Phase 2
   */
  getAiObservability: superadminProcedure.query(async ({ ctx }) => {
    const subs = await ctx.db
      .select({
        subscriptionId: subscription.id,
        businessId: subscription.businessId,
        plan: subscription.plan,
        status: subscription.status,
        aiConversationsUsed: subscription.aiConversationsUsed,
        extraConversations: subscription.extraConversations,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        businessName: business.name,
        businessSlug: business.slug,
        businessLogo: business.logo,
      })
      .from(subscription)
      .innerJoin(business, eq(subscription.businessId, business.id));

    const storeIds = subs.map((s) => s.businessId).filter(Boolean) as string[];
    const ownerRows =
      storeIds.length > 0
        ? await ctx.db
            .select({
              businessId: businessMember.businessId,
              userId: user.id,
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
    const ownerByBusiness = new Map(ownerRows.map((o) => [o.businessId, o]));

    const [agentSessionsRow] = await ctx.db
      .select({ count: sql<number>`count(*)::int` })
      .from(agentSession);
    const totalAgentSessions = agentSessionsRow?.count ?? 0;

    let totalConversationsUsed = 0;
    const storeLeaderboard = subs.map((sub) => {
      const planKey = (sub.plan as PlanKey) in PLAN_CATALOG ? (sub.plan as PlanKey) : "starter";
      const planConfig = PLAN_CATALOG[planKey];
      const baseQuota = planConfig?.limits.aiConversationsPerMonth ?? 500;
      const totalQuota = baseQuota + (sub.extraConversations ?? 0);
      const used = sub.aiConversationsUsed ?? 0;
      totalConversationsUsed += used;

      const estimatedCostUsd = Number((used * 0.000188).toFixed(4));
      const estimatedCostBdt = Math.round(estimatedCostUsd * 120);
      const usagePct = totalQuota > 0 ? Math.min(100, Math.round((used / totalQuota) * 100)) : 0;

      return {
        businessId: sub.businessId,
        businessName: sub.businessName,
        businessSlug: sub.businessSlug,
        businessLogo: sub.businessLogo,
        owner: ownerByBusiness.get(sub.businessId ?? "") ?? null,
        plan: sub.plan,
        status: sub.status,
        aiConversationsUsed: used,
        extraConversations: sub.extraConversations ?? 0,
        baseQuota,
        totalQuota,
        usagePct,
        estimatedCostUsd,
        estimatedCostBdt,
        currentPeriodEnd: sub.currentPeriodEnd,
      };
    });

    storeLeaderboard.sort((a, b) => b.aiConversationsUsed - a.aiConversationsUsed);

    const estimatedPromptTokens = totalConversationsUsed * 650;
    const estimatedCompletionTokens = totalConversationsUsed * 150;
    const totalTokens = estimatedPromptTokens + estimatedCompletionTokens;
    const totalEstimatedCostUsd = Number((totalConversationsUsed * 0.000188).toFixed(3));
    const totalEstimatedCostBdt = Math.round(totalEstimatedCostUsd * 120);

    return {
      kpis: {
        activeModel: env.OPENAI_MODEL,
        totalConversationsUsed,
        totalTokens,
        estimatedPromptTokens,
        estimatedCompletionTokens,
        totalEstimatedCostUsd,
        totalEstimatedCostBdt,
        totalAgentSessions,
        activeAiStores: storeLeaderboard.filter((s) => s.aiConversationsUsed > 0).length,
      },
      workloadBreakdown: [
        { label: "Customer DM Replies", pct: 82, tokens: Math.round(totalTokens * 0.82) },
        { label: "Product Vision & Catalog Ingestion", pct: 11, tokens: Math.round(totalTokens * 0.11) },
        { label: "Vector Embeddings & Semantic Search", pct: 7, tokens: Math.round(totalTokens * 0.07) },
      ],
      leaderboard: storeLeaderboard,
    };
  }),

  /**
   * Background Queue & Worker Health Monitor — Phase 2
   */
  getQueueHealth: superadminProcedure.query(async () => {
    const queue = createQueue();
    const isHealthy = await queue.isHealthy().catch(() => false);

    const QUEUE_DEFINITIONS = [
      { id: "meta-dm-reply", name: "Meta DM AI Replies", description: "Inbound customer messaging & AI response generation" },
      { id: "meta-comment-reply", name: "Meta Comment Replies", description: "Facebook & Instagram post comment automation" },
      { id: "product-image-index", name: "Product Visual Search", description: "Image embedding & semantic product indexing" },
      { id: "subscription-renewal", name: "Subscription Renewal", description: "Recurring SaaS charge and invoice renewal" },
      { id: "trial-expiry-sweep", name: "Trial Expiry Lifecycle", description: "Daily sweep for expired trials & notifications" },
      { id: "conversation-followup", name: "Abandoned Cart Sweeper", description: "Re-engagement followups for inactive chat sessions" },
      { id: "order-status-notify", name: "Order Notifications", description: "Customer order confirmation & status alerts" },
      { id: "activity-log", name: "Audit & Activity Logs", description: "Background recording of business activity events" },
    ];

    const queues = await Promise.all(
      QUEUE_DEFINITIONS.map(async (def) => {
        try {
          const stats = await queue.getStats(def.id);
          return {
            ...def,
            stats,
            status: stats.failed > 0 ? ("degraded" as const) : ("healthy" as const),
          };
        } catch {
          return {
            ...def,
            stats: { waiting: 0, active: 0, completed: 0, failed: 0, delayed: 0 },
            status: "offline" as const,
          };
        }
      }),
    );

    const totalActive = queues.reduce((sum, q) => sum + q.stats.active, 0);
    const totalWaiting = queues.reduce((sum, q) => sum + q.stats.waiting, 0);
    const totalFailed = queues.reduce((sum, q) => sum + q.stats.failed, 0);
    const totalCompleted = queues.reduce((sum, q) => sum + q.stats.completed, 0);

    return {
      provider: queue.name,
      isHealthy,
      summary: {
        totalActive,
        totalWaiting,
        totalFailed,
        totalCompleted,
      },
      queues,
    };
  }),

  /**
   * Meta & Channel Health Monitor — Phase 2
   */
  getChannelHealth: superadminProcedure.query(async ({ ctx }) => {
    const connections = await ctx.db
      .select({
        id: metaConnection.id,
        businessId: metaConnection.businessId,
        businessName: business.name,
        businessSlug: business.slug,
        platform: metaConnection.platform,
        platformAccountName: metaConnection.platformAccountName,
        facebookPageName: metaConnection.facebookPageName,
        instagramUsername: metaConnection.instagramUsername,
        status: metaConnection.status,
        updatedAt: metaConnection.updatedAt,
        connectedAt: metaConnection.connectedAt,
      })
      .from(metaConnection)
      .innerJoin(business, eq(metaConnection.businessId, business.id))
      .orderBy(desc(metaConnection.updatedAt));

    const totalWhatsApp = connections.filter((c) => c.platform === "whatsapp").length;
    const totalFacebook = connections.filter((c) => c.platform === "facebook_page").length;
    const totalInstagram = connections.filter((c) => c.platform === "instagram").length;
    const activeCount = connections.filter((c) => c.status === "active").length;
    const degradedCount = connections.length - activeCount;

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [recentEventsRow] = await ctx.db
      .select({ count: sql<number>`count(*)::int` })
      .from(metaWebhookEvent)
      .where(sql`${metaWebhookEvent.receivedAt} >= ${oneDayAgo}`);
    const eventsLast24h = recentEventsRow?.count ?? 0;

    return {
      counts: {
        total: connections.length,
        active: activeCount,
        degraded: degradedCount,
        whatsapp: totalWhatsApp,
        facebook: totalFacebook,
        instagram: totalInstagram,
        eventsLast24h,
      },
      connections,
    };
  }),

  /**
   * Superadmin Plan & Quota Override — Phase 2
   */
  updateStoreSubscription: superadminProcedure
    .input(
      z.object({
        businessId: z.string(),
        plan: z.enum(["starter", "growth", "pro"]).optional(),
        status: z.enum(["trialing", "active", "past_due", "cancelled"]).optional(),
        addExtraConversations: z.number().int().optional(),
        extendTrialDays: z.number().int().positive().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select()
        .from(subscription)
        .where(eq(subscription.businessId, input.businessId))
        .limit(1);

      if (!existing) {
        throw new Error("No subscription found for this business.");
      }

      const updates: Partial<typeof subscription.$inferInsert> = {};

      if (input.plan) {
        updates.plan = input.plan;
      }
      if (input.status) {
        updates.status = input.status;
      }
      if (typeof input.addExtraConversations === "number") {
        updates.extraConversations = Math.max(
          0,
          (existing.extraConversations ?? 0) + input.addExtraConversations,
        );
      }
      if (input.extendTrialDays) {
        const currentEnd = existing.currentPeriodEnd
          ? new Date(existing.currentPeriodEnd)
          : new Date();
        const baseDate = currentEnd.getTime() > Date.now() ? currentEnd : new Date();
        updates.currentPeriodEnd = new Date(
          baseDate.getTime() + input.extendTrialDays * 86400000,
        );
        updates.status = "trialing";
      }

      await ctx.db
        .update(subscription)
        .set(updates)
        .where(eq(subscription.id, existing.id));

      return { success: true };
    }),
} satisfies TRPCRouterRecord;
