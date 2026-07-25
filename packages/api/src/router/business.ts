import type { TRPCRouterRecord } from "@trpc/server";
import { z } from "zod/v4";

import { and, eq, ilike } from "@acme/db";
import { businessMember, business, subscription } from "@acme/db/schema";
import { sendEmail } from "@acme/auth/email";

import { ownerOnlyProcedure, protectedProcedure, businessScopedProcedure, publicProcedure } from "../trpc";

function slugify(name: string) {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || `store-${Date.now().toString(36)}`
  );
}

async function uniqueSlugFor(ctx: { db: typeof import("@acme/db/client").db }, name: string) {
  const base = slugify(name);
  let candidate = base;
  let n = 1;
  // Name uniqueness is already enforced separately, so a collision here only happens when
  // two different names slugify to the same string (e.g. "Test!" and "Test?") — rare, so a
  // small numeric suffix is enough rather than always appending noise like a timestamp.
  while (true) {
    const [existing] = await ctx.db
      .select({ id: business.id })
      .from(business)
      .where(eq(business.slug, candidate))
      .limit(1);
    if (!existing) return candidate;
    n += 1;
    candidate = `${base}-${n}`;
  }
}

export const businessRouter = {
  /** Case-insensitive uniqueness check used while typing the store name. */
  verifyName: protectedProcedure
    .input(z.object({ name: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const [existing] = await ctx.db
        .select({ id: business.id })
        .from(business)
        .where(ilike(business.name, input.name.trim()))
        .limit(1);
      return { isAvailable: !existing };
    }),

  /** Onboarding: create the caller's first (or an additional) store, and make it active. */
  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      industry: z.string().optional(),
      address: z.string().optional(),
      defaultShippingCost: z.number().optional(),
      currency: z.enum(["BDT", "USD", "EUR", "GBP", "INR"]).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const name = input.name.trim();

      const [existing] = await ctx.db
        .select({ id: business.id })
        .from(business)
        .where(ilike(business.name, name))
        .limit(1);
      if (existing) {
        throw new Error(`A store named "${name}" already exists — try a different name.`);
      }

      const slug = await uniqueSlugFor(ctx, name);

      const businessId = `business_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;

      await ctx.db.insert(business).values({
        id: businessId,
        name,
        slug,
        metadata: input.description ? JSON.stringify({ description: input.description }) : null,
        createdAt: new Date(),
      });

      await ctx.db.insert(businessMember).values({
        id: `member_${Date.now().toString(36)}`,
        businessId,
        userId: ctx.session.user.id,
        role: "owner",
        createdAt: new Date(),
      });

      const { businessProfile, subscription } = await import("@acme/db/schema");
      await ctx.db.insert(businessProfile).values({
        userId: ctx.session.user.id,
        businessId,
        name,
        description: input.description,
        industry: input.industry,
        address: input.address,
        defaultShippingCost: input.defaultShippingCost ?? 0,
        currency: input.currency ?? "BDT",
      });

      const trialEnd = new Date();
      trialEnd.setDate(trialEnd.getDate() + 14);

      await ctx.db.insert(subscription).values({
        userId: ctx.session.user.id,
        businessId,
        plan: "pro",
        status: "trialing",
        billingCycle: "monthly",
        currentPeriodStart: new Date(),
        currentPeriodEnd: trialEnd,
        aiConversationsUsed: 0,
      });

      const { session } = await import("@acme/db/schema");
      await ctx.db.update(session)
        .set({ activeBusinessId: businessId })
        .where(eq(session.token, ctx.session.session.token));

      return { businessId, name, slug, trialEndsAt: trialEnd.toISOString() };
    }),

  /** Every store the caller belongs to (owned or invited into), for the store-switcher page. */
  listMine: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const activeBusinessId = (ctx.session.session as { activeBusinessId?: string | null }).activeBusinessId;

    const rows = await ctx.db
      .select({
        businessId: businessMember.businessId,
        role: businessMember.role,
        name: business.name,
        slug: business.slug,
        logo: business.logo,
        createdAt: business.createdAt,
        plan: subscription.plan,
        subscriptionStatus: subscription.status,
        currentPeriodEnd: subscription.currentPeriodEnd,
      })
      .from(businessMember)
      .innerJoin(business, eq(businessMember.businessId, business.id))
      .leftJoin(subscription, eq(subscription.businessId, business.id))
      .where(eq(businessMember.userId, userId));

    return rows.map((r) => ({ ...r, isActive: r.businessId === activeBusinessId }));
  }),

  setActive: protectedProcedure
    .input(z.object({ businessId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { session } = await import("@acme/db/schema");
      await ctx.db.update(session)
        .set({ activeBusinessId: input.businessId })
        .where(eq(session.token, ctx.session.session.token));
      return { success: true };
    }),

  /**
   * Called from [storeSlug]/layout.tsx on every store-scoped page load: resolves the store
   * by its URL slug, verifies the caller is actually a businessMember (never trust the URL alone),
   * and syncs it as the active org if it wasn't already — so the URL is authoritative, not
   * just cosmetic.
   */
  enterBySlug: protectedProcedure
    .input(z.object({ slug: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [org] = await ctx.db
        .select({ id: business.id, name: business.name })
        .from(business)
        .where(eq(business.slug, input.slug))
        .limit(1);
      if (!org) return { ok: false as const, reason: "not_found" as const };

      const [membership] = await ctx.db
        .select({ id: businessMember.id })
        .from(businessMember)
        .where(and(eq(businessMember.businessId, org.id), eq(businessMember.userId, ctx.session.user.id)))
        .limit(1);
      if (!membership) return { ok: false as const, reason: "forbidden" as const };

      const activeBusinessId = (ctx.session.session as { activeBusinessId?: string | null }).activeBusinessId;
      if (activeBusinessId !== org.id) {
        const { session } = await import("@acme/db/schema");
        await ctx.db.update(session)
          .set({ activeBusinessId: org.id })
          .where(eq(session.token, ctx.session.session.token));
      }

      return { ok: true as const, name: org.name };
    }),

  /**
   * Permanently delete the caller's store and all data inside it.
   * Only the store owner can do this — ownerOnlyProcedure enforces it.
   * All child rows (members, integrations, products, orders, …) are removed
   * by the ON DELETE CASCADE constraints on their businessId foreign keys.
   */
  delete: ownerOnlyProcedure.mutation(async ({ ctx }) => {
    await ctx.db.delete(business).where(eq(business.id, ctx.businessId));
    return { success: true };
  }),

  current: businessScopedProcedure.query(async ({ ctx }) => {
    const [org] = await ctx.db
      .select({
        id: business.id,
        name: business.name,
        slug: business.slug,
        logo: business.logo,
        metadata: business.metadata,
      })
      .from(business)
      .where(eq(business.id, ctx.businessId))
      .limit(1);
    if (!org) throw new Error("Store not found");
    return org;
  }),

  update: ownerOnlyProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        logo: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(business)
        .set({
          name: input.name.trim(),
          logo: input.logo || null,
          metadata: input.description?.trim() || null,
        })
        .where(eq(business.id, ctx.businessId));
      return { success: true };
    }),

  /** Onboarding logo step: a single-column update, so an omitted description can't clobber metadata like `update` would. */
  updateLogo: ownerOnlyProcedure
    .input(z.object({ logo: z.string().nullable() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(business)
        .set({ logo: input.logo })
        .where(eq(business.id, ctx.businessId));
      return { success: true };
    }),

  requestDemo: publicProcedure
    .input(z.object({
      fullName: z.string().min(1),
      email: z.string().email(),
      phone: z.string().optional(),
      businessName: z.string().optional(),
      message: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const salesEmail = process.env.SALES_EMAIL ?? "sales@sellpilot.ai";
      const lines = [
        `Name: ${input.fullName}`,
        `Email: ${input.email}`,
        input.phone ? `Phone: ${input.phone}` : null,
        input.businessName ? `Business: ${input.businessName}` : null,
        input.message ? `Message: ${input.message}` : null,
      ].filter((line): line is string => !!line);

      await sendEmail({
        to: salesEmail,
        subject: `New demo request — ${input.fullName}`,
        text: lines.join("\n"),
        html: `<pre style="font-family:inherit">${lines.join("<br/>")}</pre>`,
      });

      return { ok: true as const };
    }),

  getUploadUrl: ownerOnlyProcedure
    .input(z.object({ contentType: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const ext = input.contentType.split("/")[1] ?? "jpg";
      const key = `store-logos/${ctx.businessId}/logo-${Date.now()}.${ext}`;

      const { getPresignedUploadUrl, getPublicUrl } = await import("../lib/s3");
      const uploadUrl = await getPresignedUploadUrl(key, input.contentType);
      const publicUrl = getPublicUrl(key);

      return { uploadUrl, publicUrl, key };
    }),
} satisfies TRPCRouterRecord;
