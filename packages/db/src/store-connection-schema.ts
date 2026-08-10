import { relations } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

import { business } from "./auth-schema";
import { product } from "./product-schema";

/**
 * External e-commerce store connections (Shopify / WooCommerce), authenticated with
 * API keys the business owner pastes in. Exactly one row per provider per business —
 * the unique (businessId, provider) constraint enforces the "max one account at a
 * time" rule; replacing a store is a disconnect + connect.
 *
 * credentials is a jsonb blob holding the provider-specific secrets (Shopify admin
 * access token, or WooCommerce consumer key/secret), ENCRYPTED at rest. Never return
 * it in full over the API — only masked hints.
 */
export const storeConnection = pgTable(
  "store_connection",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    businessId: text("business_id")
      .notNull()
      .references(() => business.id, { onDelete: "cascade" }),
    /** "shopify" | "woocommerce" */
    provider: text("provider").notNull(),
    /** e.g. https://mystore.myshopify.com or https://store.com */
    storeUrl: text("store_url").notNull(),
    /** Human-readable store name returned by the provider's shop/validate call */
    storeName: text("store_name"),
    /** Provider-specific credentials, encrypted at rest (see store-import/crypto.ts) */
    credentials: jsonb("credentials").$type<{ encrypted: string; version: 1 }>().notNull(),
    /** "active" | "error" — set to "error" when a live fetch fails auth */
    status: text("status").default("active").notNull(),
    lastSyncAt: timestamp("last_sync_at"),
    connectedAt: timestamp("connected_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("store_connection_business_id_idx").on(table.businessId),
    unique("store_connection_business_provider").on(table.businessId, table.provider),
  ],
);

/**
 * Tracks which SellPilot products came from which external store product/variant —
 * powers the "already imported" state in the import picker and prevents duplicate
 * imports. Also the seed of a future re-sync.
 */
export const productImport = pgTable(
  "product_import",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    businessId: text("business_id")
      .notNull()
      .references(() => business.id, { onDelete: "cascade" }),
    connectionId: text("connection_id")
      .notNull()
      .references(() => storeConnection.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => product.id, { onDelete: "cascade" }),
    /** External product id from the provider (string form of Shopify/Woo int id) */
    externalProductId: text("external_product_id").notNull(),
    /** External variant id, when the import was variant-scoped */
    externalVariantId: text("external_variant_id"),
    importedAt: timestamp("imported_at").defaultNow().notNull(),
  },
  (table) => [
    index("product_import_business_id_idx").on(table.businessId),
    index("product_import_connection_id_idx").on(table.connectionId),
    index("product_import_product_id_idx").on(table.productId),
  ],
);

export const storeConnectionRelations = relations(storeConnection, ({ one }) => ({
  business: one(business, {
    fields: [storeConnection.businessId],
    references: [business.id],
  }),
}));

export const productImportRelations = relations(productImport, ({ one }) => ({
  business: one(business, {
    fields: [productImport.businessId],
    references: [business.id],
  }),
  connection: one(storeConnection, {
    fields: [productImport.connectionId],
    references: [storeConnection.id],
  }),
  product: one(product, {
    fields: [productImport.productId],
    references: [product.id],
  }),
}));
