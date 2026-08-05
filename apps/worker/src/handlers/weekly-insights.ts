import { and, eq, gte, inArray, lte, sql } from "@acme/db";
import { db } from "@acme/db/client";
import { business, businessMember, businessProfile, notificationPreference, order, orderItem, subscription, user } from "@acme/db/schema";
import { sendEmail } from "@acme/auth/email";

function appUrl(): string {
  return process.env.APP_URL ?? "http://localhost:3000";
}

interface AIInsightResult {
  summary: string;
  recommendations: string[];
}

/**
 * Calls OpenAI API to generate Executive AI Insights & Strategic Recommendations
 * based on weekly merchant sales performance.
 */
async function generateAiExecutiveInsights(
  storeName: string,
  metrics: {
    currentRev: number;
    priorRev: number;
    revGrowth: number;
    currentCount: number;
    priorCount: number;
    aov: number;
    topProducts: string[];
  },
): Promise<AIInsightResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    // Fallback if no OpenAI API key configured
    return {
      summary: `Your store generated ৳${metrics.currentRev.toLocaleString()} across ${metrics.currentCount} completed orders (${metrics.revGrowth >= 0 ? '+' : ''}${metrics.revGrowth}% vs prior week).`,
      recommendations: [
        `Focus on driving traffic to your top products: ${metrics.topProducts.join(", ") || "catalog bestsellers"}.`,
        `Consider creating a limited-time bundle offer to boost your current Average Order Value (৳${metrics.aov.toLocaleString()}).`,
        `Engage returning customers over social chat with personalized recommendations.`,
      ],
    };
  }

  const baseUrl = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

  const systemPrompt = `You are SellPilot's Executive AI Copilot. You analyze e-commerce store metrics and generate concise, professional, motivating executive insights and 3 actionable growth recommendations for store owners. Return valid JSON only with keys "summary" (string) and "recommendations" (array of 3 short strings).`;

  const userPrompt = `Store: ${storeName}
Weekly Performance Metrics (Past 7 Days):
- Current Revenue: ৳${metrics.currentRev.toLocaleString()} (${metrics.revGrowth >= 0 ? '+' : ''}${metrics.revGrowth}% vs prior week)
- Prior Week Revenue: ৳${metrics.priorRev.toLocaleString()}
- Completed Orders: ${metrics.currentCount} (${metrics.priorCount} prior week)
- Average Order Value (AOV): ৳${metrics.aov.toLocaleString()}
- Top Products Sold: ${metrics.topProducts.length ? metrics.topProducts.join(", ") : "N/A"}

Please synthesize executive insights and 3 strategic recommendations in English/Bangla business tone.`;

  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
      }),
    });

    if (!res.ok) {
      throw new Error(`OpenAI API error: ${res.statusText}`);
    }

    const data = (await res.json()) as any;
    const contentStr = data.choices?.[0]?.message?.content;
    if (!contentStr) throw new Error("Empty LLM response");

    const parsed = JSON.parse(contentStr) as AIInsightResult;
    return {
      summary: parsed.summary ?? `Revenue was ৳${metrics.currentRev.toLocaleString()} (${metrics.revGrowth}% growth).`,
      recommendations: Array.isArray(parsed.recommendations) && parsed.recommendations.length ? parsed.recommendations : [
        "Optimize product inventory for top-selling SKUs.",
        "Promote active campaign discount codes in chat inquiries.",
        "Follow up with unconverted cart leads.",
      ],
    };
  } catch (err) {
    console.error(`[weekly-insights] OpenAI generation error:`, err);
    return {
      summary: `Your store generated ৳${metrics.currentRev.toLocaleString()} across ${metrics.currentCount} completed orders (${metrics.revGrowth >= 0 ? '+' : ''}${metrics.revGrowth}% vs prior week).`,
      recommendations: [
        `Focus on promoting your top-performing products: ${metrics.topProducts.join(", ") || "catalog bestsellers"}.`,
        `Consider creating a promotional offer to increase Average Order Value (৳${metrics.aov.toLocaleString()}).`,
        `Follow up with abandoned cart leads using SellPilot AI chat automation.`,
      ],
    };
  }
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

    const [profile] = await db
      .select({ notificationEmail: businessProfile.notificationEmail, supportEmail: businessProfile.supportEmail })
      .from(businessProfile)
      .where(eq(businessProfile.businessId, sub.businessId))
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

    // Query Notification Preferences for "weekly_insights" (FR-SET-04)
    const [notifPref] = await db
      .select({ emailEnabled: notificationPreference.emailEnabled, inAppEnabled: notificationPreference.inAppEnabled })
      .from(notificationPreference)
      .where(and(eq(notificationPreference.businessId, sub.businessId), eq(notificationPreference.eventType, "weekly_insights")))
      .limit(1);

    const emailEnabled = notifPref?.emailEnabled ?? true;

    // Recipient email resolution:
    // 1. Custom notification recipient email configured by owner in Settings
    // 2. Default: Store Owner's registered account email
    // 3. Fallback: Store support email
    const recipientEmail =
      profile?.notificationEmail?.trim() ||
      ownerUser?.email?.trim() ||
      profile?.supportEmail?.trim();
    if (!recipientEmail) continue;

    // Query current 7 days performance
    const currentOrders = await db
      .select({ id: order.id, totalAmount: order.total })
      .from(order)
      .where(and(eq(order.businessId, sub.businessId), gte(order.createdAt, sevenDaysAgo)));

    // Query prior 7 days performance
    const priorOrders = await db
      .select({ id: order.id, totalAmount: order.total })
      .from(order)
      .where(
        and(
          eq(order.businessId, sub.businessId),
          gte(order.createdAt, fourteenDaysAgo),
          lte(order.createdAt, sevenDaysAgo),
        ),
      );

    const currentRev = currentOrders.reduce((sum, o) => sum + Number(o.totalAmount ?? 0), 0);
    const priorRev = priorOrders.reduce((sum, o) => sum + Number(o.totalAmount ?? 0), 0);
    const currentCount = currentOrders.length;
    const priorCount = priorOrders.length;

    const revGrowth = priorRev > 0 ? Math.round(((currentRev - priorRev) / priorRev) * 100) : 0;
    const aov = currentCount > 0 ? Math.round(currentRev / currentCount) : 0;

    // Fetch Top 3 Products for current window
    const currentOrderIds = currentOrders.map((o) => o.id);
    let topProducts: string[] = [];
    if (currentOrderIds.length > 0) {
      const items = await db
        .select({ name: orderItem.name, qty: orderItem.qty, lineTotal: orderItem.lineTotal })
        .from(orderItem)
        .where(inArray(orderItem.orderId, currentOrderIds));

      const agg = new Map<string, number>();
      for (const item of items) {
        agg.set(item.name, (agg.get(item.name) ?? 0) + item.lineTotal);
      }
      topProducts = [...agg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([name]) => name);
    }

    // Call Executive Copilot LLM to generate AI insights
    const aiInsight = await generateAiExecutiveInsights(biz.name, {
      currentRev,
      priorRev,
      revGrowth,
      currentCount,
      priorCount,
      aov,
      topProducts,
    });

    const analyticsUrl = `${appUrl()}/${biz.slug}/dashboard/analytics`;

    // Render Premium Branded AI HTML Email
    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 28px; border: 1px solid #e2e8f0; border-radius: 16px; background-color: #ffffff;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px;">
          <h2 style="color: #4f46e5; margin: 0; font-size: 20px; font-weight: 700;">🤖 SellPilot Executive AI Copilot</h2>
          <span style="font-size: 11px; font-weight: 700; color: #4f46e5; background: #e0e7ff; padding: 4px 10px; border-radius: 20px; text-transform: uppercase;">Pro Insight</span>
        </div>

        <p style="color: #334155; font-size: 14px; line-height: 1.6; margin-bottom: 20px;">
          Hello <strong>${ownerUser?.name ?? "Store Owner"}</strong>, here is your AI-synthesized weekly executive performance digest for <strong>${biz.name}</strong>:
        </p>

        <!-- Metrics Grid -->
        <div style="background-color: #f8fafc; border-radius: 12px; padding: 18px; margin-bottom: 20px; border: 1px solid #edf2f7;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
            <div>
              <span style="font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px;">7-Day Revenue</span>
              <div style="font-size: 22px; font-weight: 800; color: #0f172a;">৳${currentRev.toLocaleString()}</div>
            </div>
            <div style="text-align: right;">
              <span style="font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px;">Growth Rate</span>
              <div style="font-size: 18px; font-weight: 700; color: ${revGrowth >= 0 ? '#16a34a' : '#dc2626'}; margin-top: 2px;">
                ${revGrowth >= 0 ? '▲ +' : '▼ '}${revGrowth}%
              </div>
            </div>
          </div>
          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 12px 0;" />
          <div style="display: flex; justify-content: space-between; font-size: 13px; color: #334155;">
            <div><strong>Orders Completed:</strong> ${currentCount} (${priorCount} prior week)</div>
            <div><strong>AOV:</strong> ৳${aov.toLocaleString()}</div>
          </div>
        </div>

        <!-- AI Executive Commentary -->
        <div style="background-color: #faf5ff; border-left: 4px solid #a855f7; padding: 16px; border-radius: 8px; margin-bottom: 20px;">
          <h4 style="margin: 0 0 6px 0; color: #7e22ce; font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px;">AI Performance Summary</h4>
          <p style="margin: 0; color: #581c87; font-size: 13px; line-height: 1.6;">
            "${aiInsight.summary}"
          </p>
        </div>

        <!-- AI Strategic Recommendations -->
        <div style="margin-bottom: 24px;">
          <h4 style="color: #0f172a; font-size: 14px; font-weight: 700; margin-bottom: 10px;">🎯 Copilot Recommendations for Next Week:</h4>
          <ul style="margin: 0; padding-left: 20px; color: #334155; font-size: 13px; line-height: 1.7;">
            ${aiInsight.recommendations.map((rec) => `<li style="margin-bottom: 6px;">${rec}</li>`).join("")}
          </ul>
        </div>

        <!-- CTA Button -->
        <div style="text-align: center; margin-top: 28px; padding-top: 20px; border-top: 1px solid #f1f5f9;">
          <a href="${analyticsUrl}" style="background-color: #4f46e5; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 10px; font-size: 14px; font-weight: 600; display: inline-block; box-shadow: 0 2px 4px rgba(79, 70, 229, 0.2);">
            Open Executive AI Copilot
          </a>
        </div>
      </div>
    `;

    if (emailEnabled) {
      await sendEmail({
        to: recipientEmail,
        subject: `🤖 AI Executive Insight Report — ${biz.name}`,
        html: htmlBody,
        text: `Weekly AI Executive Report for ${biz.name}: Revenue ৳${currentRev}, Orders: ${currentCount}, Growth: ${revGrowth}%. Summary: ${aiInsight.summary}. View details: ${analyticsUrl}`,
      }).catch((err) => console.error(`[weekly-insights] Failed to send email to ${recipientEmail}:`, err));
    }

    processed++;
  }

  return { processed };
}
