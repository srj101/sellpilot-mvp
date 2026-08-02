/**
 * Checkout / pricing AI Tools
 * Use these instead of doing price arithmetic in the model itself.
 */

import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { getToolContext } from "./context";
import { MULTI_PRODUCT_CART_LIMIT } from "../types";

export interface QuoteOrderItemInput {
  productId: string;
  variantId?: string;
  quantity: number;
}

export interface QuotedLineItem {
  productId: string;
  variantId: string;
  productTitle: string;
  variantTitle: string | null;
  imageUrl: string | null;
  unitPrice: number;
  compareAtPrice: number | null;
  quantity: number;
  lineTotal: number;
}

export interface QuoteOrderParams {
  businessId: string;
  items: QuoteOrderItemInput[];
  district?: string;
  offerCode?: string;
}

export interface QuoteOrderResult {
  items: QuotedLineItem[];
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
   * Records the full current cart (every item just priced together) as the thread's
   * active cart, consumed by the abandoned-cart follow-up job. */
  upsertActiveCart?(
    userId: string,
    businessId: string,
    platform: string,
    threadId: string,
    senderId: string | undefined,
    items: { productId: string; variantId: string; name: string; variantTitle?: string; imageUrl?: string; qty: number; unitPrice: number }[],
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
    "Get the real price breakdown before the customer commits: regular/offer price, shipping for their district, and total. Always call before quoting a price or creating an order — never calculate totals yourself. Pass every product the customer currently wants as one entry in items, including any combo/upsell suggestion they agreed to (from getComboOffersForProduct) — always pass the customer's FULL current selection, not just what's new since the last call.",
  schema: z.object({
    items: z
      .array(
        z.object({
          productId: z.string().describe("Product ID"),
          variantId: z.string().optional().describe("Specific variant ID, if the customer chose one"),
          quantity: z.number().describe("Quantity"),
        }),
      )
      .min(1)
      .describe("Every product the customer currently wants, one entry each — their full cart, not a delta"),
    district: z.string().optional().describe("Delivery district/city, used to look up shipping cost"),
    offerCode: z.string().optional().describe("Discount/offer code the customer provided"),
  }),
  func: async (input: unknown) => {
    const { items, district, offerCode } = input as {
      items: QuoteOrderItemInput[];
      district?: string;
      offerCode?: string;
    };
    const { userId, businessId, threadId, platform, customerId, planKey } = getToolContext();
    const limit = MULTI_PRODUCT_CART_LIMIT[planKey ?? "starter"];
    if (items.length > limit) {
      return JSON.stringify({
        error: `Too many products for this plan — up to ${limit} products per order are allowed, ${items.length} were given. Ask the customer to pick their top ${limit} instead, or split into separate orders.`,
      });
    }

    console.log("[Tool] quoteOrder", { businessId, items, district });
    const result = await getHelpers().quoteOrder({ businessId, items, district, offerCode });

    if (!result.error && result.items.length > 0) {
      // Best-effort: powers the abandoned-cart follow-up job, must never fail the quote itself.
      getHelpers()
        .upsertActiveCart?.(
          userId,
          businessId,
          platform,
          threadId,
          customerId,
          result.items.map((i) => ({
            productId: i.productId,
            variantId: i.variantId,
            name: i.productTitle,
            variantTitle: i.variantTitle ?? undefined,
            imageUrl: i.imageUrl ?? undefined,
            qty: i.quantity,
            unitPrice: i.unitPrice,
          })),
        )
        .catch((err) => console.error("[Tool] upsertActiveCart failed:", err));
    }

    return JSON.stringify(result);
  },
});

export const checkoutTools = [quoteOrderTool];
