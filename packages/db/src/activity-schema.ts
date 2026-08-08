import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { business } from "./auth-schema";

/**
 * Business activity log / audit trail — records CRUD actions performed by staff members,
 * AI sales agent, or automated background sweeps.
 */
export const activityLog = pgTable(
  "activity_log",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    businessId: text("business_id")
      .notNull()
      .references(() => business.id, { onDelete: "cascade" }),

    // Snapshot of the actor at log time (survives staff deletion or name changes)
    actorUserId: text("actor_user_id"), // null for ai_agent / system
    actorName: text("actor_name").notNull(), // e.g. "Rahim Uddin" / "SellPilot AI" / "System"
    actorType: text("actor_type").notNull(), // "staff" | "ai_agent" | "system"

    action: text("action").notNull(), // e.g. "product.create", "order.update_status"
    entityType: text("entity_type").notNull(), // "product" | "order" | "customer" | "conversation" | "role" | "integration" | "setting" | "offer" | "invoice" | "subscription"
    entityId: text("entity_id"),

    summary: text("summary").notNull(), // e.g. "Rahim added product \"Black Panjabi\""
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),

    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("activity_log_business_created_idx").on(table.businessId, table.createdAt),
    index("activity_log_entity_idx").on(table.businessId, table.entityType, table.entityId),
  ],
);
