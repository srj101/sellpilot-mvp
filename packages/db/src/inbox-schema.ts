import { relations } from "drizzle-orm";
import { boolean, index, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

import { user, organization } from "./auth-schema";
import { customer } from "./agent-schema";

/**
 * Persisted per-conversation state. Conversations themselves are derived on the fly
 * from metaWebhookEvent rows (see packages/api/src/lib/meta-inbox.ts) — this table
 * only holds the human-set metadata layered on top of a thread, keyed by the same
 * threadKey format ("platform:contactId") used there.
 */
export const conversationMeta = pgTable(
  "conversation_meta",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    threadId: text("thread_id").notNull(),
    /** open | ticket | resolved | archived */
    status: text("status").default("open").notNull(),
    starred: boolean("starred").default(false).notNull(),
    /**
     * Linked CRM customer record, if one exists yet. A thread only gets a customer once
     * an order has been placed on it (AI or manual) — threads/customers aren't otherwise
     * connected, since conversations are keyed by platform contact id, not phone/email.
     */
    customerId: text("customer_id").references(() => customer.id, { onDelete: "set null" }),
    /** Org member assigned to this conversation. Nullable until Phase 0 (team/roles) lands. */
    assignedMemberId: text("assigned_member_id"),
    /** Cached AI-generated conversation summary. */
    summary: text("summary"),
    summaryGeneratedAt: timestamp("summary_generated_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("conversation_meta_org_id_idx").on(table.organizationId),
    index("conversation_meta_customer_id_idx").on(table.customerId),
    unique("conversation_meta_org_thread_unique").on(table.organizationId, table.threadId),
  ],
);

/**
 * Shared tag vocabulary per merchant (Priority, Top Client, Risky, ...), applied to
 * customers via customerTag. Kept as a real table (not a jsonb array) so labels/colors
 * stay consistent across contacts and can be renamed in one place.
 */
export const tag = pgTable(
  "tag",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    /** Tailwind color token, e.g. "rose", "emerald" — mapped to classes in the UI. */
    color: text("color").default("slate").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("tag_org_id_idx").on(table.organizationId),
    unique("tag_org_label_unique").on(table.organizationId, table.label),
  ],
);

export const customerTag = pgTable(
  "customer_tag",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    customerId: text("customer_id")
      .notNull()
      .references(() => customer.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tag.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("customer_tag_customer_id_idx").on(table.customerId),
    index("customer_tag_tag_id_idx").on(table.tagId),
    unique("customer_tag_customer_tag_unique").on(table.customerId, table.tagId),
  ],
);

/**
 * Multiple timestamped notes per customer (the CRM-style running log), distinct from
 * customer.notes (a single free-text field used elsewhere).
 */
export const customerNote = pgTable(
  "customer_note",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    customerId: text("customer_id")
      .notNull()
      .references(() => customer.id, { onDelete: "cascade" }),
    authorLabel: text("author_label").notNull(),
    body: text("body").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("customer_note_customer_id_idx").on(table.customerId),
    index("customer_note_org_id_idx").on(table.organizationId),
  ],
);

export const conversationMetaRelations = relations(conversationMeta, ({ one }) => ({
  user: one(user, { fields: [conversationMeta.userId], references: [user.id] }),
  customer: one(customer, { fields: [conversationMeta.customerId], references: [customer.id] }),
}));

export const tagRelations = relations(tag, ({ one, many }) => ({
  user: one(user, { fields: [tag.userId], references: [user.id] }),
  customerTags: many(customerTag),
}));

export const customerTagRelations = relations(customerTag, ({ one }) => ({
  customer: one(customer, { fields: [customerTag.customerId], references: [customer.id] }),
  tag: one(tag, { fields: [customerTag.tagId], references: [tag.id] }),
}));

export const customerNoteRelations = relations(customerNote, ({ one }) => ({
  user: one(user, { fields: [customerNote.userId], references: [user.id] }),
  customer: one(customer, { fields: [customerNote.customerId], references: [customer.id] }),
}));
