import type { TRPCRouterRecord } from "@trpc/server";
import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";

import { and, count, desc, eq } from "@acme/db";
import type { db as Db } from "@acme/db/client";
import { business, businessMember, order, paymentMethod, product, saasInvoice, subscription } from "@acme/db/schema";

import type { BillingCycle, PlanKey } from "../lib/plans";
import { BILLING_CYCLES, CYCLE_META, PLAN_CATALOG, PLAN_KEYS, priceForCycle } from "../lib/plans";
import { CARD_AND_BANK_GATEWAYS, initiatePayment, resolvePlatformCredentials as resolvePlatformCredentialsRaw, validatePayment } from "../lib/sslcommerz";
import { businessScopedProcedure, ownerOnlyProcedure, publicProcedure } from "../trpc";

/** Thin TRPCError wrapper around sslcommerz.ts's shared resolvePlatformCredentials (also
 * used by the worker's subscription-renewal job) so a missing platform gateway surfaces as
 * a proper tRPC error here instead of a raw Error. */
async function resolvePlatformCredentials(db: typeof Db) {
  try {
    return await resolvePlatformCredentialsRaw(db);
  } catch (err) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: err instanceof Error ? err.message : "Payment gateway error." });
  }
}

const PlanKeySchema = z.enum(PLAN_KEYS);
const BillingCycleSchema = z.enum(BILLING_CYCLES);

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function planRank(plan: PlanKey): number {
  return PLAN_KEYS.indexOf(plan);
}

function invoiceNumber(): string {
  const year = new Date().getFullYear();
  // Global sequence would need a counter table; this timestamp-suffix is unique enough
  // at SellPilot's current scale and avoids per-tenant counter contention (billing plan Q6).
  return `SP-${year}-${Date.now().toString().slice(-6)}`;
}

function appUrl(): string {
  return process.env.APP_URL ?? "http://localhost:3000";
}

async function getSubscriptionRow(db: typeof Db, businessId: string) {
  const [row] = await db.select().from(subscription).where(eq(subscription.businessId, businessId)).limit(1);
  return row;
}

/**
 * Shared by getCurrent, getTrialStatus and the IPN handler so trial math never disagrees
 * with computeLockStatus in router/business.ts.
 */
