import { bigint, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { business } from "./auth-schema";

/**
 * Our own copy of every file that passes through a conversation.
 *
 * Previously only the URL was kept, and Meta's CDN URLs are signed and expire — checked
 * against live data, a customer photo lasts about 30 days and a voice note about 5. So
 * every image and voice message in every merchant's inbox was on a timer, quietly turning
 * into a broken thumbnail long after anyone would connect it to a cause. Downloading the
 * bytes once is the only way conversation history survives.
 *
 * A table rather than a field on the webhook event, because the bytes have to be summed
 * per business for the storage quota, expired on a retention sweep, and released when a
 * business leaves. None of that is possible against values buried in a jsonb payload.
 */
export const conversationMedia = pgTable(
  "conversation_media",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    businessId: text("business_id")
      .notNull()
      .references(() => business.id, { onDelete: "cascade" }),
    /** e.g. "facebook_page:26571185019223964" — the thread this belongs to. */
    threadId: text("thread_id"),
    /** The meta_webhook_event this file arrived on, when there is one. Not a foreign key:
     * events are pruned on their own schedule and losing one must not delete the file. */
    messageEventId: text("message_event_id"),

    /** image | audio | avatar */
    kind: text("kind").notNull(),
    s3Key: text("s3_key").notNull(),
    /** Counted against the plan's storage limit — see media-storage.ts. */
    bytes: bigint("bytes", { mode: "number" }).notNull(),
    contentType: text("content_type"),

    /** The original Meta URL. Kept for debugging and to avoid re-downloading the same
     * file twice; it is expected to be dead within weeks, which is the whole point. */
    sourceUrl: text("source_url"),

    /**
     * For voice notes: the text we already generate to feed the agent and then discard.
     * Storing it means a merchant can read a voice message in their inbox instead of
     * downloading and playing an audio file, which on a phone in a shop is the difference
     * between reading it and not.
     */
    transcript: text("transcript"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    // Quota sums and the per-business purge.
    index("conversation_media_business_id_idx").on(table.businessId),
    // Rendering a thread, and the retention sweep's per-business age scan.
    index("conversation_media_thread_idx").on(table.businessId, table.threadId),
    index("conversation_media_created_idx").on(table.businessId, table.createdAt),
  ],
);
