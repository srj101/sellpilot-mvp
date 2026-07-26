/**
 * Single source of truth for plan names, prices, and limits across the pricing page,
 * the billing dashboard, the locked page, and feature gating. Nothing in the app should
 * ever write a plan name or a taka amount as a literal outside this file — see
 * SELLPILOT_PHASE1_BILLING_PAYMENTS_PLAN.md D1.
 */

export const BILLING_CYCLES = ["monthly", "half_yearly", "yearly", "lifetime"] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];

export const CYCLE_META: Record<BillingCycle, { label: string; shortLabel: string; months: number; discountPct: number }> = {
  monthly: { label: "Monthly", shortLabel: "/mo", months: 1, discountPct: 0 },
  half_yearly: { label: "Half-Yearly", shortLabel: "/6mo", months: 6, discountPct: 10 },
  yearly: { label: "Yearly", shortLabel: "/yr", months: 12, discountPct: 20 },
  // One-time, never renews — see PLAN_CATALOG note below on why prices are null.
  lifetime: { label: "Lifetime", shortLabel: "once", months: 0, discountPct: 0 },
};

export const PLAN_KEYS = ["starter", "growth", "pro"] as const;
export type PlanKey = (typeof PLAN_KEYS)[number];

export interface PlanLimits {
  /** null = unlimited (fair use) */
  aiTokensPerMonth: number | null;
  products: number;
  /** null = unlimited */
  teamSeats: number | null;
  channels: ("messenger" | "instagram" | "whatsapp")[];
  /** null = unlimited */
  invoices: number | null;
  conversationRetentionDays: number;
}

export interface PlanCatalogEntry {
  key: PlanKey;
  name: string;
  tagline: string;
  /** Whole taka (see D2). Keyed by cycle; lifetime is null until priced — see Q1 in the plan doc. */
  prices: Record<BillingCycle, number | null>;
  limits: PlanLimits;
  features: string[];
  popular?: boolean;
}

function cyclePrices(monthly: number): Record<BillingCycle, number | null> {
  return {
    monthly,
    half_yearly: Math.round(monthly * CYCLE_META.half_yearly.months * (1 - CYCLE_META.half_yearly.discountPct / 100)),
    yearly: Math.round(monthly * CYCLE_META.yearly.months * (1 - CYCLE_META.yearly.discountPct / 100)),
    // BLOCKING (Q1): spec §6 lists Lifetime as a cycle but gives no number for any tier.
    // Render "Contact Sales" wherever this is null instead of guessing at a price.
    lifetime: null,
  };
}

export const PLAN_CATALOG: Record<PlanKey, PlanCatalogEntry> = {
  starter: {
    key: "starter",
    name: "Starter",
    tagline: "Essential AI selling for a single channel.",
    prices: cyclePrices(3999),
    limits: {
      aiTokensPerMonth: 150_000,
      products: 50,
      teamSeats: 1,
      channels: ["messenger"],
      invoices: 5,
      conversationRetentionDays: 90,
    },
    features: [
      "Messenger channel",
      "150,000 AI tokens / month",
      "Up to 50 products",
      "1 team member",
      "Image search (Vision)",
      "Basic smart recommendations",
      "90-day conversation history",
      "5 invoices",
    ],
  },
  growth: {
    key: "growth",
    name: "Growth",
    tagline: "Multi-channel selling with upselling built in.",
    prices: cyclePrices(9999),
    limits: {
      aiTokensPerMonth: 800_000,
      products: 100,
      teamSeats: 3,
      channels: ["messenger", "instagram"],
      invoices: null,
      conversationRetentionDays: 180,
    },
    features: [
      "Messenger + Instagram",
      "800,000 AI tokens / month",
      "Up to 100 products",
      "3 team members",
      "Recommendations + upselling",
      "Multi-product cart",
      "Generic abandoned-cart recovery",
      "Basic customer purchase history",
      "180-day conversation history",
      "Unlimited invoices",
    ],
    popular: true,
  },
  pro: {
    key: "pro",
    name: "Pro",
    tagline: "The full AI commerce agent, unlimited team.",
    prices: cyclePrices(24999),
    limits: {
      aiTokensPerMonth: null,
      products: 200,
      teamSeats: null,
      channels: ["messenger", "instagram", "whatsapp"],
      invoices: null,
      conversationRetentionDays: 730,
    },
    features: [
      "WhatsApp + Messenger + Instagram",
      "Unlimited AI tokens (fair use)",
      "Up to 200 products",
      "Unlimited team members",
      "Advanced recommendations, upselling & cross-selling",
      "Full AI-personalized abandoned-cart recovery",
      "Personalized returning-customer greetings",
      "Full customer purchase history",
      "Voice messages (Whisper)",
      "Campaign & promo automation",
      "Executive AI copilot analytics",
      "2-year conversation history",
    ],
  },
};

export function getPlan(key: string): PlanCatalogEntry | undefined {
  return PLAN_CATALOG[key as PlanKey];
}

/** "৳24,999+" for Pro — the "+" is presentational only, the charged amount is the catalog number. */
export function formatPlanPrice(amount: number | null): string {
  if (amount === null) return "Contact Sales";
  return `৳${amount.toLocaleString("en-US")}`;
}

export function priceForCycle(plan: PlanKey, cycle: BillingCycle): number | null {
  return PLAN_CATALOG[plan].prices[cycle];
}
