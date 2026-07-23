/**
 * Product-related AI Tools
 */

import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { getToolContext } from "./context";

// Type for the aiHelpers module (injected at runtime)
export interface AIHelpers {
  searchProductsByKeyword(
    organizationId: string,
    keyword: string,
    limit?: number
  ): Promise<unknown[]>;
  getProductById(organizationId: string, productId: string): Promise<unknown>;
  checkProductStock(productId: string): Promise<{ stock: number; variants: unknown[] }>;
  getTopSellingProducts(organizationId: string, limit?: number): Promise<unknown[]>;
  listActiveProducts(organizationId: string, limit?: number): Promise<unknown[]>;
  getProductVariants(productId: string): Promise<unknown[]>;
  getProductsByTag(organizationId: string, tag: string, limit?: number): Promise<unknown[]>;
  getLowStockProducts(organizationId: string, threshold?: number): Promise<unknown[]>;
}

let helpers: AIHelpers | null = null;

export function setAIHelpers(h: AIHelpers): void {
  helpers = h;
}

function getHelpers(): AIHelpers {
  if (!helpers) {
    throw new Error("AIHelpers not initialized. Call setAIHelpers first.");
  }
  return helpers;
}

// NOTE: @langchain/core@1.x's `tool()` overloads fail to resolve against zod v4
// object schemas (all overloads reject the callback, even with an explicit
// z.infer annotation) — a known upstream typing gap, not fixable from here.
// DynamicStructuredTool + an explicit `input: unknown` cast is the working
// idiom until that's patched upstream.

export const searchProductsTool = new DynamicStructuredTool({
  name: "searchProducts",
  description: "Search products from inventory by keyword",
  schema: z.object({
    keyword: z.string().describe("Search keyword"),
  }),
  func: async (input: unknown) => {
    const { keyword } = input as { keyword: string };
    const { organizationId } = getToolContext();
    console.log("[Tool] searchProducts", { keyword, organizationId });
    const results = await getHelpers().searchProductsByKeyword(organizationId, keyword, 10);
    return JSON.stringify(results);
  },
});

export const getProductTool = new DynamicStructuredTool({
  name: "getProduct",
  description: "Get product details by ID",
  schema: z.object({
    id: z.string().describe("Product ID"),
  }),
  func: async (input: unknown) => {
    const { id } = input as { id: string };
    const { organizationId } = getToolContext();
    console.log("[Tool] getProduct", { id, organizationId });
    const result = await getHelpers().getProductById(organizationId, id);
    return JSON.stringify(result);
  },
});

export const checkStockTool = new DynamicStructuredTool({
  name: "checkStock",
  description: "Check product stock availability",
  schema: z.object({
    id: z.string().describe("Product ID"),
  }),
  func: async (input: unknown) => {
    const { id } = input as { id: string };
    console.log("[Tool] checkStock", { id });
    const result = await getHelpers().checkProductStock(id);
    return JSON.stringify({ stock: result.stock, variants: result.variants });
  },
});

export const getTopSellingProductsTool = new DynamicStructuredTool({
  name: "getTopSellingProducts",
  description: "Get top selling products",
  schema: z.object({
    limit: z.number().optional().describe("Max results"),
  }),
  func: async (input: unknown) => {
    const { limit } = input as { limit?: number };
    const { organizationId } = getToolContext();
    console.log("[Tool] getTopSellingProducts", { organizationId, limit });
    const results = await getHelpers().getTopSellingProducts(organizationId, limit ?? 5);
    return JSON.stringify(results);
  },
});

export const listActiveProductsTool = new DynamicStructuredTool({
  name: "listActiveProducts",
  description: "List all active products",
  schema: z.object({
    limit: z.number().optional().describe("Max results"),
  }),
  func: async (input: unknown) => {
    const { limit } = input as { limit?: number };
    const { organizationId } = getToolContext();
    console.log("[Tool] listActiveProducts", { organizationId, limit });
    const results = await getHelpers().listActiveProducts(organizationId, limit ?? 20);
    return JSON.stringify(results);
  },
});

export const getProductVariantsTool = new DynamicStructuredTool({
  name: "getProductVariants",
  description: "Get variants for a product",
  schema: z.object({
    productId: z.string().describe("Product ID"),
  }),
  func: async (input: unknown) => {
    const { productId } = input as { productId: string };
    console.log("[Tool] getProductVariants", { productId });
    const results = await getHelpers().getProductVariants(productId);
    return JSON.stringify(results);
  },
});

export const getProductsByTagTool = new DynamicStructuredTool({
  name: "getProductsByTag",
  description: "Get products by tag",
  schema: z.object({
    tag: z.string().describe("Product tag"),
    limit: z.number().optional().describe("Max results"),
  }),
  func: async (input: unknown) => {
    const { tag, limit } = input as { tag: string; limit?: number };
    const { organizationId } = getToolContext();
    console.log("[Tool] getProductsByTag", { organizationId, tag, limit });
    const results = await getHelpers().getProductsByTag(organizationId, tag, limit ?? 10);
    return JSON.stringify(results);
  },
});

export const getLowStockProductsTool = new DynamicStructuredTool({
  name: "getLowStockProducts",
  description: "Get low stock products",
  schema: z.object({
    threshold: z.number().optional().describe("Stock threshold"),
  }),
  func: async (input: unknown) => {
    const { threshold } = input as { threshold?: number };
    const { organizationId } = getToolContext();
    console.log("[Tool] getLowStockProducts", { organizationId, threshold });
    const results = await getHelpers().getLowStockProducts(organizationId, threshold ?? 5);
    return JSON.stringify(results);
  },
});

export const productTools = [
  searchProductsTool,
  getProductTool,
  checkStockTool,
  getTopSellingProductsTool,
  listActiveProductsTool,
  getProductVariantsTool,
  getProductsByTagTool,
  getLowStockProductsTool,
];
