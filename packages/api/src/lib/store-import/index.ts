export { encryptCredentials, decryptCredentials } from "./crypto";
export { normalizeShopifyProduct, normalizeWooCommerceProduct, toCents, ratingToInt } from "./normalize";
export type {
  ShopifyRawProduct,
  WooRawProduct,
  WooRawVariation,
} from "./normalize";
export {
  ShopifyApiError,
  testShopifyConnection,
  listShopifyProducts,
  providerLabel,
} from "./shopify";
export {
  WooCommerceApiError,
  testWooCommerceConnection,
  listWooCommerceProducts,
} from "./woocommerce";
export { testProviderConnection } from "./test-connection";
export type { ConnectionTestResult } from "./test-connection";
export type {
  StoreProvider,
  ProviderCredentials,
  ShopifyCredentials,
  WooCommerceCredentials,
  NormalizedProduct,
  NormalizedVariant,
  NormalizedOption,
  SourceProductSummary,
} from "./types";
export { STORE_PROVIDERS } from "./types";
