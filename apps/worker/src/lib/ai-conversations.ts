import { eq, sql } from "@acme/db";
import { db } from "@acme/db/client";
import { subscription } from "@acme/db/schema";
import { PLAN_CATALOG, type PlanKey } from "@acme/api/plans";
import { checkUsageAlerts } from "./usage-alerts.js";

// 1. Check if the business has AI conversations remaining this period
export async function checkAiConversationAvailability(businessId: string): Promise<boolean> {
  const sub = await db.query.subscription.findFirst({
    where: eq(subscription.businessId, businessId),
  });

  if (!sub) return false;

  const plan = PLAN_CATALOG[sub.plan as PlanKey];
  const limit = plan?.limits?.aiConversationsPerMonth;

  if (limit === null || limit === undefined) return true; // Unlimited

  return (sub.aiConversationsUsed ?? 0) < limit;
}

// 2. Increment the conversation counter by one — called once per AI-generated reply,
// regardless of how many LLM tokens that reply cost. Beyond the plan's included volume,
// the business isn't cut off; it just accrues overage for the next invoice (see
// OVERAGE_RATES in packages/api/src/lib/plans.ts) — this function keeps counting either way.
export async function incrementAiConversation(businessId: string): Promise<void> {
  const [updated] = await db
    .update(subscription)
    .set({
      aiConversationsUsed: sql`${subscription.aiConversationsUsed} + 1`,
    })
    .where(eq(subscription.businessId, businessId))
    .returning({
      plan: subscription.plan,
      used: subscription.aiConversationsUsed,
      usageAlert80SentAt: subscription.usageAlert80SentAt,
      usageAlert100SentAt: subscription.usageAlert100SentAt,
    });
  if (!updated) return;

  await checkUsageAlerts(
    businessId,
    updated.plan as PlanKey,
    updated.used ?? 0,
    updated.usageAlert80SentAt,
    updated.usageAlert100SentAt,
  ).catch((err) => console.error(`[ai-conversations] usage alert check failed for ${businessId}:`, err));
}
