import { relations } from "drizzle-orm";
import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

import { user } from "./auth-schema";

/**
 * Stores connections to Meta platform channels:
 * - facebook_page: A Facebook Page the user manages
 * - instagram: An Instagram Business/Creator account linked to a Page
 * - whatsapp: A WhatsApp Business Account phone number
 */
export const metaConnection = pgTable(
  "meta_connection",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),

    /** The channel type: "facebook_page" | "instagram" | "whatsapp" */
    platform: text("platform").notNull(),

    /** Platform-specific account ID (Page ID, IG Business Account ID, or WABA ID) */
    platformAccountId: text("platform_account_id").notNull(),

    /** Facebook Page ID used for Messenger and Instagram subscriptions */
    facebookPageId: text("facebook_page_id"),

    /** Human-readable Facebook Page name */
    facebookPageName: text("facebook_page_name"),

    /** Page access token used for Messenger and Instagram Graph API calls */
    facebookPageAccessToken: text("facebook_page_access_token"),

    /** Instagram Business Account ID linked to the Facebook Page */
    instagramBusinessAccountId: text("instagram_business_account_id"),

    /** Instagram @handle used for display and routing context */
    instagramUsername: text("instagram_username"),

    /** WhatsApp Business Account ID used for account-level management */
    whatsappBusinessAccountId: text("whatsapp_business_account_id"),

    /** WhatsApp phone_number_id used for webhook routing */
    whatsappPhoneNumberId: text("whatsapp_phone_number_id"),

    /** WhatsApp System User / Cloud API access token */
    whatsappAccessToken: text("whatsapp_access_token"),

    /** Display name (Page name, IG username, phone display name) */
    platformAccountName: text("platform_account_name"),

    /** Access token for this specific channel (Page token, WA token) */
    accessToken: text("access_token"),

    /** When the access token expires (null = long-lived / does not expire) */
    accessTokenExpiresAt: timestamp("access_token_expires_at"),

    /** Extra platform-specific data (phone_number_id, profile_picture_url, etc.) */
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),

    /** Webhook subscription lifecycle state for the connected account */
    webhookSubscriptionStatus: text("webhook_subscription_status")
      .notNull()
      .default("not_configured"),

    /** When webhooks were last successfully subscribed for the account */
    webhookSubscribedAt: timestamp("webhook_subscribed_at"),

    /** Last subscription failure reason, if any */
    webhookSubscriptionError: text("webhook_subscription_error"),

    connectedAt: timestamp("connected_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("meta_connection_user_id_idx").on(table.userId),
    index("meta_connection_platform_idx").on(table.userId, table.platform),
    index("meta_connection_platform_account_id_idx").on(
      table.platformAccountId,
    ),
    index("meta_connection_facebook_page_id_idx").on(table.facebookPageId),
    index("meta_connection_instagram_business_account_id_idx").on(
      table.instagramBusinessAccountId,
    ),
    index("meta_connection_whatsapp_phone_number_id_idx").on(
      table.whatsappPhoneNumberId,
    ),
    unique("meta_connection_user_platform_account").on(
      table.userId,
      table.platform,
      table.platformAccountId,
    ),
  ],
);

export const metaConnectionRelations = relations(metaConnection, ({ one }) => ({
  user: one(user, {
    fields: [metaConnection.userId],
    references: [user.id],
  }),
}));