function trialInfo(sub: { status: string; currentPeriodEnd: Date | null } | undefined) {
  const isTrialing = sub?.status === "trialing";
  const endsAt = sub?.currentPeriodEnd ?? null;
  const daysRemaining =
    isTrialing && endsAt ? Math.max(0, Math.ceil((endsAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : 0;
  return { isTrialing, daysRemaining, endsAt };
}

export const subscriptionRouter = {
  /** Full plan + status + usage context for the billing dashboard. Every member can read
   * it (not just the owner) since the trial banner shows on every dashboard page. */
  getCurrent: businessScopedProcedure.query(async ({ ctx }) => {
    const sub = await getSubscriptionRow(ctx.db, ctx.businessId);
    const [biz] = await ctx.db.select({ slug: business.slug }).from(business).where(eq(business.id, ctx.businessId)).limit(1);
    if (!sub) {
      return {
        plan: null,
        planName: null,
        status: null,
        billingCycle: null,
        amount: 0,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        pendingPlan: null,
        failedPaymentCount: 0,
        isTrialing: false,
        daysRemaining: 0,
        endsAt: null,
        defaultPaymentMethod: null,
        businessSlug: biz?.slug ?? null,
      };
    }

    const catalogEntry = PLAN_CATALOG[sub.plan as PlanKey];
    const [defaultMethod] = await ctx.db
      .select({ id: paymentMethod.id, brand: paymentMethod.brand, last4: paymentMethod.last4, expiryMonth: paymentMethod.expiryMonth, expiryYear: paymentMethod.expiryYear })
      .from(paymentMethod)
      .where(and(eq(paymentMethod.businessId, ctx.businessId), eq(paymentMethod.isDefault, true)))
      .limit(1);

    return {
      plan: sub.plan as PlanKey,
      planName: catalogEntry.name,
      status: sub.status,
      billingCycle: sub.billingCycle as BillingCycle,
      amount: sub.amount,
      currentPeriodStart: sub.currentPeriodStart,
      currentPeriodEnd: sub.currentPeriodEnd,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      pendingPlan: sub.pendingPlan as PlanKey | null,
      failedPaymentCount: sub.failedPaymentCount,
      ...trialInfo(sub),
      defaultPaymentMethod: defaultMethod ?? null,
      businessSlug: biz?.slug ?? null,
    };
  }),

  /** Cheap, called on every dashboard page load for the trial banner (tracker 10.1). */
  getTrialStatus: businessScopedProcedure.query(async ({ ctx }) => {
    const sub = await getSubscriptionRow(ctx.db, ctx.businessId);
    const [hasMethod] = await ctx.db
      .select({ id: paymentMethod.id })
      .from(paymentMethod)
      .where(eq(paymentMethod.businessId, ctx.businessId))
      .limit(1);
    return { ...trialInfo(sub), hasPaymentMethod: Boolean(hasMethod) };
  }),

  /** Live counts, not just stored counters, so usage can't silently drift from reality. */
  getUsage: businessScopedProcedure.query(async ({ ctx }) => {
    const sub = await getSubscriptionRow(ctx.db, ctx.businessId);
    const planKey = (sub?.plan as PlanKey | undefined) ?? "starter";
    const limits = PLAN_CATALOG[planKey].limits;

    const [productsRow, seatsRow, invoicesRow] = await Promise.all([
      ctx.db.select({ value: count() }).from(product).where(eq(product.businessId, ctx.businessId)),
      ctx.db.select({ value: count() }).from(businessMember).where(eq(businessMember.businessId, ctx.businessId)),
      ctx.db.select({ value: count() }).from(order).where(eq(order.businessId, ctx.businessId)),
    ]);
    const productsUsed = productsRow[0]?.value ?? 0;
    const seatsUsed = seatsRow[0]?.value ?? 0;
    const invoicesUsed = invoicesRow[0]?.value ?? 0;

    const pct = (used: number, limit: number | null) => (limit === null ? null : Math.min(100, Math.round((used / limit) * 100)));

    return {
      aiConversations: { used: sub?.aiConversationsUsed ?? 0, limit: limits.aiConversationsPerMonth, pct: pct(sub?.aiConversationsUsed ?? 0, limits.aiConversationsPerMonth) },
      products: { used: productsUsed, limit: limits.products, pct: pct(productsUsed, limits.products) },
      seats: { used: seatsUsed, limit: limits.teamSeats, pct: pct(seatsUsed, limits.teamSeats) },
      invoices: { used: invoicesUsed, limit: limits.invoices, pct: pct(invoicesUsed, limits.invoices) },
    };
  }),

  /** Starts a SaaS checkout for a fresh subscribe or an owner explicitly picking a plan
   * (e.g. from the locked page). Does NOT flip subscription status — markInvoicePaid does,
   * called from the IPN, which is the only trustworthy confirmation channel. */
  subscribe: ownerOnlyProcedure
    .input(z.object({ plan: PlanKeySchema, billingCycle: BillingCycleSchema }))
    .mutation(async ({ ctx, input }) => {
      const amount = priceForCycle(input.plan, input.billingCycle);
      if (amount === null) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Lifetime pricing isn't available yet — please contact sales." });
      }

      const periodStart = new Date();
      const months = CYCLE_META[input.billingCycle].months;
      const periodEnd = addMonths(periodStart, months || 12); // lifetime has 0 months; treat as a 1yr ledger period

      const [invoice] = await ctx.db
        .insert(saasInvoice)
        .values({
          businessId: ctx.businessId,
          invoiceNumber: invoiceNumber(),
          plan: input.plan,
          billingCycle: input.billingCycle,
          amount,
          status: "pending",
          periodStart,
          periodEnd,
        })
        .returning();
      if (!invoice) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create invoice." });

      const base = `${appUrl()}/api/billing`;
      const result = await initiatePayment({
        credentials: await resolvePlatformCredentials(ctx.db),
        transactionId: invoice.id,
        amount,
        customerName: ctx.session.user.name,
        customerPhone: "N/A",
        productName: `SellPilot ${PLAN_CATALOG[input.plan].name} — ${CYCLE_META[input.billingCycle].label}`,
        successUrl: `${base}/success`,
        failUrl: `${base}/fail`,
        cancelUrl: `${base}/cancel`,
        ipnUrl: `${base}/ipn`,
        // Card + bank only — bKash/Nagad must never appear on SaaS billing (D5).
        restrictedGateways: CARD_AND_BANK_GATEWAYS,
      });

      if (!result.ok) {
        await ctx.db.update(saasInvoice).set({ status: "failed", failureReason: result.reason }).where(eq(saasInvoice.id, invoice.id));
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.reason });
      }

      return { gatewayUrl: result.gatewayUrl };
    }),

  /** Upgrade: prorates the unused portion of the current period and charges the difference
   * immediately. Downgrade: blocked if current usage exceeds the new plan's limits (S2-E),
   * otherwise deferred to period end via pendingPlan so existing members/products are never
   * force-removed mid-cycle. */
  changePlan: ownerOnlyProcedure
    .input(z.object({ plan: PlanKeySchema, billingCycle: BillingCycleSchema }))
    .mutation(async ({ ctx, input }) => {
      const sub = await getSubscriptionRow(ctx.db, ctx.businessId);
      if (!sub) throw new TRPCError({ code: "NOT_FOUND", message: "No subscription found." });

      const newAmount = priceForCycle(input.plan, input.billingCycle);
      if (newAmount === null) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Lifetime pricing isn't available yet — please contact sales." });
      }

      const isDowngrade = planRank(input.plan) < planRank(sub.plan as PlanKey);

      if (isDowngrade) {
        const newLimits = PLAN_CATALOG[input.plan].limits;
        const [productsRow, seatsRow] = await Promise.all([
          ctx.db.select({ value: count() }).from(product).where(eq(product.businessId, ctx.businessId)),
          ctx.db.select({ value: count() }).from(businessMember).where(eq(businessMember.businessId, ctx.businessId)),
        ]);
        const productsUsed = productsRow[0]?.value ?? 0;
        const seatsUsed = seatsRow[0]?.value ?? 0;
        if (productsUsed > newLimits.products) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `${PLAN_CATALOG[input.plan].name} allows ${newLimits.products} products; you have ${productsUsed}. Remove products first, or the change will apply at period end.`,
          });
        }
        if (newLimits.teamSeats !== null && seatsUsed > newLimits.teamSeats) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: `${PLAN_CATALOG[input.plan].name} allows ${newLimits.teamSeats} team member${newLimits.teamSeats === 1 ? "" : "s"}; you have ${seatsUsed}. Existing members stay — remove some, or the change applies at period end and blocks new invites until then.`,
          });
        }

        await ctx.db.update(subscription).set({ pendingPlan: input.plan }).where(eq(subscription.businessId, ctx.businessId));
        return { applied: false as const, effectiveAt: sub.currentPeriodEnd };
      }

      // Upgrade: credit the unused portion of the current period against the new price.
      const now = Date.now();
      const start = sub.currentPeriodStart.getTime();
      const end = (sub.currentPeriodEnd ?? sub.currentPeriodStart).getTime();
      const totalMs = Math.max(1, end - start);
      const remainingFraction = Math.max(0, Math.min(1, (end - now) / totalMs));
      const unusedCredit = Math.round(sub.amount * remainingFraction);
      const chargeNow = Math.max(0, newAmount - unusedCredit);

      const periodStart = new Date();
      const months = CYCLE_META[input.billingCycle].months;
      const periodEnd = addMonths(periodStart, months || 12);

      if (chargeNow === 0) {
        await ctx.db
          .update(subscription)
          .set({ plan: input.plan, billingCycle: input.billingCycle, amount: newAmount, status: "active", currentPeriodStart: periodStart, currentPeriodEnd: periodEnd, pendingPlan: null })
          .where(eq(subscription.businessId, ctx.businessId));
        return { applied: true as const, gatewayUrl: null };
      }

      const [invoice] = await ctx.db
        .insert(saasInvoice)
        .values({
          businessId: ctx.businessId,
          invoiceNumber: invoiceNumber(),
          plan: input.plan,
          billingCycle: input.billingCycle,
          amount: chargeNow,
          status: "pending",
          periodStart,
          periodEnd,
        })
        .returning();
      if (!invoice) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to create invoice." });

      const base = `${appUrl()}/api/billing`;
      const result = await initiatePayment({
        credentials: await resolvePlatformCredentials(ctx.db),
        transactionId: invoice.id,
        amount: chargeNow,
        customerName: ctx.session.user.name,
        customerPhone: "N/A",
        productName: `SellPilot ${PLAN_CATALOG[input.plan].name} — ${CYCLE_META[input.billingCycle].label} (prorated)`,
        successUrl: `${base}/success`,
        failUrl: `${base}/fail`,
        cancelUrl: `${base}/cancel`,
        ipnUrl: `${base}/ipn`,
        restrictedGateways: CARD_AND_BANK_GATEWAYS,
      });

      if (!result.ok) {
        await ctx.db.update(saasInvoice).set({ status: "failed", failureReason: result.reason }).where(eq(saasInvoice.id, invoice.id));
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.reason });
      }

      return { applied: false as const, gatewayUrl: result.gatewayUrl };
    }),

  /** Never deletes data — just schedules the lock for period end (S2-F). */
  cancel: ownerOnlyProcedure.mutation(async ({ ctx }) => {
    const sub = await getSubscriptionRow(ctx.db, ctx.businessId);
    if (!sub) throw new TRPCError({ code: "NOT_FOUND", message: "No subscription found." });
    await ctx.db.update(subscription).set({ cancelAtPeriodEnd: true, cancelledAt: new Date() }).where(eq(subscription.businessId, ctx.businessId));
    return { effectiveAt: sub.currentPeriodEnd };
  }),

  resume: ownerOnlyProcedure.mutation(async ({ ctx }) => {
    await ctx.db.update(subscription).set({ cancelAtPeriodEnd: false, cancelledAt: null }).where(eq(subscription.businessId, ctx.businessId));
    return { ok: true };
  }),

  listPaymentMethods: ownerOnlyProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select({
        id: paymentMethod.id,
        brand: paymentMethod.brand,
        last4: paymentMethod.last4,
        expiryMonth: paymentMethod.expiryMonth,
        expiryYear: paymentMethod.expiryYear,
        cardholderName: paymentMethod.cardholderName,
        isDefault: paymentMethod.isDefault,
      })
      .from(paymentMethod)
      .where(eq(paymentMethod.businessId, ctx.businessId))
      .orderBy(desc(paymentMethod.isDefault), desc(paymentMethod.createdAt));
  }),

  /**
   * SSLCommerz doesn't expose a standalone card-vaulting endpoint in this integration —
   * saving a card piggybacks on a small, real ৳10 verification charge through the same
   * checkout gateway (card/bank only, D5); the IPN captures the card details from the
   * validator response and stores them. This is a pragmatic simplification — verify
   * against SSLCommerz's actual stored-card product before relying on it for real cards.
   */
  addPaymentMethod: ownerOnlyProcedure.mutation(async ({ ctx }) => {
    const base = `${appUrl()}/api/billing`;
    const verificationRef = `pm_setup_${ctx.businessId}_${Date.now()}`;
    const result = await initiatePayment({
      credentials: await resolvePlatformCredentials(ctx.db),
      transactionId: verificationRef,
      amount: 10,
      customerName: ctx.session.user.name,
      customerPhone: "N/A",
      productName: "SellPilot — Add payment method",
      successUrl: `${base}/success`,
      failUrl: `${base}/fail`,
      cancelUrl: `${base}/cancel`,
      ipnUrl: `${base}/ipn`,
      restrictedGateways: CARD_AND_BANK_GATEWAYS,
    });
    if (!result.ok) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.reason });
    return { gatewayUrl: result.gatewayUrl };
  }),

  removePaymentMethod: ownerOnlyProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const sub = await getSubscriptionRow(ctx.db, ctx.businessId);
      const methods = await ctx.db.select({ id: paymentMethod.id }).from(paymentMethod).where(eq(paymentMethod.businessId, ctx.businessId));

      if (methods.length === 1 && sub?.status === "active" && !sub.cancelAtPeriodEnd) {
        throw new TRPCError({ code: "FORBIDDEN", message: "You can't remove your only payment method while your subscription is active — renewal would fail." });
      }

      await ctx.db.delete(paymentMethod).where(and(eq(paymentMethod.id, input.id), eq(paymentMethod.businessId, ctx.businessId)));
      return { ok: true };
    }),

  setDefaultPaymentMethod: ownerOnlyProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.transaction(async (tx) => {
        await tx.update(paymentMethod).set({ isDefault: false }).where(eq(paymentMethod.businessId, ctx.businessId));
        await tx.update(paymentMethod).set({ isDefault: true }).where(and(eq(paymentMethod.id, input.id), eq(paymentMethod.businessId, ctx.businessId)));
      });
      return { ok: true };
    }),

  /** Pays a specific overdue invoice the renewal worker already created — reuses the same
   * invoice id as tran_id so markInvoicePaid's IPN handling needs no changes. */
  retryInvoice: ownerOnlyProcedure
    .input(z.object({ invoiceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const [invoice] = await ctx.db
        .select()
        .from(saasInvoice)
        .where(and(eq(saasInvoice.id, input.invoiceId), eq(saasInvoice.businessId, ctx.businessId)))
        .limit(1);
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found." });
      if (invoice.status === "paid") throw new TRPCError({ code: "BAD_REQUEST", message: "This invoice is already paid." });

      const base = `${appUrl()}/api/billing`;
      const result = await initiatePayment({
        credentials: await resolvePlatformCredentials(ctx.db),
        transactionId: invoice.id,
        amount: invoice.amount,
        customerName: ctx.session.user.name,
        customerPhone: "N/A",
        productName: `SellPilot ${PLAN_CATALOG[invoice.plan as PlanKey].name} — renewal`,
        successUrl: `${base}/success`,
        failUrl: `${base}/fail`,
        cancelUrl: `${base}/cancel`,
        ipnUrl: `${base}/ipn`,
        restrictedGateways: CARD_AND_BANK_GATEWAYS,
      });
      if (!result.ok) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: result.reason });
      return { gatewayUrl: result.gatewayUrl };
    }),

  listInvoices: ownerOnlyProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(50) }).optional())
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select()
        .from(saasInvoice)
        .where(eq(saasInvoice.businessId, ctx.businessId))
        .orderBy(desc(saasInvoice.createdAt))
        .limit(input?.limit ?? 50);
    }),

  getInvoice: ownerOnlyProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const [invoice] = await ctx.db
        .select()
        .from(saasInvoice)
        .where(and(eq(saasInvoice.id, input.id), eq(saasInvoice.businessId, ctx.businessId)))
        .limit(1);
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found." });
      const [biz] = await ctx.db.select({ name: business.name }).from(business).where(eq(business.id, ctx.businessId)).limit(1);
      return { ...invoice, businessName: biz?.name ?? "" };
    }),

  /** Called only from apps/nextjs/src/app/api/billing/{success,ipn}/route.ts — never from
   * the browser directly. tranId is the saasInvoice id (or a card-verification ref). */
  markInvoicePaid: publicProcedure
    .input(z.object({ tranId: z.string(), valId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const result = await validatePayment(input.valId, await resolvePlatformCredentials(ctx.db));
      if (!result.valid || result.transactionId !== input.tranId) return { ok: false as const };

      // Card-verification charge from addPaymentMethod — not a real invoice.
      if (input.tranId.startsWith("pm_setup_")) {
        const businessId = input.tranId.split("_")[2];
        if (!businessId) return { ok: false as const };
        const hasExisting = await ctx.db.select({ id: paymentMethod.id }).from(paymentMethod).where(eq(paymentMethod.businessId, businessId)).limit(1);
        await ctx.db.insert(paymentMethod).values({
          businessId,
          userId: ctx.session?.user.id ?? "",
          brand: result.method === "card" ? "card" : (result.method ?? "card"),
          last4: "0000",
          expiryMonth: 12,
          expiryYear: new Date().getFullYear() + 3,
          provider: "sslcommerz",
          isDefault: hasExisting.length === 0,
        });
        const [biz] = await ctx.db.select({ slug: business.slug }).from(business).where(eq(business.id, businessId)).limit(1);
        return { ok: true as const, businessId, businessSlug: biz?.slug };
      }

      const [invoice] = await ctx.db.select().from(saasInvoice).where(eq(saasInvoice.id, input.tranId)).limit(1);
      if (!invoice) return { ok: false as const };

      const [biz] = await ctx.db.select({ slug: business.slug }).from(business).where(eq(business.id, invoice.businessId)).limit(1);

      // Idempotent — a gateway retry or the browser redirect racing the IPN must never
      // double-apply (billing plan E1/E2).
      if (invoice.status === "paid") return { ok: true as const, businessSlug: biz?.slug };

      if (result.amount !== undefined && Math.abs(result.amount - invoice.amount) > 1) {
        console.error(`[billing] amount mismatch on invoice ${invoice.id}: expected ${invoice.amount}, got ${result.amount}`);
        return { ok: false as const };
      }

      await ctx.db
        .update(saasInvoice)
        .set({ status: "paid", paidAt: new Date(), provider: "sslcommerz", providerTransactionId: input.valId })
        .where(eq(saasInvoice.id, invoice.id));

      await ctx.db
        .update(subscription)
        .set({
          plan: invoice.plan,
          billingCycle: invoice.billingCycle,
          amount: invoice.amount,
          status: "active",
          currentPeriodStart: invoice.periodStart,
          currentPeriodEnd: invoice.periodEnd,
          pendingPlan: null,
          failedPaymentCount: 0,
          cancelAtPeriodEnd: false,
          cancelledAt: null,
          aiConversationsUsed: 0,
          usageResetAt: new Date(),
          usageAlert80SentAt: null,
          usageAlert100SentAt: null,
        })
        .where(eq(subscription.businessId, invoice.businessId));

      return { ok: true as const, businessSlug: biz?.slug, invoiceId: invoice.id };
    }),
} satisfies TRPCRouterRecord;
