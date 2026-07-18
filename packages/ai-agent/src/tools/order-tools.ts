/**
 * Order-related AI Tools
 */

import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { getToolContext } from "./context";

export interface CreateOrderParams {
  userId: string;
  threadId: string;
  channel: string;
  productId: string;
  variantId?: string;
  quantity: number;
  customerName: string;
  phone: string;
  address: string;
  district?: string;
  offerCode?: string;
}

export interface CreateOrderResult {
  success: boolean;
  orderId?: string;
  orderNumber?: string;
  paymentUrl?: string;
  total?: number;
  error?: string;
}

// Type for order helpers (injected at runtime)
export interface OrderHelpers {
  createCustomerAndOrder(params: CreateOrderParams): Promise<CreateOrderResult>;
  /** Orders tied to the current conversation thread only — never other customers' orders. */
  getOrdersForThread(userId: string, threadId: string): Promise<unknown[]>;
  getCustomerByPhone(userId: string, phone: string): Promise<unknown>;
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
    "Create a customer order. Only call this after the customer has confirmed the price breakdown (regular price, offer price if any, shipping cost, total) and all order details.",
  schema: z.object({
    productId: z.string().describe("Product ID"),
    variantId: z.string().optional().describe("Specific variant ID, if the customer chose one"),
    quantity: z.number().describe("Quantity"),
    customerName: z.string().describe("Customer name"),
    phone: z.string().describe("Phone number"),
    address: z.string().describe("Delivery address"),
    district: z.string().optional().describe("Delivery district/city, used to look up the shipping cost"),
    offerCode: z.string().optional().describe("Discount/offer code the customer provided"),
  }),
  func: async (input: unknown) => {
    const { productId, variantId, quantity, customerName, phone, address, district, offerCode } =
      input as {
        productId: string;
        variantId?: string;
        quantity: number;
        customerName: string;
        phone: string;
        address: string;
        district?: string;
        offerCode?: string;
      };
    const { userId, threadId, platform } = getToolContext();

    console.log("[Tool] createOrder", {
      productId,
      quantity,
      customerName,
      phone: phone.replace(/(\d{3})\d+(\d{2})/, "$1***$2"),
      userId,
    });

    const result = await getHelpers().createCustomerAndOrder({
      userId,
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
    });

    return JSON.stringify(result);
  },
});

export const trackOrderTool = new DynamicStructuredTool({
  name: "trackOrder",
  description:
    "Look up the status of the order(s) placed by THIS customer in this conversation. Never returns other customers' orders — there is nothing to configure, just call it when the customer asks about their order status.",
  schema: z.object({}),
  func: async () => {
    const { userId, threadId } = getToolContext();
    console.log("[Tool] trackOrder", { userId, threadId });
    const results = await getHelpers().getOrdersForThread(userId, threadId);
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
    const { userId } = getToolContext();
    console.log("[Tool] getCustomerByPhone", { userId, phone });
    const result = await getHelpers().getCustomerByPhone(userId, phone);
    return JSON.stringify(result);
  },
});

export const orderTools = [
  createOrderTool,
  trackOrderTool,
  getCustomerByPhoneTool,
];
