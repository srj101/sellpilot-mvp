/**
 * Daily subscription renewal sweep (billing plan §4.4). SSLCommerz has no verified
 * silent "charge this stored card" API in this integration — addPaymentMethod and
 * subscribe/changePlan/retryInvoice all hand off to a hosted checkout page. So this job
 * is honest about what it can actually do: it can't charge anyone automatically. What it
 * does instead is open the renewal invoice, put the subscription into a grace period, and
 * chase the owner by email until they pay via the Billing page's "Pay Now" button — a
 * 3-strike reminder ladder over ~9 days, then cancels. See D6 for why this runs as a
 * self-rescheduling queue job rather than a real cron.
 */
import { and, eq } from "@acme/db";
import { db } from "@acme/db/client";
import { business, businessMember, saasInvoice, subscription, user } from "@acme/db/schema";
import type { BillingCycle, PlanKey } from "@acme/api/plans";
import { CYCLE_META, PLAN_CATALOG, priceForCycle } from "@acme/api/plans";
import { CARD_AND_BANK_GATEWAYS, initiatePayment } from "@acme/api/sslcommerz";
import { sendEmail } from "@acme/auth/email";

const DAY_MS = 86_400_000;
const REMINDER_INTERVAL_DAYS = 3;
const MAX_REMINDERS = 3;

function appUrl() {
  return process.env.APP_URL ?? "http://localhost:3000";
}

function invoiceNumber(periodStart: Date): string {
  return `SP-${periodStart.getFullYear()}-${Date.now().toString().slice(-6)}`;
}

/**
 * A direct SSLCommerz checkout link for the given invoice — skips the "log in, find the
 * invoice, click Pay Now" detour the dashboard-only link used to require. Regenerated on
 * every email (not cached) since a gateway session isn't guaranteed to still be valid by
 * the time a reminder goes out days later. Falls back to undefined (caller uses the
 * dashboard link instead) if the gateway call itself fails — a bad pay link is worse than
 * no pay link, and this must never block the reminder email from going out.
 */
async function generatePayLink(invoice: { id: string; amount: number; plan: string }, ownerName: string): Promise<string | undefined> {
  try {
    const base = `${appUrl()}/api/billing`;
    const result = await initiatePayment({
      transactionId: invoice.id,
      amount: invoice.amount,
      customerName: ownerName,
      customerPhone: "N/A",
      productName: `SellPilot ${PLAN_CATALOG[invoice.plan as PlanKey]?.name ?? invoice.plan} — renewal`,
      successUrl: `${base}/success`,
      failUrl: `${base}/fail`,
      cancelUrl: `${base}/cancel`,
      ipnUrl: `${base}/ipn`,
      restrictedGateways: CARD_AND_BANK_GATEWAYS,
    });
    return result.ok ? result.gatewayUrl : undefined;
  } catch (err) {
    console.error(`[subscription-renewal] failed to generate a pay link for invoice ${invoice.id}:`, err);
    return undefined;
  }
}

/** Only the name, for generatePayLink's `customerName` field — notifyOwner does its own
 * independent owner lookup below rather than sharing this, matching the existing pattern
 * of each helper being self-contained. */
async function getOwnerName(businessId: string): Promise<string> {
  const [owner] = await db
    .select({ userId: businessMember.userId })
    .from(businessMember)
    .where(and(eq(businessMember.businessId, businessId), eq(businessMember.role, "owner")))
    .limit(1);
  if (!owner) return "Business owner";
  const [ownerUser] = await db.select({ name: user.name }).from(user).where(eq(user.id, owner.userId)).limit(1);
  return ownerUser?.name ?? "Business owner";
}

async function notifyOwner(businessId: string, kind: "renewal_due" | "reminder" | "cancelled", amount: number | null, payUrl?: string) {
  const [biz] = await db.select({ name: business.name, slug: business.slug }).from(business).where(eq(business.id, businessId)).limit(1);
  const [owner] = await db
    .select({ userId: businessMember.userId })
    .from(businessMember)
    .where(and(eq(businessMember.businessId, businessId), eq(businessMember.role, "owner")))
    .limit(1);
  if (!owner || !biz) return;

  const [ownerUser] = await db.select({ name: user.name, email: user.email }).from(user).where(eq(user.id, owner.userId)).limit(1);
  if (!ownerUser) return;

  const billingUrl = `${appUrl()}/${biz.slug}/dashboard/billing`;
  const payLink = payUrl ?? billingUrl;
  const amountStr = amount ? ` of ৳${amount.toLocaleString("en-US")}` : "";

  const copy: Record<typeof kind, { subject: string; body: string }> = {
    renewal_due: {
      subject: `Action needed: confirm your SellPilot payment${amountStr}`,
      body: `Your ${biz.name} subscription has renewed and needs payment confirmation${amountStr}. Pay now to keep your AI agent selling without interruption: ${payLink}`,
    },
    reminder: {
      subject: "Reminder: your SellPilot subscription payment is still due",
      body: `We still haven't received payment for your ${biz.name} subscription${amountStr}. Pay now to avoid interruption: ${payLink}${payUrl ? ` (or review it first in your dashboard: ${billingUrl})` : ""} — your account will be locked after a few more missed reminders.`,
    },
    cancelled: {
      subject: "Your SellPilot subscription has been cancelled",
      body: `Your ${biz.name} subscription was cancelled after repeated missed payments. All your data is safe and preserved — reactivate any time: ${billingUrl}`,
    },
  };

  const { subject, body } = copy[kind];
  await sendEmail({ to: ownerUser.email, subject, html: `<p>${body}</p>`, text: body });
}

