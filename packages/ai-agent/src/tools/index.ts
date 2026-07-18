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
  setOrderHelpers,
  type OrderHelpers,
  type CreateOrderParams,
  type CreateOrderResult,
} from "./order-tools";

export {
  businessTools,
  setBusinessHelpers,
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
import { orderTools } from "./order-tools";
import { businessTools } from "./business-tools";
import { checkoutTools } from "./checkout-tools";
import { mediaTools } from "./media-tools";

/**
 * Get all available tools
 */
export function getAllTools() {
  return [...productTools, ...orderTools, ...businessTools, ...checkoutTools, ...mediaTools];
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
