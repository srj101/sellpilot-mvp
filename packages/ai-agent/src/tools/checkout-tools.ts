/**
 * Checkout / pricing AI Tools
 * Use these instead of doing price arithmetic in the model itself.
 */

import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { getToolContext } from "./context";

export interface QuoteOrderParams {
  businessId: string;
  productId: string;
  variantId?: string;
  quantity: number;
  district?: string;
  offerCode?: string;
  /** Second product to price alongside the first — e.g. a combo suggestion the customer
   * agreed to. A live combo offer for this exact pair applies instead of offerCode. */
  comboProductId?: string;
  comboVariantId?: string;
  comboQuantity?: number;
}

export interface QuoteOrderResult {
  productId: string;
  variantId: string;
  productTitle: string;
  variantTitle: string | null;
  imageUrl: string | null;
  unitPrice: number;
  compareAtPrice: number | null;
  quantity: number;
  comboProductTitle: string | null;
  comboUnitPrice: number | null;
  comboQuantity: number | null;
  subtotal: number;
  discountAmount: number;
  shippingCost: number;
  estimatedShippingDays: number | null;
  total: number;
  currency: string;
  error?: string;
}

export interface CheckoutHelpers {
  quoteOrder(params: QuoteOrderParams): Promise<QuoteOrderResult>;
  /** Best-effort — a failure here must never break the customer-facing quote response.
   * Records the last priced item as the session's tracked cart item, consumed by the
   * abandoned-cart follow-up job. */
  recordSessionCartItem?(
    userId: string,
    businessId: string,
    platform: string,
    threadId: string,
    senderId: string | undefined,
    item: { productId: string; variantId: string; name: string; variantTitle?: string; imageUrl?: string; quantity: number; unitPrice: number },
  ): Promise<void>;
}

let helpers: CheckoutHelpers | null = null;

export function setCheckoutHelpers(h: CheckoutHelpers): void {
  helpers = h;
}

function getHelpers(): CheckoutHelpers {
  if (!helpers) {
    throw new Error("CheckoutHelpers not initialized. Call setCheckoutHelpers first.");
  }
  return helpers;
}

export const quoteOrderTool = new DynamicStructuredTool({
  name: "quoteOrder",
  description:
    "Get the real price breakdown before the customer commits: regular/offer price, shipping for their district, and total. Always call before quoting a price or creating an order — never calculate totals yourself. If they agreed to a combo from getComboOffersForProduct, pass it as comboProductId so the discount is priced in for real.",
  schema: z.object({
    productId: z.string().describe("Product ID"),
    variantId: z.string().optional().describe("Specific variant ID, if the customer chose one"),
    quantity: z.number().describe("Quantity"),
    district: z.string().optional().describe("Delivery district/city, used to look up shipping cost"),
    offerCode: z.string().optional().describe("Discount/offer code the customer provided"),
    comboProductId: z.string().optional().describe("A second product the customer agreed to add as a combo, from getComboOffersForProduct's partnerProductId"),
    comboVariantId: z.string().optional().describe("Specific variant ID for the combo product, if the customer chose one"),
    comboQuantity: z.number().optional().describe("Quantity of the combo product, defaults to 1"),
  }),
  func: async (input: unknown) => {
    const { productId, variantId, quantity, district, offerCode, comboProductId, comboVariantId, comboQuantity } = input as {
      productId: string;
      variantId?: string;
      quantity: number;
      district?: string;
      offerCode?: string;
      comboProductId?: string;
      comboVariantId?: string;
      comboQuantity?: number;
    };
    const { userId, businessId, threadId, platform, customerId } = getToolContext();
    console.log("[Tool] quoteOrder", { businessId, productId, variantId, quantity, district, comboProductId });
    const result = await getHelpers().quoteOrder({
      businessId,
      productId,
      variantId,
      quantity,
      district,
      offerCode,
      comboProductId,
      comboVariantId,
      comboQuantity,
    });

    if (!result.error && result.variantId) {
      // Best-effort: powers the abandoned-cart follow-up job, must never fail the quote itself.
      getHelpers()
        .recordSessionCartItem?.(userId, businessId, platform, threadId, customerId, {
          productId: result.productId,
          variantId: result.variantId,
          name: result.productTitle,
          variantTitle: result.variantTitle ?? undefined,
          imageUrl: result.imageUrl ?? undefined,
          quantity: result.quantity,
          unitPrice: result.unitPrice,
        })
        .catch((err) => console.error("[Tool] recordSessionCartItem failed:", err));
    }

    return JSON.stringify(result);
  },
});

export const checkoutTools = [quoteOrderTool];
