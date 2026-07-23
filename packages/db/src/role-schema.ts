import { relations } from "drizzle-orm";
import { boolean, index, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

import { user, organization } from "./auth-schema";

/**
 * Roles table - defines app-resource permission templates for a business/tenant.
 * Scoped by organizationId (the store). Kept in its own file (not auth-schema.ts)
 * because `pnpm -F @acme/auth generate` regenerates that file wholesale from the
 * better-auth plugin config and would silently delete this table.
 *
 * This is deliberately separate from better-auth's own organization "member.role"
 * (owner/admin/member, which governs org management) — this table governs access to
 * this app's own resources (Orders/Products/Customers/...) and is referenced by
 * member.customRoleKey. See packages/api/src/trpc.ts's orgProcedure.
 */
export const role = pgTable(
  "role",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
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
    index("role_org_id_idx").on(table.organizationId),
    unique("role_org_key_unique").on(table.organizationId, table.key),
  ],
);

export const roleRelations = relations(role, ({ one }) => ({
  user: one(user, {
    fields: [role.userId],
    references: [user.id],
  }),
}));
