/**
 * Single source of truth for plan names, prices, and limits across the pricing page,
 * the billing dashboard, the locked page, and feature gating. Nothing in the app should
 * ever write a plan name or a taka amount as a literal outside this file — see
 * SELLPILOT_PHASE1_BILLING_PAYMENTS_PLAN.md D1.
 */

export const BILLING_CYCLES = ["monthly", "half_yearly", "yearly"] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];

export const CYCLE_META: Record<BillingCycle, { label: string; shortLabel: string; months: number; discountPct: number }> = {
  monthly: { label: "Monthly", shortLabel: "/mo", months: 1, discountPct: 0 },
  half_yearly: { label: "Half-Yearly", shortLabel: "/6mo", months: 6, discountPct: 10 },
  yearly: { label: "Yearly", shortLabel: "/yr", months: 12, discountPct: 20 },
};

export const PLAN_KEYS = ["starter", "growth", "pro"] as const;
export type PlanKey = (typeof PLAN_KEYS)[number];

export interface PlanLimits {
  /** null = unlimited (fair use). Counted one-per-message, not by token volume — see
   * ai-conversations.ts. Beyond this, the account isn't cut off; overage is billed per
   * OVERAGE_RATES below. */
  aiConversationsPerMonth: number | null;
  products: number;
  /** null = unlimited */
  teamSeats: number | null;
  channels: ("messenger" | "instagram" | "whatsapp")[];
  /** null = unlimited */
  invoices: number | null;
  conversationRetentionDays: number;
  /** GB of media/attachment storage for conversation history. */
  storageGb: number;
  /** Max distinct line items the agent can hold in a single multi-product cart. */
  multiProductCartLimit: number;
  /** Starter: exact-match answers only. Growth: may upsell within the same product line.
   * Pro: may upsell + proactively cross-sell using combo offers. */
  recommendationTier: "basic" | "upsell" | "advanced";
  /** Starter: no abandoned-cart follow-up sent at all. Growth: generic nudge, never
   * references the product. Pro: real LLM-generated message referencing the actual cart item. */
  abandonedCartRecovery: "none" | "generic" | "personalized";
  /** Whether the customer-purchase-history tool is exposed to the agent at all. */
  purchaseHistoryEnabled: boolean;
  /** null = full history. Ignored when purchaseHistoryEnabled is false. */
  purchaseHistoryLimit: number | null;
  analyticsTier: "none" | "basic" | "full";
  ecommerceTier: "none" | "basic" | "full";
  /** Executive AI Copilot (natural-language analytics Q&A) — separate tier from
   * analyticsTier because Starter has dashboards but no copilot at all. */
  copilotTier: "none" | "basic" | "full";
  /** Campaign & Promo Automation — Growth gets limited/most-purchased-only, Pro gets full. */
  campaignAutomation: "none" | "limited" | "full";
  /** Complaint/return/refund handling depth. */
  complaintHandling: "redirect" | "basic_logging";
  /** Bulk/wholesale inquiry handling depth. */
  bulkInquiryHandling: "redirect" | "automated";
  reviewCollectionEnabled: boolean;
  personalizedGreetingEnabled: boolean;
  voiceMessagesEnabled: boolean;
  whiteLabelEnabled: boolean;
  /** Campaign & Promo Automation — Pro-only creation/editing of offers. */
  offersEnabled: boolean;
}

export interface PlanCatalogEntry {
  key: PlanKey;
  name: string;
  tagline: string;
  /** Whole taka (see D2), keyed by cycle. */
  prices: Record<BillingCycle, number>;
  limits: PlanLimits;
  features: string[];
  popular?: boolean;
}

function cyclePrices(monthly: number): Record<BillingCycle, number> {
  return {
    monthly,
    half_yearly: Math.round(monthly * CYCLE_META.half_yearly.months * (1 - CYCLE_META.half_yearly.discountPct / 100)),
    yearly: Math.round(monthly * CYCLE_META.yearly.months * (1 - CYCLE_META.yearly.discountPct / 100)),
  };
}

