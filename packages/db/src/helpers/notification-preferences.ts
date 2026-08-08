/**
 * Notification preference helpers (FR-SET-04) — look up a business's email/in-app
 * preferences for a given event type and resolve where notification emails should go.
 *
 * Pure DB queries with no email-sending side effects. The caller combines these with
 * @acme/auth's sendEmail, keeping email transport out of the DB layer.
 */
import { and, eq } from "drizzle-orm";
import { business, businessMember, user } from "../auth-schema";
import { businessProfile, notificationPreference } from "../agent-schema";
import { db } from "../client";

export type NotificationEventType =
  | "new_order"
  | "low_stock"
  | "human_handoff"
  | "quota_alert"
  | "weekly_insights"
  | "ticket_created";

export async function getNotificationPreference(
  businessId: string,
  eventType: NotificationEventType,
): Promise<{ emailEnabled: boolean; inAppEnabled: boolean }> {
  const [row] = await db
    .select({
      emailEnabled: notificationPreference.emailEnabled,
      inAppEnabled: notificationPreference.inAppEnabled,
    })
    .from(notificationPreference)
    .where(
      and(
        eq(notificationPreference.businessId, businessId),
        eq(notificationPreference.eventType, eventType),
      ),
    )
    .limit(1);

  return {
    emailEnabled: row?.emailEnabled ?? true,
    inAppEnabled: row?.inAppEnabled ?? true,
  };
}

/**
 * Recipient email resolution — same priority chain weekly-insights.ts uses:
 *   1. Custom notificationEmail from Settings > Business
 *   2. Store owner's account email
 *   3. Store supportEmail
 */
export async function resolveNotificationRecipient(businessId: string): Promise<string | null> {
  const [profile] = await db
    .select({
      notificationEmail: businessProfile.notificationEmail,
      supportEmail: businessProfile.supportEmail,
    })
    .from(businessProfile)
    .where(eq(businessProfile.businessId, businessId))
    .limit(1);

  if (profile?.notificationEmail?.trim()) return profile.notificationEmail.trim();

  const [owner] = await db
    .select({ userId: businessMember.userId })
    .from(businessMember)
    .where(and(eq(businessMember.businessId, businessId), eq(businessMember.role, "owner")))
    .limit(1);

  if (owner) {
    const [ownerUser] = await db
      .select({ email: user.email })
      .from(user)
      .where(eq(user.id, owner.userId))
      .limit(1);
    if (ownerUser?.email?.trim()) return ownerUser.email.trim();
  }

  if (profile?.supportEmail?.trim()) return profile.supportEmail.trim();
  return null;
}
