/**
 * Order-related AI Tools
 */

import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { getToolContext } from "./context";
import type { PlanKey } from "../types";

/** Local mirror of PLAN_CATALOG[*].limits.purchaseHistoryLimit (packages/api/src/lib/plans.ts)
 * — see types.ts's PlanKey comment for why this package doesn't import @acme/api directly.
 * Starter's value is never read: the tool itself is excluded from getAllTools() for
 * Starter (see tools/index.ts), so the limit only matters for Growth/Pro. */
const PURCHASE_HISTORY_LIMIT: Record<PlanKey, number | null> = {
  starter: 0,
  growth: 3,
  pro: null,
};

export interface CreateOrderParams {
  userId: string;
  businessId: string;
  threadId: string;
  channel: string;
  productId: string;
  variantId?: string;
  quantity: number;
  /** Omit any of these three for a returning customer already linked to this
   * conversation (from an earlier order in the same thread) — the backend fills in
   * whichever are missing from that record. Required on a customer's first order in
   * this conversation. */
  customerName?: string;
  phone?: string;
  address?: string;
  district?: string;
  offerCode?: string;
  /** Second product the customer agreed to add — e.g. accepting a combo suggestion. */
  comboProductId?: string;
  comboVariantId?: string;
  comboQuantity?: number;
  /** "cod" = order is confirmed immediately, cash collected at delivery, no payment link
   * needed. "online" (default if omitted) = order stays pending until the customer pays
   * via paymentUrl. */
  paymentMethod?: "cod" | "online";
}

export interface CreateOrderResult {
  success: boolean;
  orderId?: string;
  orderNumber?: string;
  paymentUrl?: string;
  /** Echoes back what was actually recorded — "cod" means the order is already
   * confirmed and paymentUrl should NOT be presented as something still required. */
  paymentMethod?: "cod" | "online";
  total?: number;
  error?: string;
}

export interface ConfirmCodResult {
  success: boolean;
  orderNumber?: string;
  total?: number;
  error?: string;
}

// Type for order helpers (injected at runtime)
export interface OrderHelpers {
  createCustomerAndOrder(params: CreateOrderParams): Promise<CreateOrderResult>;
  /** Orders tied to the current conversation thread only — never other customers' orders. */
  getOrdersForThread(businessId: string, threadId: string): Promise<unknown[]>;
  getCustomerByPhone(businessId: string, phone: string): Promise<unknown>;
  /** THIS SAME customer's own orders across every thread/channel, capped at `limit`
   * (null = unlimited). Growth/Pro only — see PURCHASE_HISTORY_LIMIT above. */
  getCustomerPurchaseHistory(businessId: string, threadId: string, limit: number | null): Promise<unknown[]>;
  /** Finds the most recent pending order for this thread and confirms it as COD —
   * for when a customer already has a payment link but states COD in chat instead of
   * clicking it. Returns success: false with an error if no pending order exists. */
  confirmCodForThread(businessId: string, threadId: string): Promise<ConfirmCodResult>;
}

let helpers: OrderHelpers | null = null;

export function setOrderHelpers(h: OrderHelpers): void {
  helpers = h;
}

function getHelpers(): OrderHelpers {
  if (!helpers) {
    throw new Error("OrderHelpers not initialized. Call setOrderHelpers first.");
  }
  return helpers;
}