export const PLAN_CATALOG: Record<PlanKey, PlanCatalogEntry> = {
  starter: {
    key: "starter",
    name: "Starter",
    tagline: "For businesses just starting with AI-driven sales.",
    prices: cyclePrices(4999),
    limits: {
      aiConversationsPerMonth: 8_000,
      products: 30,
      teamSeats: 1,
      channels: ["messenger"],
      invoices: 5,
      conversationRetentionDays: 30,
      storageGb: 3,
      multiProductCartLimit: 5,
      recommendationTier: "basic",
      abandonedCartRecovery: "none",
      purchaseHistoryEnabled: true,
      purchaseHistoryLimit: 1,
      analyticsTier: "none",
      ecommerceTier: "none",
      copilotTier: "none",
      campaignAutomation: "none",
      complaintHandling: "redirect",
      bulkInquiryHandling: "redirect",
      reviewCollectionEnabled: false,
      personalizedGreetingEnabled: false,
      voiceMessagesEnabled: false,
      whiteLabelEnabled: false,
      offersEnabled: false,
    },
    features: [
      "Messenger",
      "8,000 AI conversations / month",
      "Up to 30 products",
      "1 team member",
      "30-day conversation history · 3 GB storage",
      "Basic smart recommendations",
      "Standard revenue & inventory dashboard",
      "5 invoices",
    ],
  },
  growth: {
    key: "growth",
    name: "Growth",
    tagline: "For growing businesses ready to scale automation.",
    prices: cyclePrices(11999),
    limits: {
      aiConversationsPerMonth: 20_000,
      products: 90,
      teamSeats: 3,
      channels: ["messenger", "instagram"],
      invoices: null,
      conversationRetentionDays: 182,
      storageGb: 10,
      multiProductCartLimit: 12,
      recommendationTier: "upsell",
      abandonedCartRecovery: "generic",
      purchaseHistoryEnabled: true,
      purchaseHistoryLimit: 5,
      analyticsTier: "basic",
      ecommerceTier: "basic",
      copilotTier: "basic",
      campaignAutomation: "limited",
      complaintHandling: "redirect",
      bulkInquiryHandling: "redirect",
      reviewCollectionEnabled: true,
      personalizedGreetingEnabled: false,
      voiceMessagesEnabled: false,
      whiteLabelEnabled: false,
      offersEnabled: true,
    },
    features: [
      "Messenger + Instagram",
      "20,000 AI conversations / month",
      "Up to 90 products",
      "3 team members",
      "Recommendations + upselling",
      "Multi-product cart (up to 12 items)",
      "Generic abandoned-cart recovery",
      "Basic purchase history (last 5 orders)",
      "6-month conversation history · 10 GB storage",
      "Basic analytics + Executive AI Copilot",
      "Unlimited invoices",
    ],
    popular: true,
  },
  pro: {
    key: "pro",
    name: "Pro",
    tagline: "For established businesses running at full volume.",
    prices: cyclePrices(17999),
    limits: {
      aiConversationsPerMonth: 50_000,
      products: 200,
      teamSeats: 7,
      channels: ["messenger", "instagram", "whatsapp"],
      invoices: null,
      conversationRetentionDays: 548,
      storageGb: 25,
      multiProductCartLimit: 28,
      recommendationTier: "advanced",
      abandonedCartRecovery: "personalized",
      purchaseHistoryEnabled: true,
      purchaseHistoryLimit: null,
      analyticsTier: "full",
      ecommerceTier: "full",
      copilotTier: "full",
      campaignAutomation: "full",
      complaintHandling: "basic_logging",
      bulkInquiryHandling: "automated",
      reviewCollectionEnabled: true,
      personalizedGreetingEnabled: true,
      voiceMessagesEnabled: true,
      whiteLabelEnabled: true,
      offersEnabled: true,
    },
    features: [
      "Messenger + Instagram + WhatsApp",
      "50,000 AI conversations / month (fair use)",
      "Up to 200 products (fair use)",
      "7 team members",
      "Recommendations + upselling + cross-selling",
      "Multi-product cart (up to 28 items)",
      "AI-personalized abandoned-cart recovery",
      "Personalized returning-customer greetings",
      "Full customer purchase history",
      "Voice message support (voice-to-text)",
      "Full analytics + Full Executive AI Copilot",
      "Campaign & seasonal promo automation",
      "Custom branding / white-label",
      "1.5-year conversation history · 25 GB storage",
      "Priority, unlimited, dedicated support",
    ],
  },
};

/** ৳ per unit of overage once a plan's included monthly conversation volume is used up.
 * Service is never hard-cut mid-cycle (see markUsageOverage in the renewal worker) —
 * overage is billed at the next invoice, or the account can upgrade instantly. Pro has no
 * flat overage rate; scale-up happens via PRO_ADD_ONS below instead. */
export const OVERAGE_RATES: Record<PlanKey, { pricePerBlock: number; blockSize: number } | null> = {
  starter: { pricePerBlock: 1500, blockSize: 500 },
  growth: { pricePerBlock: 2000, blockSize: 1000 },
  pro: null,
};