async function processOne(sub: typeof subscription.$inferSelect) {
  const businessId = sub.businessId;
  if (!businessId || !sub.currentPeriodEnd) return;

  if (sub.cancelAtPeriodEnd) {
    await db.update(subscription).set({ status: "cancelled", cancelledAt: sub.cancelledAt ?? new Date() }).where(eq(subscription.businessId, businessId));
    return;
  }

  // Has this cycle's renewal invoice already been opened?
  const [existingInvoice] = await db
    .select()
    .from(saasInvoice)
    .where(and(eq(saasInvoice.businessId, businessId), eq(saasInvoice.periodStart, sub.currentPeriodEnd)))
    .limit(1);

  if (!existingInvoice) {
    const effectivePlan = (sub.pendingPlan ?? sub.plan) as PlanKey;
    const cycle = sub.billingCycle as BillingCycle;
    const amount = priceForCycle(effectivePlan, cycle) ?? sub.amount;
    const periodStart = sub.currentPeriodEnd;
    const periodEnd = new Date(periodStart);
    periodEnd.setMonth(periodEnd.getMonth() + (CYCLE_META[cycle].months || 12));

    const [newInvoice] = await db
      .insert(saasInvoice)
      .values({
        businessId,
        invoiceNumber: invoiceNumber(periodStart),
        plan: effectivePlan,
        billingCycle: cycle,
        amount,
        status: "pending",
        periodStart,
        periodEnd,
      })
      .returning();

    await db
      .update(subscription)
      .set({ status: "past_due", failedPaymentCount: 1, plan: effectivePlan, pendingPlan: null })
      .where(eq(subscription.businessId, businessId));

    const payUrl = newInvoice
      ? await generatePayLink({ id: newInvoice.id, amount, plan: effectivePlan }, await getOwnerName(businessId))
      : undefined;
    await notifyOwner(businessId, "renewal_due", amount, payUrl);
    return;
  }

  if (existingInvoice.status === "paid") return; // markInvoicePaid already reactivated it

  const daysSinceLastAction = (Date.now() - sub.updatedAt.getTime()) / DAY_MS;
  if (daysSinceLastAction < REMINDER_INTERVAL_DAYS) return; // not due for the next nudge yet

  const nextCount = sub.failedPaymentCount + 1;
  if (nextCount > MAX_REMINDERS) {
    await db.update(subscription).set({ status: "cancelled", cancelledAt: new Date() }).where(eq(subscription.businessId, businessId));
    await notifyOwner(businessId, "cancelled", null);
  } else {
    await db.update(subscription).set({ failedPaymentCount: nextCount }).where(eq(subscription.businessId, businessId));
    const payUrl = await generatePayLink(
      { id: existingInvoice.id, amount: existingInvoice.amount, plan: existingInvoice.plan },
      await getOwnerName(businessId),
    );
    await notifyOwner(businessId, "reminder", existingInvoice.amount, payUrl);
  }
}

export async function runSubscriptionRenewal(): Promise<void> {
  const now = Date.now();
  const rows = await db.select().from(subscription);
  const due = rows.filter(
    (s) =>
      s.billingCycle !== "lifetime" &&
      (s.status === "active" || s.status === "past_due") &&
      s.currentPeriodEnd !== null &&
      s.currentPeriodEnd.getTime() <= now,
  );

  console.log(`[subscription-renewal] ${due.length} subscription(s) due out of ${rows.length} total`);

  for (const sub of due) {
    try {
      await processOne(sub);
    } catch (err) {
      console.error(`[subscription-renewal] failed for business ${sub.businessId ?? "unknown"}:`, err);
    }
  }
}

export async function runTrialExpirySweep(): Promise<void> {
  const now = Date.now();
  const rows = await db.select().from(subscription).where(eq(subscription.status, "trialing"));
  const expired = rows.filter((s) => s.currentPeriodEnd && s.currentPeriodEnd.getTime() <= now);

  console.log(`[trial-expiry-sweep] ${expired.length} trial(s) expired out of ${rows.length} trialing`);

  for (const sub of expired) {
    if (!sub.businessId || !sub.currentPeriodEnd) continue;
    // Only notify within the first day after expiry — the job runs daily, so this sends
    // roughly once per trial rather than spamming every day it stays unpaid.
    const hoursSinceExpiry = (now - sub.currentPeriodEnd.getTime()) / 3_600_000;
    if (hoursSinceExpiry > 24) continue;

    try {
      const [biz] = await db.select({ name: business.name, slug: business.slug }).from(business).where(eq(business.id, sub.businessId)).limit(1);
      const [owner] = await db
        .select({ userId: businessMember.userId })
        .from(businessMember)
        .where(and(eq(businessMember.businessId, sub.businessId), eq(businessMember.role, "owner")))
        .limit(1);
      if (!biz || !owner) continue;
      const [ownerUser] = await db.select({ email: user.email }).from(user).where(eq(user.id, owner.userId)).limit(1);
      if (!ownerUser) continue;

      const billingUrl = `${appUrl()}/${biz.slug}/dashboard/billing`;
      const planName = PLAN_CATALOG[sub.plan as PlanKey]?.name ?? sub.plan;
      const body = `Your ${planName} trial for ${biz.name} has ended. Pick a plan to keep your AI agent selling — all your data is safe and waiting: ${billingUrl}`;
      await sendEmail({ to: ownerUser.email, subject: "Your SellPilot trial has ended", html: `<p>${body}</p>`, text: body });
    } catch (err) {
      console.error(`[trial-expiry-sweep] failed for business ${sub.businessId}:`, err);
    }
  }
}
