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
  productTitle: string;
  variantTitle: string | null;
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
    "Get the real price breakdown for a product before the customer commits: regular price, offer price (if a compareAtPrice or offer code applies), shipping cost for their district, and the final total. Always call this before quoting a total price or creating an order — never calculate totals yourself. If the customer has agreed to add a combo/bundle product suggested via getComboOffersForProduct, pass it as comboProductId so the combo discount is priced in for real.",
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
    const { businessId } = getToolContext();
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
    return JSON.stringify(result);
  },
});

export const checkoutTools = [quoteOrderTool];
