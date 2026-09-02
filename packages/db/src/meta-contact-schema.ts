import { index, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

import { business } from "./auth-schema";

/**
 * A customer's identity on a messaging platform — the name and profile picture Meta knows
 * them by, cached locally rather than fetched on every inbox render.
 *
 * This exists because the previous approach didn't work. resolve-contact-names.ts held an
 * in-memory Map with a one-hour TTL, but module-level state does not survive between
 * requests in this Next.js runtime, so the cache had a 100% miss rate: every single inbox
 * load re-queried the Graph API and paid 1-2 seconds for it. Persisting the answer is the
 * only caching that actually holds here.
 *
 * It also decouples the inbox from the connection. Names used to vanish the moment a page
 * was disconnected, because resolving them required that page's access token — which is
 * why threads whose meta_connection_id had been nulled were stuck showing "Contact
 * 2731…8960" forever. Once the name lives here, a paused or removed connection leaves the
 * conversation history readable.
 *
 * Deliberately NOT the `customer` table: that holds delivery details, which are a
 * different fact about a different person — a gift order carries the recipient's name and
 * address, not the sender's. Conflating the two would corrupt both.
 */
export const metaContact = pgTable(
  "meta_contact",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    businessId: text("business_id")
      .notNull()
      .references(() => business.id, { onDelete: "cascade" }),
    /** facebook_page | instagram | whatsapp */
    platform: text("platform").notNull(),
    /** The platform-scoped id Meta uses for this person — page-scoped on Messenger, so the
     * same human has a different psid per page, which is why businessId is part of the key. */
    psid: text("psid").notNull(),

    /** Display name as Meta reports it. Null until the first sync succeeds. */
    name: text("name"),

    /**
     * S3 object key, not a URL — getPublicUrl() builds the URL at render time, so moving
     * the bucket behind a CDN later is a config change rather than a data migration.
     * Shape: avatars/{businessId}/{platform}/{psid}.jpg
     */
    avatarS3Key: text("avatar_s3_key"),
    /**
     * SHA-256 of the stored image bytes. Meta's profile_pic URLs are signed and differ on
     * every request even when the photo is unchanged, so the URL cannot be used to detect
     * "still the same picture" — hashing the bytes is what stops every refresh cycle
     * rewriting every avatar in S3.
     */
    avatarHash: text("avatar_hash"),

    /** Tracked separately because the two come from different endpoints with different
     * costs: names arrive for a whole page in one call, avatars are one call per contact. */
    nameRefreshedAt: timestamp("name_refreshed_at"),
    avatarRefreshedAt: timestamp("avatar_refreshed_at"),

    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .notNull()
      .$onUpdateFn(() => new Date()),
  },
  (table) => [
    index("meta_contact_business_id_idx").on(table.businessId),
    // The inbox looks contacts up by (platform, psid) for a business on every render.
    unique("meta_contact_business_platform_psid_unique").on(
      table.businessId,
      table.platform,
      table.psid,
    ),
  ],
);
