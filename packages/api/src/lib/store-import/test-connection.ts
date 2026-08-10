import type { StoreProvider } from "./types";
import { testShopifyConnection } from "./shopify";
import { testWooCommerceConnection } from "./woocommerce";

export interface ConnectionTestResult {
  ok: boolean;
  provider: StoreProvider;
  storeName: string;
  storeUrl: string;
  /** WooCommerce only — live product count at test time. */
  productCount?: number;
  shopId?: string;
}

/**
 * Validates a store connection with a live provider call BEFORE persisting it.
 * Throws on auth/scope/plugin failures — the UI surfaces the message verbatim.
 */
export async function testProviderConnection(
  provider: StoreProvider,
  credentials: { storeUrl: string; accessToken?: string; consumerKey?: string; consumerSecret?: string },
): Promise<ConnectionTestResult> {
  if (provider === "shopify") {
    if (!credentials.accessToken) throw new Error("Missing Shopify access token.");
    const result = await testShopifyConnection({ storeUrl: credentials.storeUrl, accessToken: credentials.accessToken });
    return { ...result, provider };
  }

  if (!credentials.consumerKey || !credentials.consumerSecret) {
    throw new Error("Missing WooCommerce consumer key or secret.");
  }
  const result = await testWooCommerceConnection({
    storeUrl: credentials.storeUrl,
    consumerKey: credentials.consumerKey,
    consumerSecret: credentials.consumerSecret,
  });
  return { ...result, provider };
}