/** Usage thresholds that trigger an automatic in-app + email alert (billing plan §"Overage
 * & Fair-Use Policy"). Expressed as a fraction of the plan's included volume. */
export const USAGE_ALERT_THRESHOLDS = [0.8, 1] as const;

export interface AddOn {
  key: string;
  name: string;
  price: number;
  billing: "monthly";
}

/** Pro-only scale-up add-ons — "Pro pricing scales with volume" cashes out as these,
 * not a usage-based formula. Add only what's needed, cancel any time. */
export const PRO_ADD_ONS: AddOn[] = [
  { key: "extra_conversations_5k", name: "Additional 5,000 AI conversations", price: 3500, billing: "monthly" },
  { key: "extra_whatsapp_number", name: "Additional WhatsApp Business number", price: 2500, billing: "monthly" },
];

/** ৳ per single AI conversation at full included volume — shown as the "effective rate"
 * on the overage/fair-use comparison table. Null when there's no fixed monthly price to
 * divide (shouldn't happen for the three paid tiers). */
export function effectiveRatePerConversation(plan: PlanKey, cycle: BillingCycle = "monthly"): number | null {
  const entry = PLAN_CATALOG[plan];
  const price = entry.prices[cycle];
  const volume = entry.limits.aiConversationsPerMonth;
  if (price === null || !volume) return null;
  return price / volume;
}

/** Slider step size and cap for pre-purchasing extra conversation capacity on top of a
 * plan's base included volume (see ConversationSlider / computeExtraConversationsCost). */
export const EXTRA_CONVERSATIONS_STEP = 500;
export const EXTRA_CONVERSATIONS_MAX_MULTIPLIER = 3;

/** Block price used to price a *deliberate* extra-capacity purchase (the pricing-page
 * slider) — OVERAGE_RATES for Starter/Growth, or Pro's existing "Additional 5,000 AI
 * conversations" scale-up add-on for Pro, since OVERAGE_RATES.pro is intentionally null
 * (Pro's *automatic* metered overage is never auto-charged — see computeOverageAmount).
 * An explicit purchase is a different thing from silent metered billing, so it's fine for
 * Pro to have a price here even though it has no OVERAGE_RATES entry. */
export function extraConversationsRate(plan: PlanKey): { pricePerBlock: number; blockSize: number } | null {
  const rate = OVERAGE_RATES[plan];
  if (rate) return rate;
  const proAddOn = PRO_ADD_ONS.find((addOn) => addOn.key === "extra_conversations_5k");
  return proAddOn ? { pricePerBlock: proAddOn.price, blockSize: 5000 } : null;
}

/** ৳ cost to add `extra` conversations on top of a plan's included volume, at
 * extraConversationsRate's block price. Shared by the pricing-page slider preview and by
 * subscribe/changePlan/business.create, so the price shown is always the price charged. */
export function computeExtraConversationsCost(plan: PlanKey, extra: number): number {
  const rate = extraConversationsRate(plan);
  if (!rate || extra <= 0) return 0;
  const blocks = Math.ceil(extra / rate.blockSize);
  return blocks * rate.pricePerBlock;
}

/** Whole-taka *automatic* overage charge for a period's usage against a plan's included
 * volume plus any pre-purchased extra capacity (`includedExtra`) — strictly OVERAGE_RATES,
 * not extraConversationsRate's Pro fallback above: Pro usage beyond what was deliberately
 * purchased is never auto-charged at renewal (billing plan intent — scale-up needs a
 * conscious purchase, not a silent metered charge). 0 when under the effective limit, or
 * when the plan has no fixed overage rate (Pro). */
export function computeOverageAmount(plan: PlanKey, used: number, includedExtra = 0): number {
  const limit = PLAN_CATALOG[plan].limits.aiConversationsPerMonth;
  const rate = OVERAGE_RATES[plan];
  if (limit === null || !rate) return 0;
  const effectiveLimit = limit + includedExtra;
  if (used <= effectiveLimit) return 0;
  const overageUnits = used - effectiveLimit;
  const blocks = Math.ceil(overageUnits / rate.blockSize);
  return blocks * rate.pricePerBlock;
}

export function getPlan(key: string): PlanCatalogEntry | undefined {
  return PLAN_CATALOG[key as PlanKey];
}

/** "৳24,999+" for Pro — the "+" is presentational only, the charged amount is the catalog number. */
export function formatPlanPrice(amount: number): string {
  return `৳${amount.toLocaleString("en-US")}`;
}

export function priceForCycle(plan: PlanKey, cycle: BillingCycle): number {
  return PLAN_CATALOG[plan].prices[cycle];
}
