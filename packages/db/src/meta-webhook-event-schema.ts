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
import { metaConnection } from "./meta-connection-schema";

export const metaWebhookEvent = pgTable(
  "meta_webhook_event",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),

    /** Stable de-duplication key derived from the platform event payload. */
    dedupeKey: text("dedupe_key").notNull(),

    /** facebook_page | instagram | whatsapp */
    platform: text("platform").notNull(),

    /** Raw Meta object field: page | instagram | whatsapp_business_account */
    object: text("object").notNull(),

    /** message | comments | status | postback | read | etc. */
    eventType: text("event_type").notNull(),

    /** Resolved Meta connection row, if we could route it to a tenant. */
    metaConnectionId: text("meta_connection_id").references(
      () => metaConnection.id,
      {
        onDelete: "set null",
      },
    ),

    /** Resolved internal tenant. Useful for background workers and analytics. */
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),

    /** Platform-specific routing account identifier. */
    platformAccountId: text("platform_account_id").notNull(),

    /** Sender, message, comment, or status identifier. */
    sourceId: text("source_id"),

    /** The raw payload received from Meta. */
    rawPayload: jsonb("raw_payload").$type<Record<string, unknown>>().notNull(),

    /** Selected headers for diagnostics. */
    headers: jsonb("headers").$type<Record<string, string>>(),

    receivedAt: timestamp("received_at").defaultNow().notNull(),
    processedAt: timestamp("processed_at"),
    status: text("status").notNull().default("received"),
    errorMessage: text("error_message"),
  },
  (table) => [
    unique("meta_webhook_event_dedupe_key_unique").on(table.dedupeKey),
    index("meta_webhook_event_platform_idx").on(
      table.platform,
      table.platformAccountId,
    ),
    index("meta_webhook_event_user_id_idx").on(table.userId),
    index("meta_webhook_event_connection_id_idx").on(table.metaConnectionId),
  ],
);

export const metaWebhookEventRelations = relations(
  metaWebhookEvent,
  ({ one }) => ({
    connection: one(metaConnection, {
      fields: [metaWebhookEvent.metaConnectionId],
      references: [metaConnection.id],
    }),
    user: one(user, {
      fields: [metaWebhookEvent.userId],
      references: [user.id],
    }),
  }),
);
