import { relations } from "drizzle-orm";
import { pgTable, text, timestamp, integer, jsonb, vector, index } from "drizzle-orm/pg-core";

import { user, business } from "./auth-schema";

export const product = pgTable("product", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  businessId: text("business_id")
    .notNull()
    .references(() => business.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category"),
  images: jsonb("images").$type<string[]>().default([]).notNull(),
  options: jsonb("options")
    .$type<{ name: string; values: string[] }[]>()
    .default([])
    .notNull(),
  rating: integer("rating"),
  status: text("status").default("active").notNull(), // active, draft, archived
  lowStockThreshold: integer("low_stock_threshold").default(5).notNull(),
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
  lowStockThreshold: integer("low_stock_threshold").default(5).notNull(),
  imageUrl: text("image_url"), // variant image
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

/**
 * Image-similarity search index — Postgres/pgvector replacement for the old ChromaDB
 * vector store. One row per indexed product/variant image. Lifecycle is managed by the
 * caller (packages/api/src/lib/vector-search.ts): product updates delete-then-reinsert
 * rather than upsert, so there's no unique constraint here to fight Postgres's
 * NULL-is-distinct uniqueness semantics on the nullable variantId column.
 */
export const productImageEmbedding = pgTable(
  "product_image_embedding",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    businessId: text("business_id")
      .notNull()
      .references(() => business.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => product.id, { onDelete: "cascade" }),
    variantId: text("variant_id").references(() => productVariant.id, { onDelete: "cascade" }),
    imageUrl: text("image_url").notNull(),
    productTitle: text("product_title").notNull(),
    /** nvidia/llama-nemotron-embed-vl-1b-v2 output — see packages/api/src/lib/embeddings.ts.
     * NVIDIA deprecated the hosted nvclip endpoint (it now only ships as a
     * self-hosted-GPU-required NIM container), so this NeMo Retriever VL embed model is
     * the replacement — still free-tier hosted, 2048 dimensions. */
    embedding: vector("embedding", { dimensions: 2048 }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    index("product_image_embedding_business_id_idx").on(table.businessId),
    index("product_image_embedding_product_id_idx").on(table.productId),
  ],
);

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
