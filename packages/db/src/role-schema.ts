import { relations } from "drizzle-orm";
import { boolean, index, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

import { business } from "./auth-schema";

/**
 * Roles table - defines app-resource permission templates for a business/tenant.
 * Scoped by businessId (the store). Kept in its own file (not auth-schema.ts)
 * because `pnpm -F @acme/auth generate` regenerates that file wholesale from the
 * better-auth plugin config and would silently delete this table.
 *
 * This is deliberately separate from better-auth's own business "member.role"
 * (owner/admin/member, which governs org management) — this table governs access to
 * this app's own resources (Orders/Products/Customers/...) and is referenced by
 * member.customRoleKey. See packages/api/src/trpc.ts's orgProcedure.
 */
export const role = pgTable(
  "role",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    businessId: text("business_id")
      .notNull()
      .references(() => business.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    key: text("key").notNull(),
    description: text("description"),
    permissions: text("permissions").array().notNull().default([]),
    isDefault: boolean("is_default").default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("role_org_id_idx").on(table.businessId),
    unique("role_org_key_unique").on(table.businessId, table.key),
  ],
);

export const roleRelations = relations(role, ({ one }) => ({
  business: one(business, {
    fields: [role.businessId],
    references: [business.id],
  }),
}));
