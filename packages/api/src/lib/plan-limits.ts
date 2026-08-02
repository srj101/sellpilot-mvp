import { TRPCError } from "@trpc/server";

import { count, eq } from "@acme/db";
import type { db as Db } from "@acme/db/client";
import { businessMember, product, subscription } from "@acme/db/schema";

import type { PlanKey } from "./plans";
import { PLAN_CATALOG } from "./plans";

type LimitResource = "products" | "seats";
type Channel = "messenger" | "instagram" | "whatsapp";

const CHANNEL_LABEL: Record<Channel, string> = {
  messenger: "Messenger",
  instagram: "Instagram",
  whatsapp: "WhatsApp",
};

/** Shared by assertPlanLimit and assertChannelAllowed — no subscription row is
 * defensive-only (shouldn't happen post-onboarding), falls back to the most
 * restrictive tier rather than let an unlimited default slip through. */
async function resolvePlanKey(db: typeof Db, businessId: string): Promise<PlanKey> {
  const [sub] = await db.select({ plan: subscription.plan }).from(subscription).where(eq(subscription.businessId, businessId)).limit(1);
  return (sub?.plan as PlanKey | undefined) ?? "starter";
}

/**
 * Feature gate shared by every mutation that adds to a plan-limited resource. Throws
 * FORBIDDEN with an upgrade-shaped message identical to what the billing dashboard's
 * usage meters show, so a user hits the same wording wherever the limit bites
 * (see SELLPILOT_PHASE1_BILLING_PAYMENTS_PLAN.md S4-D).
 */
export async function assertPlanLimit(
  ctx: { db: typeof Db; businessId: string },
  resource: LimitResource,
  additionalCount = 1,
): Promise<void> {
  const planKey = await resolvePlanKey(ctx.db, ctx.businessId);
  const { limits, name } = PLAN_CATALOG[planKey];

  if (resource === "products") {
    const [row] = await ctx.db
      .select({ value: count() })
      .from(product)
      .where(eq(product.businessId, ctx.businessId));
    const currentCount = row?.value ?? 0;
    if (currentCount + additionalCount > limits.products) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `You've hit your ${name} product limit (${limits.products}). Upgrade or remove products to add more.`,
      });
    }
  }

  if (resource === "seats") {
    if (limits.teamSeats === null) return; // unlimited
    const [row] = await ctx.db
      .select({ value: count() })
      .from(businessMember)
      .where(eq(businessMember.businessId, ctx.businessId));
    const currentCount = row?.value ?? 0;
    if (currentCount + additionalCount > limits.teamSeats) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `${name} allows ${limits.teamSeats} team member${limits.teamSeats === 1 ? "" : "s"}. Upgrade to invite more.`,
      });
    }
  }
}

/** Live product count against the plan limit — powers the "X of Y products, Z remaining"
 * banner on both the manual add form and the CSV bulk importer, so the limit is visible
 * before a user fills out a whole batch only to have it rejected at save. */
export async function getProductUsage(ctx: { db: typeof Db; businessId: string }): Promise<{
  plan: PlanKey;
  planName: string;
  limit: number;
  used: number;
  remaining: number;
}> {
  const planKey = await resolvePlanKey(ctx.db, ctx.businessId);
  const { limits, name } = PLAN_CATALOG[planKey];
  const [row] = await ctx.db
    .select({ value: count() })
    .from(product)
    .where(eq(product.businessId, ctx.businessId));
  const used = row?.value ?? 0;
  return { plan: planKey, planName: name, limit: limits.products, used, remaining: Math.max(0, limits.products - used) };
}

/**
 * Gates connecting a messaging channel by the current plan's `channels` list (spec §6:
 * Starter = Messenger only, Growth = +Instagram, Pro = +WhatsApp). Call this BEFORE
 * kicking off an OAuth/QR flow, not just at the final save — rejecting only after the
 * user has already done the Facebook login dance is a much worse experience than never
 * starting it.
 */
export async function assertChannelAllowed(ctx: { db: typeof Db; businessId: string }, channel: Channel): Promise<void> {
  const planKey = await resolvePlanKey(ctx.db, ctx.businessId);
  const { limits, name } = PLAN_CATALOG[planKey];

  if (!limits.channels.includes(channel)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `${name} doesn't include ${CHANNEL_LABEL[channel]}. Upgrade your plan to connect it.`,
    });
  }
}

/** Which channels the current plan allows — for rendering locked/unlocked state in the
 * Integrations UI, not just rejecting the mutation after the fact. */
export async function getPlanChannels(ctx: { db: typeof Db; businessId: string }): Promise<{ plan: PlanKey; channels: Channel[] }> {
  const planKey = await resolvePlanKey(ctx.db, ctx.businessId);
  return { plan: planKey, channels: PLAN_CATALOG[planKey].limits.channels };
}

type BooleanFeature = "offers" | "whiteLabel";

const FEATURE_LABEL: Record<BooleanFeature, string> = {
  offers: "Offers & Promotions",
  whiteLabel: "Custom branding / white-label",
};

function isFeatureEnabled(limits: (typeof PLAN_CATALOG)[PlanKey]["limits"], feature: BooleanFeature): boolean {
  if (feature === "offers") return limits.offersEnabled;
  if (feature === "whiteLabel") return limits.whiteLabelEnabled;
  return false;
}

/** Feature gate for plan-exclusive capabilities that aren't a countable resource (unlike
 * assertPlanLimit) or a channel — Offers and white-label branding (both Pro-only, except
 * offers which Growth also has). Mirrors assertChannelAllowed's throw shape so the
 * upgrade-message wording stays consistent. */
export async function assertPlanFeature(ctx: { db: typeof Db; businessId: string }, feature: BooleanFeature): Promise<void> {
  const planKey = await resolvePlanKey(ctx.db, ctx.businessId);
  const { limits, name } = PLAN_CATALOG[planKey];

  if (!isFeatureEnabled(limits, feature)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `${name} doesn't include ${FEATURE_LABEL[feature]}. Upgrade your plan to use it.`,
    });
  }
}

/** Non-throwing companion to assertPlanFeature — for a page/query that needs to render a
 * "read-only, upgrade to manage" state rather than erroring. */
export async function getPlanFeatureEnabled(ctx: { db: typeof Db; businessId: string }, feature: BooleanFeature): Promise<boolean> {
  const planKey = await resolvePlanKey(ctx.db, ctx.businessId);
  const { limits } = PLAN_CATALOG[planKey];
  return isFeatureEnabled(limits, feature);
}

type TieredFeature = "analytics" | "ecommerce" | "copilot";

/** Never throws — for read-heavy pages that should render a soft-lock/upgrade empty
 * state instead of erroring on load (matching the IntegrationCard / locked-page pattern). */
export async function getFeatureTier(
  ctx: { db: typeof Db; businessId: string },
  feature: TieredFeature,
): Promise<"none" | "basic" | "full"> {
  const planKey = await resolvePlanKey(ctx.db, ctx.businessId);
  const { limits } = PLAN_CATALOG[planKey];
  if (feature === "analytics") return limits.analyticsTier;
  if (feature === "ecommerce") return limits.ecommerceTier;
  return limits.copilotTier;
}
