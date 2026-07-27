/**
 * AI Tools Index
 * Export all tools and helper setup functions
 */

export { setToolContext, getToolContext } from "./context";

export {
  productTools,
  setAIHelpers,
  type AIHelpers,
} from "./product-tools";

export {
  orderTools,
  getCustomerPurchaseHistoryTool,
  setOrderHelpers,
  type OrderHelpers,
  type CreateOrderParams,
  type CreateOrderResult,
} from "./order-tools";

export {
  businessTools,
  getComboOffersForProductTool,
  setBusinessHelpers,
  getBusinessHelpers,
  type BusinessHelpers,
} from "./business-tools";

export {
  checkoutTools,
  setCheckoutHelpers,
  type CheckoutHelpers,
  type QuoteOrderParams,
  type QuoteOrderResult,
} from "./checkout-tools";

export {
  mediaTools,
  setMediaSendFunction,
  setConnectionContext,
  type SendImageFunction,
} from "./media-tools";

import { productTools } from "./product-tools";
import { orderTools, getCustomerPurchaseHistoryTool } from "./order-tools";
import { businessTools, getComboOffersForProductTool } from "./business-tools";
import { checkoutTools } from "./checkout-tools";
import { mediaTools } from "./media-tools";
import type { PlanKey } from "../types";

const STARTER_EXCLUDED_TOOL_NAMES = new Set<string>([
  getComboOffersForProductTool.name,
  getCustomerPurchaseHistoryTool.name,
]);

/**
 * Get all available tools for a given plan tier. Starter is excluded from the
 * combo-offer tool (the upsell/cross-sell mechanism — see prompts.ts's
 * RECOMMENDATION_INSTRUCTIONS, Starter is "basic only") and from purchase-history
 * lookups (Growth+ only, see plans.ts's purchaseHistoryEnabled).
 * Omitting planKey keeps the old unrestricted behavior (defensive default for any
 * caller that hasn't been updated to pass one).
 */
export function getAllTools(planKey?: PlanKey) {
  const all = [...productTools, ...orderTools, ...businessTools, ...checkoutTools, ...mediaTools];
  if (planKey === "starter") {
    return all.filter((tool) => !STARTER_EXCLUDED_TOOL_NAMES.has(tool.name));
  }
  return all;
}

/**
 * Get tools by category
 */
export function getToolsByCategory(category: "product" | "order" | "business" | "checkout" | "media") {
  switch (category) {
    case "product":
      return productTools;
    case "order":
      return orderTools;
    case "business":
      return businessTools;
    case "checkout":
      return checkoutTools;
    case "media":
      return mediaTools;
  }
}
