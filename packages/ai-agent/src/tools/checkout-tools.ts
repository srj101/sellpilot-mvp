/**
 * Checkout / pricing AI Tools
 * Use these instead of doing price arithmetic in the model itself.
 */

import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { getToolContext } from "./context";

export interface QuoteOrderParams {
  userId: string;
  productId: string;
  variantId?: string;
  quantity: number;
  district?: string;
  offerCode?: string;
}

export interface QuoteOrderResult {
  productTitle: string;
  variantTitle: string | null;
  unitPrice: number;
  compareAtPrice: number | null;
  quantity: number;
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
    "Get the real price breakdown for a product before the customer commits: regular price, offer price (if a compareAtPrice or offer code applies), shipping cost for their district, and the final total. Always call this before quoting a total price or creating an order — never calculate totals yourself.",
  schema: z.object({
    productId: z.string().describe("Product ID"),
    variantId: z.string().optional().describe("Specific variant ID, if the customer chose one"),
    quantity: z.number().describe("Quantity"),
    district: z.string().optional().describe("Delivery district/city, used to look up shipping cost"),
    offerCode: z.string().optional().describe("Discount/offer code the customer provided"),
  }),
  func: async (input: unknown) => {
    const { productId, variantId, quantity, district, offerCode } = input as {
      productId: string;
      variantId?: string;
      quantity: number;
      district?: string;
      offerCode?: string;
    };
    const { userId } = getToolContext();
    console.log("[Tool] quoteOrder", { userId, productId, variantId, quantity, district });
    const result = await getHelpers().quoteOrder({
      userId,
      productId,
      variantId,
      quantity,
      district,
      offerCode,
    });
    return JSON.stringify(result);
  },
});

export const checkoutTools = [quoteOrderTool];
