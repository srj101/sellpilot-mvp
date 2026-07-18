/**
 * Media-related AI Tools
 * For sending images and other media to customers
 */

import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import type { ConnectionContext } from "../types";
import { getToolContext } from "./context";

// Type for media send function (injected at runtime)
export type SendImageFunction = (
  connectionContext: ConnectionContext,
  productId: string,
  userId: string
) => Promise<{ success: boolean; error?: string }>;

let sendImageFn: SendImageFunction | null = null;
let currentConnectionContext: ConnectionContext | null = null;

export function setMediaSendFunction(fn: SendImageFunction): void {
  sendImageFn = fn;
}

export function setConnectionContext(ctx: ConnectionContext | undefined): void {
  currentConnectionContext = ctx ?? null;
}

export const sendProductImageTool = new DynamicStructuredTool({
  name: "sendProductImage",
  description:
    "Send a product image directly to the customer's chat. Use this when the customer asks to see a product, asks about appearance, color, or design.",
  schema: z.object({
    productId: z.string().describe("The ID of the product to send image for"),
  }),
  func: async (input: unknown) => {
    const { productId } = input as { productId: string };
    const { userId } = getToolContext();
    console.log("[Tool] sendProductImage", { productId, userId });

    if (!sendImageFn) {
      return JSON.stringify({
        success: false,
        error: "Image sending not configured",
      });
    }

    if (!currentConnectionContext) {
      return JSON.stringify({
        success: false,
        error: "No connection context available for sending media",
      });
    }

    const result = await sendImageFn(currentConnectionContext, productId, userId);
    return JSON.stringify(result);
  },
});

export const mediaTools = [sendProductImageTool];
