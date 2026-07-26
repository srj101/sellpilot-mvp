/**
 * Business-related AI Tools
 */

import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { getToolContext } from "./context";
import type { BusinessProfileSnapshot } from "../types";

export interface ComboOffer {
  offerId: string;
  title: string;
  type: string;
  value: number;
  partnerProductId: string | null;
  partnerProductName: string | null;
}

// Type for business helpers (injected at runtime)
export interface BusinessHelpers {
  getBusinessProfile(businessId: string): Promise<BusinessProfileSnapshot | null>;
  getOfferByCode(businessId: string, code: string): Promise<unknown>;
  getComboOffersForProduct(businessId: string, productId: string): Promise<ComboOffer[]>;
  getFAQMatches(businessId: string, query: string, limit?: number): Promise<unknown[]>;
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

/** Exposed for graph.ts to fetch the business profile once per request to build the
 * system prompt — reuses the exact same injected helper the tool below calls, so there's
 * only ever one place (apps/worker's initializeAIHelpers) wiring this to the real DB. */
export function getBusinessHelpers(): BusinessHelpers {
  return getHelpers();
}

export const getBusinessProfileTool = new DynamicStructuredTool({
  name: "getBusinessProfile",
  description: "Get the store's business profile (name, description, currency, support contact). Call this at the start of a new conversation to greet the customer using the real store name.",
  schema: z.object({}),
  func: async () => {
    const { businessId } = getToolContext();
    console.log("[Tool] getBusinessProfile", { businessId });
    const result = await getHelpers().getBusinessProfile(businessId);
    return JSON.stringify(result);
  },
});

export const getOfferByCodeTool = new DynamicStructuredTool({
  name: "getOfferByCode",
  description: "Get offer/discount by code. Check the returned isCurrentlyValid field before telling the customer it applies — an offer can exist but be inactive or outside its date window, in which case tell the customer it's not currently available instead of quoting its discount.",
  schema: z.object({
    code: z.string().describe("Offer/discount code"),
  }),
  func: async (input: unknown) => {
    const { code } = input as { code: string };
    const { businessId } = getToolContext();
    console.log("[Tool] getOfferByCode", { businessId, code });
    const result = await getHelpers().getOfferByCode(businessId, code);
    return JSON.stringify(result);
  },
});

export const getComboOffersForProductTool = new DynamicStructuredTool({
  name: "getComboOffersForProduct",
  description: "Check whether a product has any live combo/bundle offer set up with a partner product (e.g. \"Panjabi + Pajama, ৳100 off\"). Call this right after identifying what the customer wants, before they commit — if a combo exists, naturally suggest the partner product and the discount. Never suggest a combo or a discount amount that isn't returned here.",
  schema: z.object({
    productId: z.string().describe("The product the customer is currently interested in"),
  }),
  func: async (input: unknown) => {
    const { productId } = input as { productId: string };
    const { businessId } = getToolContext();
    console.log("[Tool] getComboOffersForProduct", { businessId, productId });
    const result = await getHelpers().getComboOffersForProduct(businessId, productId);
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
    const { businessId } = getToolContext();
    console.log("[Tool] getFAQMatches", { businessId, query, limit });
    const results = await getHelpers().getFAQMatches(businessId, query, limit ?? 5);
    return JSON.stringify(results);
  },
});

export const businessTools = [
  getBusinessProfileTool,
  getOfferByCodeTool,
  getComboOffersForProductTool,
  getFAQMatchesTool,
];
