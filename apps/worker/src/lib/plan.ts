import { eq, inArray } from "@acme/db";
import { db } from "@acme/db/client";
import { subscription } from "@acme/db/schema";
import { PLAN_CATALOG, type PlanKey } from "@acme/api/plans";

function isPlanKey(plan: string | undefined): plan is PlanKey {
  return plan !== undefined && plan in PLAN_CATALOG;
}

/** Same "no subscription row → most restrictive tier" fallback as
 * plan-limits.ts's resolvePlanKey — defensive only, shouldn't happen post-onboarding. */
export async function getBusinessPlanKey(businessId: string): Promise<PlanKey> {
  const sub = await db.query.subscription.findFirst({
    where: eq(subscription.businessId, businessId),
  });
  return isPlanKey(sub?.plan) ? sub.plan : "starter";
}

/** Batched lookup for sweeps (e.g. conversation-followup) that need the plan for many
 * businesses at once instead of one query per candidate. */
export async function getBusinessPlanKeys(businessIds: string[]): Promise<Map<string, PlanKey>> {
  const result = new Map<string, PlanKey>();
  if (businessIds.length === 0) return result;

  const rows = await db
    .select({ businessId: subscription.businessId, plan: subscription.plan })
    .from(subscription)
    .where(inArray(subscription.businessId, businessIds));

  for (const row of rows) {
    if (row.businessId) result.set(row.businessId, isPlanKey(row.plan) ? row.plan : "starter");
  }
  // Businesses with no subscription row at all still fall back to starter.
  for (const id of businessIds) {
    if (!result.has(id)) result.set(id, "starter");
  }
  return result;
}