export const createOrderTool = new DynamicStructuredTool({
  name: "createOrder",
  description:
    "Create a customer order. Only call after the customer confirms the price breakdown AND payment preference (see paymentMethod). If they agreed to a combo (from getComboOffersForProduct), pass the same comboProductId used in the confirmed quoteOrder call. customerName/phone/address can be omitted if this customer already ordered in this conversation — reused automatically. Phone must be real (01XXXXXXXXX or +8801XXXXXXXXX), never a placeholder.",
  schema: z.object({
    productId: z.string().describe("Product ID"),
    variantId: z.string().optional().describe("Specific variant ID, if the customer chose one"),
    quantity: z.number().describe("Quantity"),
    customerName: z.string().optional().describe("Customer name — omit if already on file from an earlier order in this conversation"),
    phone: z.string().optional().describe("Real BD mobile number, e.g. 01XXXXXXXXX or +8801XXXXXXXXX — never a placeholder. Omit if already on file from an earlier order here."),
    address: z.string().optional().describe("Delivery address — omit if already on file from an earlier order in this conversation"),
    district: z.string().optional().describe("Delivery district/city, used to look up the shipping cost"),
    offerCode: z.string().optional().describe("Discount/offer code the customer provided"),
    comboProductId: z.string().optional().describe("A second product the customer agreed to add as a combo"),
    comboVariantId: z.string().optional().describe("Specific variant ID for the combo product, if the customer chose one"),
    comboQuantity: z.number().optional().describe("Quantity of the combo product, defaults to 1"),
    paymentMethod: z
      .enum(["cod", "online"])
      .optional()
      .describe(
        "'cod' if they said cash on delivery/pay on arrival (or equivalent phrasing). 'online' if bKash/Nagad/Card/the link. Omit only if asked and still unanswered — never guess.",
      ),
  }),
  func: async (input: unknown) => {
    const {
      productId,
      variantId,
      quantity,
      customerName,
      phone,
      address,
      district,
      offerCode,
      comboProductId,
      comboVariantId,
      comboQuantity,
      paymentMethod,
    } = input as {
      productId: string;
      variantId?: string;
      quantity: number;
      customerName?: string;
      phone?: string;
      address?: string;
      district?: string;
      offerCode?: string;
      comboProductId?: string;
      comboVariantId?: string;
      comboQuantity?: number;
      paymentMethod?: "cod" | "online";
    };
    const { userId, businessId, threadId, platform } = getToolContext();

    console.log("[Tool] createOrder", {
      productId,
      quantity,
      customerName,
      phone: phone ? phone.replace(/(\d{3})\d+(\d{2})/, "$1***$2") : phone,
      userId,
      businessId,
      comboProductId,
      paymentMethod,
    });

    const result = await getHelpers().createCustomerAndOrder({
      userId,
      businessId,
      threadId,
      channel: platform,
      productId,
      variantId,
      quantity,
      customerName,
      phone,
      address,
      district,
      offerCode,
      comboProductId,
      comboVariantId,
      comboQuantity,
      paymentMethod,
    });

    return JSON.stringify(result);
  },
});

export const confirmCashOnDeliveryTool = new DynamicStructuredTool({
  name: "confirmCashOnDelivery",
  description:
    "Switch this customer's most recent pending order (already has a payment link) to Cash on Delivery — use when they say COD after already having a link. Do NOT use to create a new order, only to update an existing one. Returns an error if there's no pending order for this conversation.",
  schema: z.object({}),
  func: async () => {
    const { businessId, threadId } = getToolContext();
    console.log("[Tool] confirmCashOnDelivery", { businessId, threadId });
    const result = await getHelpers().confirmCodForThread(businessId, threadId);
    return JSON.stringify(result);
  },
});

export const trackOrderTool = new DynamicStructuredTool({
  name: "trackOrder",
  description:
    "Look up the status and real delivery details (name/phone/address) of this customer's own order(s) in this conversation — never another customer's. Call it when asked about order status, or before stating/reusing a previous order's name/phone/address — never guess those from memory.",
  schema: z.object({}),
  func: async () => {
    const { businessId, threadId } = getToolContext();
    console.log("[Tool] trackOrder", { businessId, threadId });
    const results = await getHelpers().getOrdersForThread(businessId, threadId);
    return JSON.stringify(results);
  },
});

export const getCustomerByPhoneTool = new DynamicStructuredTool({
  name: "getCustomerByPhone",
  description: "Lookup a returning customer by the phone number they just gave you in this conversation",
  schema: z.object({
    phone: z.string().describe("Phone number"),
  }),
  func: async (input: unknown) => {
    const { phone } = input as { phone: string };
    const { businessId } = getToolContext();
    console.log("[Tool] getCustomerByPhone", { businessId, phone });
    const result = await getHelpers().getCustomerByPhone(businessId, phone);
    return JSON.stringify(result);
  },
});

export const getCustomerPurchaseHistoryTool = new DynamicStructuredTool({
  name: "getCustomerPurchaseHistory",
  description:
    "Look up THIS customer's own past orders across ALL their previous conversations with this store (not just this thread) — use only when they ask what they've bought before or reference a past purchase. This is the one exception to only seeing this conversation's data: it still only ever returns this same customer's own history, never another customer's. Returns an empty list if there's no linked history yet.",
  schema: z.object({}),
  func: async () => {
    const { businessId, threadId, planKey } = getToolContext();
    const limit = PURCHASE_HISTORY_LIMIT[planKey ?? "starter"];
    console.log("[Tool] getCustomerPurchaseHistory", { businessId, threadId, limit });
    const results = await getHelpers().getCustomerPurchaseHistory(businessId, threadId, limit);
    return JSON.stringify(results);
  },
});

export const orderTools = [
  createOrderTool,
  confirmCashOnDeliveryTool,
  trackOrderTool,
  getCustomerByPhoneTool,
  getCustomerPurchaseHistoryTool,
];
