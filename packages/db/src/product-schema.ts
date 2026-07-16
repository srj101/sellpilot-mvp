import { relations } from "drizzle-orm";
import { pgTable, text, timestamp, integer, jsonb } from "drizzle-orm/pg-core";

import { user } from "./auth-schema";

export const product = pgTable("product", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category"),
  images: jsonb("images").$type<string[]>().default([]).notNull(),
  options: jsonb("options")
    .$type<{ name: string; values: string[] }[]>()
    .default([])
    .notNull(),
  status: text("status").default("active").notNull(), // active, draft, archived
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const productVariant = pgTable("product_variant", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  productId: text("product_id")
    .notNull()
    .references(() => product.id, { onDelete: "cascade" }),
  title: text("title").notNull(), // e.g., "Black / M"
  option1: text("option1"),
  option2: text("option2"),
  option3: text("option3"),
  price: integer("price").notNull().default(0), // stored in cents/integers
  compareAtPrice: integer("compare_at_price"),
  /** Minimum quantity to unlock wholesalePrice, e.g. 12 */
  wholesaleMinQty: integer("wholesale_min_qty"),
  wholesalePrice: integer("wholesale_price"),
  sku: text("sku"),
  inventoryQuantity: integer("inventory_quantity").default(0).notNull(),
  imageUrl: text("image_url"), // variant image
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const productRelations = relations(product, ({ one, many }) => ({
  user: one(user, {
    fields: [product.userId],
    references: [user.id],
  }),
  variants: many(productVariant),
}));

export const productVariantRelations = relations(productVariant, ({ one }) => ({
  product: one(product, {
    fields: [productVariant.productId],
    references: [product.id],
  }),
}));
