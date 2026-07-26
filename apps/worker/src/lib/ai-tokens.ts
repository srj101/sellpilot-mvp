import { eq, sql } from "@acme/db";
import { db } from "@acme/db/client";
import { subscription } from "@acme/db/schema";
import { PLAN_CATALOG, type PlanKey } from "@acme/api/plans";

// 1. Check if the business has tokens remaining
export async function checkAiTokenAvailability(businessId: string): Promise<boolean> {
  const sub = await db.query.subscription.findFirst({
    where: eq(subscription.businessId, businessId),
  });
  
  if (!sub) return false;
  
  const plan = PLAN_CATALOG[sub.plan as PlanKey];
  const limit = plan?.limits?.aiTokensPerMonth;
  
  if (limit === null || limit === undefined) return true; // Unlimited
  
  return (sub.aiConversationsUsed ?? 0) < limit;
}

// 2. Increment the token counter by the total tokens used in the response
export async function incrementAiToken(businessId: string, tokensUsed: number): Promise<void> {
  if (tokensUsed <= 0) return;
  
  await db
    .update(subscription)
    .set({
      aiConversationsUsed: sql`${subscription.aiConversationsUsed} + ${tokensUsed}`,
    })
    .where(eq(subscription.businessId, businessId));
}
