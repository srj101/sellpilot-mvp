/**
 * Business-related AI Tools
 */

import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { getToolContext } from "./context";

// Type for business helpers (injected at runtime)
export interface BusinessHelpers {
  getBusinessProfile(userId: string): Promise<unknown>;
  getOfferByCode(userId: string, code: string): Promise<unknown>;
  getFAQMatches(userId: string, query: string, limit?: number): Promise<unknown[]>;
}

let helpers: BusinessHelpers | null = null;

export function setBusinessHelpers(h: BusinessHelpers): void {
  helpers = h;
}

function getHelpers(): BusinessHelpers {
  if (!helpers) {
    throw new Error("BusinessHelpers not initialized. Call setBusinessHelpers first.");
  }
  return helpers;
}

export const getBusinessProfileTool = new DynamicStructuredTool({
  name: "getBusinessProfile",
  description: "Get the store's business profile (name, description, currency, support contact). Call this at the start of a new conversation to greet the customer using the real store name.",
  schema: z.object({}),
  func: async () => {
    const { userId } = getToolContext();
    console.log("[Tool] getBusinessProfile", { userId });
    const result = await getHelpers().getBusinessProfile(userId);
    return JSON.stringify(result);
  },
});

export const getOfferByCodeTool = new DynamicStructuredTool({
  name: "getOfferByCode",
  description: "Get offer/discount by code",
  schema: z.object({
    code: z.string().describe("Offer/discount code"),
  }),
  func: async (input: unknown) => {
    const { code } = input as { code: string };
    const { userId } = getToolContext();
    console.log("[Tool] getOfferByCode", { userId, code });
    const result = await getHelpers().getOfferByCode(userId, code);
    return JSON.stringify(result);
  },
});

export const getFAQMatchesTool = new DynamicStructuredTool({
  name: "getFAQMatches",
  description: "Search FAQ entries for answers to common questions",
  schema: z.object({
    query: z.string().describe("Search query"),
    limit: z.number().optional().describe("Max results"),
  }),
  func: async (input: unknown) => {
    const { query, limit } = input as { query: string; limit?: number };
    const { userId } = getToolContext();
    console.log("[Tool] getFAQMatches", { userId, query, limit });
    const results = await getHelpers().getFAQMatches(userId, query, limit ?? 5);
    return JSON.stringify(results);
  },
});

export const businessTools = [
  getBusinessProfileTool,
  getOfferByCodeTool,
  getFAQMatchesTool,
];
