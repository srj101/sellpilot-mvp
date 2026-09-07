import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod/v4";

import { and, desc, eq, gt, gte, inArray, lte, or, sql } from "@acme/db";
import {
  activityLog,
  agentSession,
  bugReport,
  business,
  businessMember,
  metaConnection,
  metaWebhookEvent,
  notification,
  order,
  platformCostDaily,
  platformCostRate,
  platformSettings,
  product,
  saasInvoice,
  subscription,
  user,
} from "@acme/db/schema";
import { createQueue } from "@acme/queue";

import { PLAN_CATALOG, PLAN_KEYS, type PlanKey } from "../lib/plans";
import { microUsdToMicroBdt, MICRO } from "../lib/platform-cost";
import { superadminProcedure } from "../trpc";
import { env } from "@acme/env";

export interface AttentionItem {
  id: string;
  businessId: string | null;
  businessName: string;
  businessSlug: string | null;
  category:
    | "past_due"
    | "renewal_risk"
    | "storage_limit"
    | "channel_down"
    | "bug_report"
    | "unprofitable";
  categoryLabel: string;
  severity: "critical" | "warning" | "info";
  title: string;
  description: string;
  actionUrl: string;
  actionLabel: string;
  timestamp: Date | string;
}

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
   * Complete store detail query for dedicated store route — Phase 2
   */
  getStoreDetail: superadminProcedure
    .input(z.object({ businessId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [b] = await ctx.db
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

      if (!b) return null;

      const [owner] = await ctx.db
        .select({
          userId: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
          banned: user.banned,
          banReason: user.banReason,
        })
        .from(businessMember)
        .innerJoin(user, eq(businessMember.userId, user.id))
        .where(
          and(
            eq(businessMember.businessId, input.businessId),
            eq(businessMember.role, "owner"),
          ),
        )
        .limit(1);

      const [memberCountRow] = await ctx.db
        .select({ count: sql<number>`count(*)::int` })
        .from(businessMember)
        .where(eq(businessMember.businessId, input.businessId));

      const [orderStatsRow] = await ctx.db
        .select({
          count: sql<number>`count(*)::int`,
          gmv: sql<number>`coalesce(sum(case when status != 'cancelled' then total else 0 end), 0)::int`,
        })
        .from(order)
        .where(eq(order.businessId, input.businessId));

      const [productCountRow] = await ctx.db
        .select({ count: sql<number>`count(*)::int` })
        .from(product)
        .where(eq(product.businessId, input.businessId));

      const [subRow] = await ctx.db
        .select({
          id: subscription.id,
          businessId: subscription.businessId,
          plan: subscription.plan,
          status: subscription.status,
          amount: subscription.amount,
          aiConversationsUsed: subscription.aiConversationsUsed,
          extraConversations: subscription.extraConversations,
          currentPeriodEnd: subscription.currentPeriodEnd,
          storageUsedBytes: subscription.storageUsedBytes,
          failedPaymentCount: subscription.failedPaymentCount,
        })
        .from(subscription)
        .where(eq(subscription.businessId, input.businessId))
        .limit(1);

      const metaConns = await ctx.db
        .select({
          id: metaConnection.id,
          platform: metaConnection.platform,
          status: metaConnection.status,
          platformAccountName: metaConnection.platformAccountName,
          facebookPageName: metaConnection.facebookPageName,
          instagramUsername: metaConnection.instagramUsername,
          updatedAt: metaConnection.updatedAt,
        })
        .from(metaConnection)
        .where(eq(metaConnection.businessId, input.businessId));

      return {
        ...b,
        owner: owner ?? null,
        membersCount: memberCountRow?.count ?? 0,
        ordersCount: orderStatsRow?.count ?? 0,
        totalGmv: orderStatsRow?.gmv ?? 0,
        productsCount: productCountRow?.count ?? 0,
        subscription: subRow ?? null,
        metaConnections: metaConns,
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

    const aiSources = [
      "dm_reply",
      "comment_reply",
      "conversation_followup",
      "weekly_insights",
      "copilot",
      "product_keywords",
      "transcription",
    ];

    const aiCostRows = await ctx.db
      .select({
        source: platformCostDaily.source,
        microUsd: sql<number>`coalesce(sum(${platformCostDaily.costMicroUsd}), 0)::bigint`,
      })
      .from(platformCostDaily)
      .where(inArray(platformCostDaily.source, aiSources))
      .groupBy(platformCostDaily.source);

    const toTaka = async (microUsd: number) =>
      Math.round((await microUsdToMicroBdt(ctx.db, microUsd)) / MICRO);

    let totalRecordedAiMicroUsd = 0;
    const costByAiSource: { source: string; costUsd: number; costTaka: number }[] = [];
    for (const row of aiCostRows) {
      const mUsd = Number(row.microUsd);
      totalRecordedAiMicroUsd += mUsd;
      costByAiSource.push({
        source: row.source,
        costUsd: Number((mUsd / 1_000_000).toFixed(3)),
        costTaka: await toTaka(mUsd),
      });
    }

    const actualRecordedCostTaka = await toTaka(totalRecordedAiMicroUsd);
    const actualRecordedCostUsd = Number((totalRecordedAiMicroUsd / 1_000_000).toFixed(3));

    return {
      kpis: {
        activeModel: env.OPENAI_MODEL,
        totalConversationsUsed,
        totalTokens,
        estimatedPromptTokens,
        estimatedCompletionTokens,
        totalEstimatedCostUsd,
        totalEstimatedCostBdt,
        actualRecordedCostUsd,
        actualRecordedCostTaka,
        costByAiSource,
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

  /**
   * Phase 3: Global & Targeted System Broadcast
   */
  broadcastNotification: superadminProcedure
    .input(
      z.object({
        title: z.string().min(1).max(100),
        body: z.string().min(1).max(500),
        link: z.string().optional(),
        targetPlan: z.enum(["all", "starter", "growth", "pro"]).default("all"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      let businessesToNotify: { id: string }[] = [];

      if (input.targetPlan === "all") {
        businessesToNotify = await ctx.db.select({ id: business.id }).from(business);
      } else {
        businessesToNotify = await ctx.db
          .select({ id: subscription.businessId })
          .from(subscription)
          .where(eq(subscription.plan, input.targetPlan))
          .then((rows) => rows.filter((r) => Boolean(r.id)).map((r) => ({ id: r.id! })));
      }

      if (businessesToNotify.length === 0) {
        return { success: true, count: 0 };
      }

      const rows = businessesToNotify.map((b) => ({
        businessId: b.id,
        type: "system_announcement",
        title: `📢 ${input.title}`,
        body: input.body,
        link: input.link ?? null,
      }));

      // Chunk inserts in batches of 50
      for (let i = 0; i < rows.length; i += 50) {
        const batch = rows.slice(i, i + 50);
        await ctx.db.insert(notification).values(batch);
      }

      return { success: true, count: businessesToNotify.length };
    }),

  /**
   * Phase 3: Platform Security & Audit Trail
   */
  getAuditLogs: superadminProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(100).default(50),
          actionFilter: z.string().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 50;

      const logs = await ctx.db
        .select({
          id: activityLog.id,
          businessId: activityLog.businessId,
          businessName: business.name,
          businessSlug: business.slug,
          actorUserId: activityLog.actorUserId,
          actorName: activityLog.actorName,
          actorType: activityLog.actorType,
          action: activityLog.action,
          entityType: activityLog.entityType,
          entityId: activityLog.entityId,
          summary: activityLog.summary,
          metadata: activityLog.metadata,
          createdAt: activityLog.createdAt,
        })
        .from(activityLog)
        .leftJoin(business, eq(activityLog.businessId, business.id))
        .orderBy(desc(activityLog.createdAt))
        .limit(limit);

      return logs;
    }),

  /**
   * Phase 3: Store Suspension / Emergency Lock
   */
  toggleStoreSuspension: superadminProcedure
    .input(
      z.object({
        businessId: z.string(),
        suspend: z.boolean(),
        reason: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [sub] = await ctx.db
        .select({ id: subscription.id, status: subscription.status })
        .from(subscription)
        .where(eq(subscription.businessId, input.businessId))
        .limit(1);

      if (sub) {
        await ctx.db
          .update(subscription)
          .set({ status: input.suspend ? "past_due" : "active" })
          .where(eq(subscription.id, sub.id));
      }

      // Log the suspension/reactivation audit event
      await ctx.db.insert(activityLog).values({
        businessId: input.businessId,
        actorUserId: ctx.session.user.id,
        actorName: ctx.session.user.name ?? "Superadmin",
        actorType: "staff",
        action: input.suspend ? "store.suspended" : "store.reactivated",
        entityType: "subscription",
        entityId: sub?.id ?? input.businessId,
        summary: input.suspend
          ? `Store was suspended by Superadmin${input.reason ? `: ${input.reason}` : ""}`
          : "Store suspension was lifted by Superadmin",
        metadata: { reason: input.reason ?? null },
      });

      return { success: true };
    }),

  /**
   * Platform economics — revenue, spend and margin, in one place for the first time.
   *
   * getPlatformOverview above answers "how much are merchants selling" (their GMV).
   * Nothing anywhere answered "are WE profitable" — every input existed (subscription
   * revenue, the cost ledger from platform-cost.ts) and none of it had ever been joined.
   *
   * Revenue is read from saasInvoice (status="paid", by paidAt) rather than
   * subscription.amount: the invoice is the actual cash event, dated to the day it
   * happened, which is what a day-by-day revenue line needs. subscription.amount is a
   * snapshot of the *current* charge and has no history.
   *
   * Cost is read from platformCostDaily, never platformCostEvent directly — the rollup
   * exists exactly so this query stays a handful of grouped sums instead of scanning raw
   * usage rows. Converted to taka at TODAY's FX rate for display; the underlying ledger
   * stays in USD, which is the currency every vendor actually bills in.
   *
   * Deliberately omitted: a "cost per conversation" figure. The ledger prices tokens,
   * audio-seconds and emails — not "one reply" as its own countable unit — and deriving
   * that count from event rows would be a guess dressed up as a metric. Worth adding once
   * dm_reply gets a dedicated per-reply counter; better absent than approximate here.
   */
  getPlatformEconomics: superadminProcedure
    .input(z.object({ days: z.number().min(7).max(180).default(30) }).default({ days: 30 }))
    .query(async ({ ctx, input }) => {
      const cutoff = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);

      const [revenueByDayRows, costByDayRows, costBySourceRows, revenueByStoreRows, costByStoreRows, storesRow, fixedCostRow] =
        await Promise.all([
          ctx.db
            .select({
              day: sql<string>`date_trunc('day', ${saasInvoice.paidAt})::date`,
              takaCents: sql<number>`sum(${saasInvoice.amount})::int`,
            })
            .from(saasInvoice)
            .where(and(eq(saasInvoice.status, "paid"), gte(saasInvoice.paidAt, cutoff)))
            .groupBy(sql`1`)
            .orderBy(sql`1`),

          ctx.db
            .select({
              day: sql<string>`${platformCostDaily.day}::date`,
              microUsd: sql<number>`sum(${platformCostDaily.costMicroUsd})::bigint`,
            })
            .from(platformCostDaily)
            .where(gte(platformCostDaily.day, cutoff))
            .groupBy(platformCostDaily.day)
            .orderBy(platformCostDaily.day),

          ctx.db
            .select({
              source: platformCostDaily.source,
              microUsd: sql<number>`sum(${platformCostDaily.costMicroUsd})::bigint`,
            })
            .from(platformCostDaily)
            .where(gte(platformCostDaily.day, cutoff))
            .groupBy(platformCostDaily.source)
            .orderBy(sql`2 desc`),

          ctx.db
            .select({
              businessId: saasInvoice.businessId,
              taka: sql<number>`sum(${saasInvoice.amount})::int`,
            })
            .from(saasInvoice)
            .where(and(eq(saasInvoice.status, "paid"), gte(saasInvoice.paidAt, cutoff)))
            .groupBy(saasInvoice.businessId),

          ctx.db
            .select({
              businessId: platformCostDaily.businessId,
              microUsd: sql<number>`sum(${platformCostDaily.costMicroUsd})::bigint`,
            })
            .from(platformCostDaily)
            .where(gte(platformCostDaily.day, cutoff))
            .groupBy(platformCostDaily.businessId),

          ctx.db
            .select({ id: business.id, name: business.name, plan: subscription.plan })
            .from(business)
            .leftJoin(subscription, eq(subscription.businessId, business.id)),

          // businessId IS NULL rows are platform-wide fixed cost — not attributable to any
          // one store, so kept out of the per-store table and surfaced only in the totals.
          ctx.db
            .select({ microUsd: sql<number>`coalesce(sum(${platformCostDaily.costMicroUsd}), 0)::bigint` })
            .from(platformCostDaily)
            .where(and(gte(platformCostDaily.day, cutoff), sql`${platformCostDaily.businessId} is null`)),
        ]);

      // A dashboard estimate, not a frozen accounting record — the underlying event rows
      // keep their own point-in-time rate regardless of what this reads today.
      const toTaka = async (microUsd: number) => Math.round((await microUsdToMicroBdt(ctx.db, microUsd)) / MICRO);

      const revenueByDay = new Map(revenueByDayRows.map((r) => [r.day, r.takaCents]));
      const costByDayTaka = new Map<string, number>();
      for (const r of costByDayRows) costByDayTaka.set(r.day, await toTaka(Number(r.microUsd)));

      const days = [...new Set([...revenueByDay.keys(), ...costByDayTaka.keys()])].sort();
      const series = days.map((day) => ({
        day,
        revenueTaka: revenueByDay.get(day) ?? 0,
        costTaka: costByDayTaka.get(day) ?? 0,
      }));

      const costBySource = await Promise.all(
        costBySourceRows.map(async (r) => ({
          source: r.source,
          costTaka: await toTaka(Number(r.microUsd)),
        })),
      );

      const revenueByStore = new Map(revenueByStoreRows.map((r) => [r.businessId, r.taka]));
      const costByStoreTaka = new Map<string, number>();
      for (const r of costByStoreRows) {
        if (r.businessId) costByStoreTaka.set(r.businessId, await toTaka(Number(r.microUsd)));
      }

      const storeNames = new Map(storesRow.map((s) => [s.id, { name: s.name, plan: s.plan as PlanKey | null }]));

      const storeIds = new Set([...revenueByStore.keys(), ...costByStoreTaka.keys()].filter((id): id is string => !!id));
      const perStore = [...storeIds]
        .map((businessId) => {
          const revenueTaka = revenueByStore.get(businessId) ?? 0;
          const costTaka = costByStoreTaka.get(businessId) ?? 0;
          return {
            businessId,
            businessName: storeNames.get(businessId)?.name ?? "Unknown store",
            plan: storeNames.get(businessId)?.plan ?? null,
            revenueTaka,
            costTaka,
            marginTaka: revenueTaka - costTaka,
          };
        })
        // Losses first — that is the question a superadmin opens this screen to answer.
        .sort((a, b) => a.marginTaka - b.marginTaka);

      const marginByPlan = PLAN_KEYS.map((plan) => {
        const rows = perStore.filter((s) => s.plan === plan);
        return {
          plan,
          revenueTaka: rows.reduce((sum, s) => sum + s.revenueTaka, 0),
          costTaka: rows.reduce((sum, s) => sum + s.costTaka, 0),
          storeCount: rows.length,
        };
      });

      const totalRevenueTaka = perStore.reduce((sum, s) => sum + s.revenueTaka, 0);
      const totalStoreCostTaka = perStore.reduce((sum, s) => sum + s.costTaka, 0);
      const fixedCostTaka = await toTaka(Number(fixedCostRow[0]?.microUsd ?? 0));
      const totalCostTaka = totalStoreCostTaka + fixedCostTaka;

      return {
        days: input.days,
        kpis: {
          revenueTaka: totalRevenueTaka,
          costTaka: totalCostTaka,
          fixedCostTaka,
          marginTaka: totalRevenueTaka - totalCostTaka,
          marginPct: totalRevenueTaka > 0 ? ((totalRevenueTaka - totalCostTaka) / totalRevenueTaka) * 100 : null,
          losingStoreCount: perStore.filter((s) => s.marginTaka < 0).length,
        },
        series,
        costBySource,
        perStore,
        marginByPlan,
      };
    }),

  /**
   * Per-store economics procedure — Phase 2
   */
  getStoreEconomics: superadminProcedure
    .input(
      z.object({
        businessId: z.string(),
        days: z.number().min(7).max(180).default(30),
      }),
    )
    .query(async ({ ctx, input }) => {
      const cutoff = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);

      const [revenueByDayRows, costByDayRows, costBySourceRows, storeRow] =
        await Promise.all([
          ctx.db
            .select({
              day: sql<string>`date_trunc('day', ${saasInvoice.paidAt})::date`,
              taka: sql<number>`sum(${saasInvoice.amount})::int`,
            })
            .from(saasInvoice)
            .where(
              and(
                eq(saasInvoice.businessId, input.businessId),
                eq(saasInvoice.status, "paid"),
                gte(saasInvoice.paidAt, cutoff),
              ),
            )
            .groupBy(sql`1`)
            .orderBy(sql`1`),

          ctx.db
            .select({
              day: sql<string>`${platformCostDaily.day}::date`,
              microUsd: sql<number>`sum(${platformCostDaily.costMicroUsd})::bigint`,
            })
            .from(platformCostDaily)
            .where(
              and(
                eq(platformCostDaily.businessId, input.businessId),
                gte(platformCostDaily.day, cutoff),
              ),
            )
            .groupBy(platformCostDaily.day)
            .orderBy(platformCostDaily.day),

          ctx.db
            .select({
              source: platformCostDaily.source,
              microUsd: sql<number>`sum(${platformCostDaily.costMicroUsd})::bigint`,
            })
            .from(platformCostDaily)
            .where(
              and(
                eq(platformCostDaily.businessId, input.businessId),
                gte(platformCostDaily.day, cutoff),
              ),
            )
            .groupBy(platformCostDaily.source)
            .orderBy(sql`2 desc`),

          ctx.db
            .select({
              id: business.id,
              name: business.name,
              slug: business.slug,
              plan: subscription.plan,
            })
            .from(business)
            .leftJoin(subscription, eq(subscription.businessId, business.id))
            .where(eq(business.id, input.businessId))
            .limit(1),
        ]);

      const toTaka = async (microUsd: number) =>
        Math.round((await microUsdToMicroBdt(ctx.db, microUsd)) / MICRO);

      const revenueByDay = new Map(
        revenueByDayRows.map((r) => [r.day, r.taka]),
      );
      const costByDayTaka = new Map<string, number>();
      for (const r of costByDayRows) {
        costByDayTaka.set(r.day, await toTaka(Number(r.microUsd)));
      }

      const days = [
        ...new Set([...revenueByDay.keys(), ...costByDayTaka.keys()]),
      ].sort();
      const series = days.map((day) => ({
        day,
        revenueTaka: revenueByDay.get(day) ?? 0,
        costTaka: costByDayTaka.get(day) ?? 0,
      }));

      const costBySource = await Promise.all(
        costBySourceRows.map(async (r) => ({
          source: r.source,
          costTaka: await toTaka(Number(r.microUsd)),
        })),
      );

      const totalRevenueTaka = revenueByDayRows.reduce((sum, r) => sum + r.taka, 0);
      const totalCostTaka = Array.from(costByDayTaka.values()).reduce(
        (sum, c) => sum + c,
        0,
      );
      const marginTaka = totalRevenueTaka - totalCostTaka;
      const marginPct =
        totalRevenueTaka > 0
          ? ((totalRevenueTaka - totalCostTaka) / totalRevenueTaka) * 100
          : null;

      return {
        businessId: input.businessId,
        businessName: storeRow[0]?.name ?? "Store",
        plan: storeRow[0]?.plan ?? null,
        days: input.days,
        revenueTaka: totalRevenueTaka,
        costTaka: totalCostTaka,
        marginTaka,
        marginPct,
        series,
        costBySource,
      };
    }),

  /**
   * The "Today" Attention Queue — Phase 3
   * Consolidates cross-system priority signals requiring superadmin intervention.
   */
  getAttentionQueue: superadminProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const inThreeDays = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      failedSubRows,
      renewalRiskRows,
      allSubs,
      pausedChannelRows,
      openBugRows,
      recentRevenueRows,
      recentCostRows,
    ] = await Promise.all([
      // 1. Past due or failed payment count > 0
      ctx.db
        .select({
          id: subscription.id,
          businessId: subscription.businessId,
          status: subscription.status,
          failedPaymentCount: subscription.failedPaymentCount,
          plan: subscription.plan,
          businessName: business.name,
          businessSlug: business.slug,
          updatedAt: subscription.updatedAt,
        })
        .from(subscription)
        .innerJoin(business, eq(subscription.businessId, business.id))
        .where(
          or(
            eq(subscription.status, "past_due"),
            gt(subscription.failedPaymentCount, 0),
          ),
        ),

      // 2. Renewal due in <= 3 days
      ctx.db
        .select({
          id: subscription.id,
          businessId: subscription.businessId,
          status: subscription.status,
          currentPeriodEnd: subscription.currentPeriodEnd,
          plan: subscription.plan,
          businessName: business.name,
          businessSlug: business.slug,
        })
        .from(subscription)
        .innerJoin(business, eq(subscription.businessId, business.id))
        .where(
          and(
            inArray(subscription.status, ["active", "trialing"]),
            sql`${subscription.currentPeriodEnd} is not null`,
            gte(subscription.currentPeriodEnd, now),
            lte(subscription.currentPeriodEnd, inThreeDays),
          ),
        ),

      // 3. Storage check
      ctx.db
        .select({
          id: subscription.id,
          businessId: subscription.businessId,
          plan: subscription.plan,
          storageUsedBytes: subscription.storageUsedBytes,
          businessName: business.name,
          businessSlug: business.slug,
        })
        .from(subscription)
        .innerJoin(business, eq(subscription.businessId, business.id)),

      // 4. Paused channels
      ctx.db
        .select({
          id: metaConnection.id,
          businessId: metaConnection.businessId,
          platform: metaConnection.platform,
          status: metaConnection.status,
          updatedAt: metaConnection.updatedAt,
          businessName: business.name,
          businessSlug: business.slug,
        })
        .from(metaConnection)
        .innerJoin(business, eq(metaConnection.businessId, business.id))
        .where(eq(metaConnection.status, "paused")),

      // 5. Unresolved bug reports
      ctx.db
        .select({
          id: bugReport.id,
          businessId: bugReport.businessId,
          category: bugReport.category,
          severity: bugReport.severity,
          description: bugReport.description,
          status: bugReport.status,
          createdAt: bugReport.createdAt,
          businessName: business.name,
          businessSlug: business.slug,
        })
        .from(bugReport)
        .leftJoin(business, eq(bugReport.businessId, business.id))
        .where(sql`${bugReport.status} != 'resolved'`)
        .orderBy(desc(bugReport.createdAt))
        .limit(20),

      // 6. Economics: 30d revenue per store
      ctx.db
        .select({
          businessId: saasInvoice.businessId,
          taka: sql<number>`sum(${saasInvoice.amount})::int`,
        })
        .from(saasInvoice)
        .where(
          and(
            eq(saasInvoice.status, "paid"),
            gte(saasInvoice.paidAt, thirtyDaysAgo),
          ),
        )
        .groupBy(saasInvoice.businessId),

      // 6. Economics: 30d cost per store
      ctx.db
        .select({
          businessId: platformCostDaily.businessId,
          microUsd: sql<number>`sum(${platformCostDaily.costMicroUsd})::bigint`,
        })
        .from(platformCostDaily)
        .where(gte(platformCostDaily.day, thirtyDaysAgo))
        .groupBy(platformCostDaily.businessId),
    ]);

    const toTaka = async (microUsd: number) =>
      Math.round((await microUsdToMicroBdt(ctx.db, microUsd)) / MICRO);

    const items: AttentionItem[] = [];

    // 1. Process failed / past due
    for (const sub of failedSubRows) {
      items.push({
        id: `past-due-${sub.id}`,
        businessId: sub.businessId,
        businessName: sub.businessName,
        businessSlug: sub.businessSlug,
        category: "past_due",
        categoryLabel: "Billing Issue",
        severity: "critical",
        title:
          sub.status === "past_due"
            ? "Subscription Past Due"
            : `Payment Failed (${sub.failedPaymentCount} retry attempts)`,
        description: `Plan: ${sub.plan.toUpperCase()}. Immediate operator attention required to prevent service cutoff.`,
        actionUrl: `/superadmin/stores/${sub.businessId}`,
        actionLabel: "Review Store",
        timestamp: sub.updatedAt ?? now,
      });
    }

    // 2. Process renewal risk
    for (const sub of renewalRiskRows) {
      const daysLeft = sub.currentPeriodEnd
        ? Math.max(
            0,
            Math.ceil(
              (new Date(sub.currentPeriodEnd).getTime() - now.getTime()) /
                (1000 * 60 * 60 * 24),
            ),
          )
        : 0;
      items.push({
        id: `renewal-${sub.id}`,
        businessId: sub.businessId,
        businessName: sub.businessName,
        businessSlug: sub.businessSlug,
        category: "renewal_risk",
        categoryLabel: "Renewal Risk",
        severity: "warning",
        title: `Renewal due in ${daysLeft} day${daysLeft === 1 ? "" : "s"}`,
        description: `Plan: ${sub.plan.toUpperCase()}. Current period ends on ${sub.currentPeriodEnd ? new Date(sub.currentPeriodEnd).toLocaleDateString() : "N/A"}.`,
        actionUrl: `/superadmin/stores/${sub.businessId}`,
        actionLabel: "View Store",
        timestamp: sub.currentPeriodEnd ?? now,
      });
    }

    // 3. Process storage near limit (> 90%)
    for (const sub of allSubs) {
      const planKey = (sub.plan as PlanKey) in PLAN_CATALOG ? (sub.plan as PlanKey) : "starter";
      const limitGb = PLAN_CATALOG[planKey]?.limits.storageGb ?? 5;
      const limitBytes = limitGb * 1024 * 1024 * 1024;
      const usedBytes = sub.storageUsedBytes ?? 0;
      const pct = limitBytes > 0 ? (usedBytes / limitBytes) * 100 : 0;
      if (pct >= 90) {
        items.push({
          id: `storage-${sub.id}`,
          businessId: sub.businessId,
          businessName: sub.businessName,
          businessSlug: sub.businessSlug,
          category: "storage_limit",
          categoryLabel: "Storage Quota",
          severity: pct >= 98 ? "critical" : "warning",
          title: `Storage at ${Math.round(pct)}% capacity`,
          description: `Used ${(usedBytes / (1024 * 1024)).toFixed(1)} MB of ${limitGb * 1024} MB quota.`,
          actionUrl: `/superadmin/stores/${sub.businessId}`,
          actionLabel: "Manage Storage",
          timestamp: now,
        });
      }
    }

    // 4. Process paused channels
    for (const ch of pausedChannelRows) {
      const platformName =
        ch.platform === "facebook_page"
          ? "Facebook Page"
          : ch.platform === "instagram"
            ? "Instagram"
            : "WhatsApp";
      items.push({
        id: `channel-${ch.id}`,
        businessId: ch.businessId,
        businessName: ch.businessName,
        businessSlug: ch.businessSlug,
        category: "channel_down",
        categoryLabel: "Channel Paused",
        severity: "critical",
        title: `${platformName} integration is paused`,
        description: `Inbound messaging and automation disconnected for store /${ch.businessSlug}.`,
        actionUrl: `/superadmin/stores/${ch.businessId}`,
        actionLabel: "Inspect Store",
        timestamp: ch.updatedAt ?? now,
      });
    }

    // 5. Process open bug reports
    for (const bug of openBugRows) {
      const isCritical = bug.severity === "blocking";
      const isWarning = bug.severity === "annoying";
      const shortDesc =
        bug.description.length > 60
          ? `${bug.description.slice(0, 60)}…`
          : bug.description;
      items.push({
        id: `bug-${bug.id}`,
        businessId: bug.businessId,
        businessName: bug.businessName ?? "General Platform",
        businessSlug: bug.businessSlug ?? null,
        category: "bug_report",
        categoryLabel: "Support Bug",
        severity: isCritical ? "critical" : isWarning ? "warning" : "info",
        title: `Bug: ${shortDesc}`,
        description: `Category: ${bug.category.toUpperCase()} · Severity: ${bug.severity.toUpperCase()} · Status: ${bug.status}`,
        actionUrl: bug.businessId ? `/superadmin/stores/${bug.businessId}` : `/superadmin/support`,
        actionLabel: "Triage Bug",
        timestamp: bug.createdAt,
      });
    }

    // 6. Process unprofitable stores (last 30d)
    const revMap = new Map(recentRevenueRows.map((r) => [r.businessId, r.taka]));
    const costMap = new Map<string, number>();
    for (const r of recentCostRows) {
      if (r.businessId) {
        costMap.set(r.businessId, await toTaka(Number(r.microUsd)));
      }
    }

    const businessMap = new Map(allSubs.map((s) => [s.businessId, s]));
    for (const [businessId, costTaka] of costMap.entries()) {
      const revenueTaka = revMap.get(businessId) ?? 0;
      const marginTaka = revenueTaka - costTaka;
      if (marginTaka < 0 && costTaka > 100) {
        const s = businessMap.get(businessId);
        items.push({
          id: `unprofitable-${businessId}`,
          businessId,
          businessName: s?.businessName ?? "Store",
          businessSlug: s?.businessSlug ?? null,
          category: "unprofitable",
          categoryLabel: "Losing Margin",
          severity: "warning",
          title: `Negative 30-day margin: -৳${Math.abs(marginTaka).toLocaleString()}`,
          description: `Generated ৳${revenueTaka.toLocaleString()} revenue against ৳${costTaka.toLocaleString()} direct platform costs.`,
          actionUrl: `/superadmin/stores/${businessId}`,
          actionLabel: "View Economics",
          timestamp: now,
        });
      }
    }

    // Sort order: critical -> warning -> info, then newest first
    const severityRank: Record<AttentionItem["severity"], number> = {
      critical: 0,
      warning: 1,
      info: 2,
    };

    items.sort((a, b) => {
      const aRank = severityRank[a.severity] ?? 1;
      const bRank = severityRank[b.severity] ?? 1;
      const diff = aRank - bRank;
      if (diff !== 0) return diff;
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });

    return {
      items,
      counts: {
        total: items.length,
        critical: items.filter((i) => i.severity === "critical").length,
        warning: items.filter((i) => i.severity === "warning").length,
        info: items.filter((i) => i.severity === "info").length,
      },
    };
  }),

  /**
   * Prompt cache visibility — is OpenAI's caching actually working, per source and over
   * time. See docs/CACHING_PLAN.md for why dm_reply, copilot and product_keywords carry a
   * prompt_cache_key and the other three sources never will (their prompts sit under
   * OpenAI's 1024-token cache floor regardless of any key).
   *
   * Reads platformCostDaily exclusively, never the raw event table — the rollup's whole
   * purpose is to keep a dashboard query to a handful of grouped sums.
   *
   * "Messages", not just tokens: a call can be a PARTIAL cache hit (some tokens fresh, some
   * cached) or a full miss, and token-level percentages alone don't say how many distinct
   * replies actually benefited at all. Counted from eventCount rather than a stored
   * per-call flag — recordCostEvent only ever writes a `:cached_input` row when a call had
   * SOME cached tokens (a zero-quantity write is skipped, see platform-cost.ts), so summing
   * eventCount on that sku IS the count of calls with a hit. `:output` is the "one row per
   * call" denominator instead of `:input`, because a 100%-cached call (no fresh tokens at
   * all) writes no `:input` row either — but every real reply says something, so `:output`
   * is written unconditionally.
   */
  getPromptCacheStats: superadminProcedure
    .input(z.object({ days: z.number().min(7).max(180).default(30) }).default({ days: 30 }))
    .query(async ({ ctx, input }) => {
      const cutoff = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);
      const llmSources = [
        "dm_reply",
        "comment_reply",
        "conversation_followup",
        "weekly_insights",
        "copilot",
        "product_keywords",
      ];

      const [bySourceRows, byDayRows] = await Promise.all([
        ctx.db
          .select({
            source: platformCostDaily.source,
            // Suffix match, since sku carries the model name too ("gpt-5.4-mini:input").
            kind: sql<"fresh" | "cached" | "output" | "other">`
              case
                when ${platformCostDaily.sku} like '%:cached_input' then 'cached'
                when ${platformCostDaily.sku} like '%:input' then 'fresh'
                when ${platformCostDaily.sku} like '%:output' then 'output'
                else 'other'
              end`,
            tokens: sql<number>`sum(${platformCostDaily.quantity})::bigint`,
            calls: sql<number>`sum(${platformCostDaily.eventCount})::bigint`,
          })
          .from(platformCostDaily)
          .where(
            and(
              gte(platformCostDaily.day, cutoff),
              inArray(platformCostDaily.source, llmSources),
              eq(platformCostDaily.service, "openai"),
            ),
          )
          .groupBy(platformCostDaily.source, sql`2`),

        ctx.db
          .select({
            day: sql<string>`${platformCostDaily.day}::date`,
            kind: sql<"fresh" | "cached" | "other">`
              case
                when ${platformCostDaily.sku} like '%:cached_input' then 'cached'
                when ${platformCostDaily.sku} like '%:input' then 'fresh'
                else 'other'
              end`,
            tokens: sql<number>`sum(${platformCostDaily.quantity})::bigint`,
          })
          .from(platformCostDaily)
          .where(
            and(
              gte(platformCostDaily.day, cutoff),
              inArray(platformCostDaily.source, llmSources),
              eq(platformCostDaily.service, "openai"),
            ),
          )
          .groupBy(platformCostDaily.day, sql`2`)
          .orderBy(platformCostDaily.day),
      ]);

      // Fold the (source, kind) rows into one record per source.
      const bySource = new Map<
        string,
        { freshTokens: number; cachedTokens: number; outputCalls: number; hitCalls: number }
      >();
      for (const row of bySourceRows) {
        const entry = bySource.get(row.source) ?? {
          freshTokens: 0,
          cachedTokens: 0,
          outputCalls: 0,
          hitCalls: 0,
        };
        if (row.kind === "fresh") entry.freshTokens += Number(row.tokens);
        else if (row.kind === "cached") {
          entry.cachedTokens += Number(row.tokens);
          entry.hitCalls += Number(row.calls); // one eventCount per call that had a hit
        } else if (row.kind === "output") entry.outputCalls += Number(row.calls);
        bySource.set(row.source, entry);
      }

      const perSource = llmSources
        .map((source) => {
          const e = bySource.get(source) ?? {
            freshTokens: 0,
            cachedTokens: 0,
            outputCalls: 0,
            hitCalls: 0,
          };
          const totalPromptTokens = e.freshTokens + e.cachedTokens;
          return {
            source,
            freshTokens: e.freshTokens,
            cachedTokens: e.cachedTokens,
            // Null, not 0, when there's simply no traffic yet — 0% reads as "broken",
            // "no data" reads as "nothing to judge yet". Different facts.
            tokenCacheRatePct:
              totalPromptTokens > 0 ? Math.round((e.cachedTokens / totalPromptTokens) * 100) : null,
            totalCalls: e.outputCalls,
            hitCalls: e.hitCalls,
            messageCacheRatePct: e.outputCalls > 0 ? Math.round((e.hitCalls / e.outputCalls) * 100) : null,
          };
        })
        // Sources with zero traffic still get a row (so the "why" — under the cache floor,
        // or just unused — is visible), but the ones with real volume lead.
        .sort((a, b) => b.totalCalls - a.totalCalls);

      const totals = perSource.reduce(
        (acc, s) => ({
          freshTokens: acc.freshTokens + s.freshTokens,
          cachedTokens: acc.cachedTokens + s.cachedTokens,
          totalCalls: acc.totalCalls + s.totalCalls,
          hitCalls: acc.hitCalls + s.hitCalls,
        }),
        { freshTokens: 0, cachedTokens: 0, totalCalls: 0, hitCalls: 0 },
      );
      const totalPromptTokens = totals.freshTokens + totals.cachedTokens;

      // What a cache hit is actually worth: cached input is priced far below fresh input
      // (see cost-rates.json), so every cached token is a token that would otherwise have
      // cost the fresh rate. Read from the live price book rather than hardcoded, so this
      // number tracks a rate change automatically.
      const [inputRate, cachedRate] = await Promise.all([
        ctx.db
          .select({ microUsdPerUnit: platformCostRate.microUsdPerUnit, unitSize: platformCostRate.unitSize })
          .from(platformCostRate)
          .where(and(eq(platformCostRate.service, "openai"), sql`${platformCostRate.sku} like '%:input'`))
          .orderBy(desc(platformCostRate.effectiveFrom))
          .limit(1),
        ctx.db
          .select({ microUsdPerUnit: platformCostRate.microUsdPerUnit, unitSize: platformCostRate.unitSize })
          .from(platformCostRate)
          .where(and(eq(platformCostRate.service, "openai"), sql`${platformCostRate.sku} like '%:cached_input'`))
          .orderBy(desc(platformCostRate.effectiveFrom))
          .limit(1),
      ]);
      const freshMicroPerToken = inputRate[0] ? inputRate[0].microUsdPerUnit / inputRate[0].unitSize : 0;
      const cachedMicroPerToken = cachedRate[0] ? cachedRate[0].microUsdPerUnit / cachedRate[0].unitSize : 0;
      const savedMicroUsd = Math.round(totals.cachedTokens * (freshMicroPerToken - cachedMicroPerToken));
      const savedTaka = Math.round((await microUsdToMicroBdt(ctx.db, Math.max(0, savedMicroUsd))) / MICRO);

      // Daily trend — token-level only (the clearer signal at a daily granularity; message-
      // level would need a third grouped query for a chart nobody asked to see per-day).
      const byDay = new Map<string, { fresh: number; cached: number }>();
      for (const row of byDayRows) {
        if (row.kind !== "fresh" && row.kind !== "cached") continue;
        const entry = byDay.get(row.day) ?? { fresh: 0, cached: 0 };
        entry[row.kind] += Number(row.tokens);
        byDay.set(row.day, entry);
      }
      const series = [...byDay.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([day, { fresh, cached }]) => ({
          day,
          hitRatePct: fresh + cached > 0 ? Math.round((cached / (fresh + cached)) * 100) : null,
        }));

      return {
        days: input.days,
        kpis: {
          tokenCacheRatePct: totalPromptTokens > 0 ? Math.round((totals.cachedTokens / totalPromptTokens) * 100) : null,
          messageCacheRatePct: totals.totalCalls > 0 ? Math.round((totals.hitCalls / totals.totalCalls) * 100) : null,
          totalCalls: totals.totalCalls,
          hitCalls: totals.hitCalls,
          freshTokens: totals.freshTokens,
          cachedTokens: totals.cachedTokens,
          savedTaka,
        },
        perSource,
        series,
      };
    }),
} satisfies TRPCRouterRecord;
