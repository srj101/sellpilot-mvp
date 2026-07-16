import { relations } from "drizzle-orm";
import { boolean, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth-schema";
import { order } from "./agent-schema";

/**
 * One row per page load on a customer-facing page (currently just /pay/[token]).
 * Scoped by userId (the merchant). `leftAt` is updated via a sendBeacon call on
 * page unload to give a real (if approximate) session-duration signal; a row
 * with no follow-up beacon and no resulting order is a "bounce".
 */
export const pageView = pgTable(
  "page_view",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    orderId: text("order_id").references(() => order.id, { onDelete: "set null" }),
    sessionId: text("session_id").notNull(),
    path: text("path").notNull(),
    /** Where the customer came from: whatsapp, facebook, instagram, direct */
    referrerChannel: text("referrer_channel"),
    country: text("country"),
    district: text("district"),
    converted: boolean("converted").default(false).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    leftAt: timestamp("left_at"),
  },
  (table) => [
    index("page_view_user_id_idx").on(table.userId),
    index("page_view_session_id_idx").on(table.sessionId),
    index("page_view_order_id_idx").on(table.orderId),
  ],
);

export const pageViewRelations = relations(pageView, ({ one }) => ({
  user: one(user, {
    fields: [pageView.userId],
    references: [user.id],
  }),
  order: one(order, {
    fields: [pageView.orderId],
    references: [order.id],
  }),
}));
