/**
 * Business-related AI Tools
 */

import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { getToolContext } from "./context";
import type { BusinessProfileSnapshot } from "../types";
import { BULK_INQUIRY_HANDLING, CAMPAIGN_AUTOMATION, COMPLAINT_HANDLING } from "../types";

export interface ComboOffer {
  offerId: string;
  title: string;
  type: string;
  value: number;
  partnerProductId: string | null;
  partnerProductName: string | null;
}

export interface CampaignOffer {
  offerId: string;
  title: string;
  description: string | null;
  code: string | null;
  type: string;
  value: number;
  minSubtotal: number;
}

// Type for business helpers (injected at runtime)
export interface BusinessHelpers {
  getBusinessProfile(businessId: string): Promise<BusinessProfileSnapshot | null>;
  getOfferByCode(businessId: string, code: string): Promise<unknown>;
  getComboOffersForProduct(businessId: string, productId: string): Promise<ComboOffer[]>;
  /** B.7 — offers flagged for proactive, unprompted mention (festival/seasonal campaigns). */
  getActiveCampaigns(businessId: string): Promise<CampaignOffer[]>;
  /** Growth's "limited" campaign targeting rule — only mention to repeat customers. */
  hasPriorPurchases(businessId: string, threadId: string): Promise<boolean>;
  getFAQMatches(businessId: string, query: string, limit?: number): Promise<unknown[]>;
  /** FR-AGT-15 auto-escalation — hands the thread to human handling starting with the
   * customer's next message. */
  escalateToHuman(businessId: string, threadId: string, reason: string): Promise<void>;
  /** Pro tier's "basic logging + alert" — owner gets notified, AI keeps handling the chat. */
  logComplaint(businessId: string, customerName: string | undefined, note: string): Promise<void>;
  /** Pro tier's "automated + contact routing" — owner gets notified, agent gets the
   * store's support contact back to relay directly. */
  routeBulkInquiry(
    businessId: string,
    threadId: string,
    customerName: string | undefined,
    note: string,
  ): Promise<{ contactEmail: string | null; contactPhone: string | null }>;
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
  description: "Check whether a product has a live combo/bundle offer with a partner product (e.g. \"Panjabi + Pajama, ৳100 off\"). Call right after identifying what the customer wants, before they commit. Never suggest a combo or discount not returned here.",
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

export const getActiveCampaignsTool = new DynamicStructuredTool({
  name: "getActiveCampaigns",
  description: "Call once near the start of a conversation (right after greeting) to check for any active store-wide festival/seasonal campaign offers to proactively mention — this is unprompted, unlike getOfferByCode. May return an empty list, in which case say nothing about campaigns. Never invent or mention a discount not returned here.",
  schema: z.object({}),
  func: async () => {
    const { businessId, threadId, planKey } = getToolContext();
    const mode = CAMPAIGN_AUTOMATION[planKey ?? "starter"];
    console.log("[Tool] getActiveCampaigns", { businessId, mode });

    if (mode === "none") return JSON.stringify([]);

    const campaigns = await getHelpers().getActiveCampaigns(businessId);
    if (campaigns.length === 0) return JSON.stringify([]);

    if (mode === "limited") {
      const eligible = await getHelpers().hasPriorPurchases(businessId, threadId);
      if (!eligible) return JSON.stringify([]);
    }

    return JSON.stringify(campaigns);
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

export const reportComplaintTool = new DynamicStructuredTool({
  name: "reportComplaint",
  description:
    "Call when a customer reports a problem with an order: wrong item, damaged item, wants to return or a refund, or delivery is late/missing. Do NOT try to resolve the return/refund yourself — this tool handles it per the store's plan. After calling it, tell the customer what happens next based on the result (escalated vs logged) — never promise a specific refund amount or timeline yourself.",
  schema: z.object({
    summary: z.string().describe("One short sentence summarizing the complaint, in English, for the business owner"),
  }),
  func: async (input: unknown) => {
    const { summary } = input as { summary: string };
    const { businessId, threadId, customerName, planKey } = getToolContext();
    const mode = COMPLAINT_HANDLING[planKey ?? "starter"];
    console.log("[Tool] reportComplaint", { businessId, threadId, mode, summary });

    if (mode === "redirect") {
      await getHelpers().escalateToHuman(businessId, threadId, `Complaint: ${summary}`);
      return JSON.stringify({ action: "escalated" });
    }

    await getHelpers().logComplaint(businessId, customerName, summary);
    return JSON.stringify({ action: "logged" });
  },
});

export const reportBulkInquiryTool = new DynamicStructuredTool({
  name: "reportBulkInquiry",
  description:
    "Call when a customer is asking about a large/bulk/wholesale order or reselling (not a normal single-customer purchase). Handles it per the store's plan — after calling it, either tell the customer you're connecting them with the team (escalated), or share the contact info it returns for their wholesale request (routed).",
  schema: z.object({
    summary: z.string().describe("One short sentence summarizing what they're asking for, in English, for the business owner"),
  }),
  func: async (input: unknown) => {
    const { summary } = input as { summary: string };
    const { businessId, threadId, customerName, planKey } = getToolContext();
    const mode = BULK_INQUIRY_HANDLING[planKey ?? "starter"];
    console.log("[Tool] reportBulkInquiry", { businessId, threadId, mode, summary });

    if (mode === "redirect") {
      await getHelpers().escalateToHuman(businessId, threadId, `Bulk/wholesale inquiry: ${summary}`);
      return JSON.stringify({ action: "escalated" });
    }

    const contact = await getHelpers().routeBulkInquiry(businessId, threadId, customerName, summary);
    return JSON.stringify({ action: "routed", ...contact });
  },
});

export const businessTools = [
  getBusinessProfileTool,
  getOfferByCodeTool,
  getComboOffersForProductTool,
  getActiveCampaignsTool,
  getFAQMatchesTool,
  reportComplaintTool,
  reportBulkInquiryTool,
];
