/**
 * Shared types for the store-import pipeline (Shopify / WooCommerce → SellPilot).
 */

export type StoreProvider = "shopify" | "woocommerce";

export const STORE_PROVIDERS: StoreProvider[] = ["shopify", "woocommerce"];

/** The two supported credential shapes, as stored (encrypted) on storeConnection. */
export interface ShopifyCredentials {
  storeUrl: string;
  accessToken: string;
}

export interface WooCommerceCredentials {
  storeUrl: string;
  consumerKey: string;
  consumerSecret: string;
}

export type ProviderCredentials = ShopifyCredentials | WooCommerceCredentials;

/** What normalize() produces — the neutral shape we insert SellPilot rows from. */
export interface NormalizedOption {
  name: string;
  values: string[];
}

export interface NormalizedVariant {
  title: string;
  option1?: string | null;
  option2?: string | null;
  option3?: string | null;
  /** Integer cents. */
  price: number;
  /** Integer cents, nullable. */
  compareAtPrice: number | null;
  sku: string | null;
  inventoryQuantity: number;
  imageUrl: string | null;
  /** External variant id from the provider, for dedupe/traceability. */
  externalVariantId: string;
}

export interface NormalizedProduct {
  externalProductId: string;
  title: string;
  description: string | null;
  category: string | null;
  status: "active" | "draft" | "archived";
  images: string[];
  options: NormalizedOption[];
  rating: number | null;
  variants: NormalizedVariant[];
}

/** What getSourceProducts returns to the picker — NormalizedProduct minus variants (count only). */
export interface SourceProductSummary {
  externalProductId: string;
  title: string;
  category: string | null;
  status: "active" | "draft" | "archived";
  images: string[];
  options: NormalizedOption[];
  rating: number | null;
  variantCount: number;
  /** True when this external product has already been imported (dedupe). */
  alreadyImported: boolean;
}
