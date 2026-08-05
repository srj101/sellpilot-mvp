import { and, eq, gte, lte, sql } from "@acme/db";
import { db } from "@acme/db/client";
import { business, businessMember, order, subscription, user } from "@acme/db/schema";
import { sendEmail } from "@acme/auth/email";

function appUrl(): string {
  return process.env.APP_URL ?? "http://localhost:3000";
}

export async function processWeeklyInsightsJob(): Promise<{ processed: number }> {
  // 1. Fetch all active Pro subscriptions
  const proSubs = await db
    .select({
      businessId: subscription.businessId,
      subStatus: subscription.status,
      plan: subscription.plan,
    })
    .from(subscription)
    .where(and(eq(subscription.plan, "pro"), eq(subscription.status, "active")));

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

  let processed = 0;

  for (const sub of proSubs) {
    if (!sub.businessId) continue;

    const [biz] = await db
      .select({ name: business.name, slug: business.slug })
      .from(business)
      .where(eq(business.id, sub.businessId))
      .limit(1);

    const [ownerMember] = await db
      .select({ userId: businessMember.userId })
      .from(businessMember)
      .where(and(eq(businessMember.businessId, sub.businessId), eq(businessMember.role, "owner")))
      .limit(1);

    if (!biz || !ownerMember) continue;

    const [ownerUser] = await db
      .select({ email: user.email, name: user.name })
      .from(user)
      .where(eq(user.id, ownerMember.userId))
      .limit(1);

    if (!ownerUser?.email) continue;

    // Query current 7 days performance
    const [currentOrdersRow] = await db
      .select({ count: sql<number>`count(*)`, total: sql<number>`coalesce(sum(total_amount), 0)` })
      .from(order)
      .where(and(eq(order.businessId, sub.businessId), gte(order.createdAt, sevenDaysAgo)));

    // Query prior 7 days performance
    const [priorOrdersRow] = await db
      .select({ count: sql<number>`count(*)`, total: sql<number>`coalesce(sum(total_amount), 0)` })
      .from(order)
      .where(
        and(
          eq(order.businessId, sub.businessId),
          gte(order.createdAt, fourteenDaysAgo),
          lte(order.createdAt, sevenDaysAgo),
        ),
      );

    const currentRev = Number(currentOrdersRow?.total ?? 0);
    const priorRev = Number(priorOrdersRow?.total ?? 0);
    const currentCount = Number(currentOrdersRow?.count ?? 0);
    const priorCount = Number(priorOrdersRow?.count ?? 0);

    const revGrowth = priorRev > 0 ? Math.round(((currentRev - priorRev) / priorRev) * 100) : 0;
    const aov = currentCount > 0 ? Math.round(currentRev / currentCount) : 0;

    const analyticsUrl = `${appUrl()}/${biz.slug}/dashboard/analytics`;

    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff;">
        <h2 style="color: #4f46e5; margin-top: 0;">Executive Weekly Insights — ${biz.name}</h2>
        <p style="color: #475569; font-size: 14px; line-height: 1.6;">
          Hello <strong>${ownerUser.name ?? "Store Owner"}</strong>, here is your AI-generated executive sales digest for the past 7 days:
        </p>

        <div style="background-color: #f8fafc; border-radius: 12px; padding: 16px; margin: 20px 0; border: 1px solid #edf2f7;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
            <div>
              <span style="font-size: 12px; color: #64748b; text-transform: uppercase; font-weight: 600;">Weekly Revenue</span>
              <div style="font-size: 20px; font-weight: 700; color: #0f172a;">৳${currentRev.toLocaleString()}</div>
            </div>
            <div style="text-align: right;">
              <span style="font-size: 12px; color: #64748b; text-transform: uppercase; font-weight: 600;">Growth vs Prior Week</span>
              <div style="font-size: 16px; font-weight: 700; color: ${revGrowth >= 0 ? '#16a34a' : '#dc2626'};">
                ${revGrowth >= 0 ? '+' : ''}${revGrowth}%
              </div>
            </div>
          </div>
          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 12px 0;" />
          <div style="font-size: 13px; color: #334155; line-height: 1.6;">
            • <strong>Total Orders:</strong> ${currentCount} completed orders (${priorCount} prior week)<br />
            • <strong>Average Order Value (AOV):</strong> ৳${aov.toLocaleString()}<br />
          </div>
        </div>

        <p style="color: #64748b; font-size: 13px; line-height: 1.5;">
          Pro Tip: Ask your <strong>Executive AI Copilot</strong> natural-language questions anytime on your Analytics Dashboard.
        </p>

        <div style="margin-top: 24px; text-align: center;">
          <a href="${analyticsUrl}" style="background-color: #4f46e5; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 600; display: inline-block;">View Full Analytics</a>
        </div>
      </div>
    `;

    await sendEmail({
      to: ownerUser.email,
      subject: `Weekly Executive Insights for ${biz.name}`,
      html: htmlBody,
      text: `Weekly Insights for ${biz.name}: Revenue ৳${currentRev}, Orders: ${currentCount}, Growth: ${revGrowth}%. View details: ${analyticsUrl}`,
    }).catch((err) => console.error(`[weekly-insights] Failed to send email to ${ownerUser.email}:`, err));

    processed++;
  }

  return { processed };
}
