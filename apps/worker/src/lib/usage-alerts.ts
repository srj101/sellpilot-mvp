/**
 * Usage-alert thresholds (pricing doc "Overage & Fair-Use Policy": "Automatic in-app +
 * email alert at both thresholds" — 80% and 100% of a plan's included AI conversation
 * volume). Fires once per threshold per billing period, guarded by
 * subscription.usageAlert80SentAt/usageAlert100SentAt (reset alongside aiConversationsUsed
 * in subscription.ts's markInvoicePaid).
 */
import { and, eq } from "@acme/db";
import { db } from "@acme/db/client";
import { business, businessMember, subscription, user } from "@acme/db/schema";
import { PLAN_CATALOG, USAGE_ALERT_THRESHOLDS, type PlanKey } from "@acme/api/plans";
import { createNotification } from "@acme/db/helpers/aiHelpers";
import { getNotificationPreference } from "@acme/db/helpers/notification-preferences";
import { sendEmail } from "@acme/auth/email";

import { env } from "../env.js";

function appUrl(): string {
  return env.APP_URL;
}

async function notifyUsageThreshold(businessId: string, pct: 80 | 100, planName: string): Promise<void> {
  const [biz] = await db.select({ name: business.name, slug: business.slug }).from(business).where(eq(business.id, businessId)).limit(1);
  const [owner] = await db
    .select({ userId: businessMember.userId })
    .from(businessMember)
    .where(and(eq(businessMember.businessId, businessId), eq(businessMember.role, "owner")))
    .limit(1);
  if (!biz || !owner) return;
  const [ownerUser] = await db.select({ email: user.email }).from(user).where(eq(user.id, owner.userId)).limit(1);
  if (!ownerUser) return;

  // FR-SET-04: gate email on emailEnabled preference for quota_alert
  const { emailEnabled, inAppEnabled } = await getNotificationPreference(businessId, "quota_alert");

  if (emailEnabled) {
    const billingUrl = `${appUrl()}/${biz.slug}/dashboard/billing`;
    const subject =
      pct === 100 ? `${biz.name} has used its full AI conversation allowance` : `${biz.name} is at 80% of its AI conversation allowance`;
    const body =
      pct === 100
        ? `Your ${planName} plan's monthly AI conversation limit has been reached. Service continues uninterrupted — extra usage is billed simply at your plan's overage rate on the next invoice. Review usage or upgrade any time: ${billingUrl}`
        : `Your ${planName} plan has used 80% of its monthly AI conversations. No action needed — service never stops mid-conversation — but you may want to review usage or upgrade before the next invoice: ${billingUrl}`;

    await sendEmail({ to: ownerUser.email, subject, html: `<p>${body}</p>`, text: body }).catch((err) =>
      console.error(`[usage-alerts] Failed to send email for ${businessId}:`, err),
    );
  }

  // FR-SET-04: gate in-app notification on inAppEnabled preference
  if (inAppEnabled) {
    await createNotification({
      businessId,
      type: pct === 100 ? "usage_limit_reached" : "usage_80_percent",
      title: pct === 100 ? "AI conversation limit reached" : "80% of AI conversations used",
      body:
        pct === 100
          ? "Extra usage is billed at your plan's overage rate on the next invoice."
          : "Review usage or upgrade before your next invoice.",
      link: "/dashboard/billing",
    }).catch((err) => console.error(`[usage-alerts] Failed to create notification for ${businessId}:`, err));
  }
}

/** Called after every conversation increment — cheap in the common case: no DB writes or
 * lookups unless usage is actually at/above 80% AND that threshold hasn't fired yet this
 * period. 100% crossing implies 80% is also covered, so both never fire for the same
 * increment. */
export async function checkUsageAlerts(
  businessId: string,
  plan: PlanKey,
  used: number,
  alert80SentAt: Date | null,
  alert100SentAt: Date | null,
): Promise<void> {
  const limit = PLAN_CATALOG[plan].limits.aiConversationsPerMonth;
  if (limit === null) return; // no fixed ceiling on this plan to alert against

  const pct = used / limit;

  if (pct >= USAGE_ALERT_THRESHOLDS[1] && !alert100SentAt) {
    await db.update(subscription).set({ usageAlert100SentAt: new Date() }).where(eq(subscription.businessId, businessId));
    await notifyUsageThreshold(businessId, 100, PLAN_CATALOG[plan].name);
    return;
  }

  if (pct >= USAGE_ALERT_THRESHOLDS[0] && !alert80SentAt) {
    await db.update(subscription).set({ usageAlert80SentAt: new Date() }).where(eq(subscription.businessId, businessId));
    await notifyUsageThreshold(businessId, 80, PLAN_CATALOG[plan].name);
  }
}
