/**
 * AI Agent Type Definitions
 */

/**
 * Local mirror of packages/api/src/lib/plans.ts's PlanKey — deliberately duplicated
 * rather than importing @acme/api, since this package is kept DB/API-agnostic (see
 * BusinessProfileSnapshot below). Values must stay in sync with PLAN_CATALOG's keys.
 */
export type PlanKey = "starter" | "growth" | "pro";

/** Local mirror of PLAN_CATALOG[*].limits.multiProductCartLimit (packages/api/src/lib/plans.ts)
 * — max distinct line items the agent can add to a single order's cart. */
export const MULTI_PRODUCT_CART_LIMIT: Record<PlanKey, number> = {
  starter: 5,
  growth: 12,
  pro: 28,
};

/** Local mirror of PLAN_CATALOG[*].limits.complaintHandling. */
export const COMPLAINT_HANDLING: Record<PlanKey, "redirect" | "basic_logging"> = {
  starter: "redirect",
  growth: "redirect",
  pro: "basic_logging",
};

/** Local mirror of PLAN_CATALOG[*].limits.bulkInquiryHandling. */
export const BULK_INQUIRY_HANDLING: Record<PlanKey, "redirect" | "automated"> = {
  starter: "redirect",
  growth: "redirect",
  pro: "automated",
};

/** Local mirror of PLAN_CATALOG[*].limits.campaignAutomation — "limited" means only
 * mentioned to customers with a prior purchase, "full" means mentioned to anyone. */
export const CAMPAIGN_AUTOMATION: Record<PlanKey, "none" | "limited" | "full"> = {
  starter: "none",
  growth: "limited",
  pro: "full",
};

// ============================================
// Configuration
// ============================================

export interface AgentConfig {
  /** OpenAI API key */
  apiKey: string;
  /** Base URL for API (OpenRouter, Azure, etc.) */
  baseUrl?: string;
  /** Model to use */
  model: string;
  /** Temperature */
  temperature?: number;
  /** Max tokens */
  maxTokens?: number;
  /** Enable debug logging */
  debug?: boolean;
  /** Subscription plan tier — determines which tools are available (e.g. combo offers,
   * purchase history are excluded for Starter). Defaults to "starter" (most restrictive)
   * if omitted, never to an unlimited tier. */
  planKey?: PlanKey;
}

// ============================================
// Context
// ============================================

export interface ConversationContext {
  /** Store (business) ID — the actual tenant-scoping key. One user can own more than one store. */
  businessId: string;
  /** Thread ID for conversation history */
  threadId: string;
  /** Platform (facebook, instagram, whatsapp) */
  platform: "facebook_page" | "instagram" | "whatsapp";
  /** Customer/sender ID */
  customerId: string;
  /** The customer's real Facebook/Instagram display name (first name), used for a
   * personal greeting — distinct from whatever delivery name they give at checkout,
   * which may belong to someone else (gift orders). Not available for WhatsApp. */
  customerName?: string;
  /** Cached 2-3 sentence AI summary of this conversation, refreshed after each reply —
   * covers anything said earlier than the raw message history window below can reach
   * (e.g. an allergy or complaint mentioned 20+ messages ago). May be one turn stale. */
  conversationSummary?: string;
  /** The real on-file delivery details for this customer, if this thread is already
   * linked to one (i.e. they've ordered before in this conversation) — fetched fresh by
   * the caller every turn and handed to the model directly, rather than trusting it to
   * remember or re-fetch this itself via a tool call. This exists because relying on a
   * "call trackOrder before stating a previous phone number" prompt instruction alone
   * was NOT reliable enough in practice — the model still occasionally fabricated a
   * plausible-looking phone number instead of calling the tool. Providing the real value
   * directly removes the opportunity to guess. */
  knownCustomer?: { name: string; phone: string; address: string };
  /** Connection context for sending messages */
  connectionContext?: ConnectionContext;
  /** Subscription plan tier, used by tool handlers to resolve per-plan limits at call
   * time (e.g. purchase-history depth) via getToolContext(). */
  planKey?: PlanKey;
}

export interface ConnectionContext {
  platform: "facebook_page" | "instagram" | "whatsapp";
  accessToken: string;
  accountId: string;
  recipientId: string;
  connectionId: string;
}

/**
 * Structurally matches (a subset of) the `businessProfile` DB row — kept as a local
 * interface rather than importing @acme/db, since this package is deliberately
 * DB-agnostic and only ever receives data through the injected helpers (see
 * tools/business-tools.ts's BusinessHelpers). Used to build a per-business system prompt
 * instead of the generic, identical-for-every-store prompt this used to be.
 */
export interface BusinessProfileSnapshot {
  name: string;
  description?: string | null;
  industry?: string | null;
  currency?: string | null;
  supportEmail?: string | null;
  supportPhone?: string | null;
  /** Custom persona name for the AI to use instead of "the AI sales assistant" */
  agentName?: string | null;
  /** "friendly" | "professional" | "playful" | "formal" */
  conversationTone?: string | null;
  /** "auto" | "bangla" | "english" */
  preferredLanguage?: string | null;
  /**
   * Whether the store has a working SSLCommerz gateway — derived in the worker
   * (apps/worker/src/index.ts) so the credentials themselves never reach this package.
   * False means COD is the only payment method that exists for this store, and the agent
   * must not offer a link to a checkout nobody can complete.
   */
  onlinePaymentEnabled?: boolean;
}

// ============================================
// Messages
// ============================================

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
  /** Image URLs attached to the message */
  images?: string[];
  /** Timestamp */
  timestamp?: Date;
}

export interface AgentInput {
  /** The user's message */
  message: string;
  /** Attached images (URLs or base64) */
  images?: string[];
  /** Conversation context */
  context: ConversationContext;
  /** Previous messages for context */
  history?: ChatMessage[];
}

export interface AgentOutput {
  /** The agent's response */
  response: string;
  /** Tool calls made during processing */
  toolCalls?: ToolCallLog[];
  /** Processing time in ms */
  processingTime: number;
  /** Number of LLM calls */
  llmCalls: number;
  /** Tokens used */
  tokensUsed?: {
    prompt: number;
    completion: number;
    total: number;
  };
  /** Self-reported confidence score (0-100) extracted from the [CONFIDENCE:XX] tag */
  confidence?: number;
}

// ============================================
// Tools
// ============================================

export interface ToolDefinition {
  name: string;
  description: string;
  schema: Record<string, unknown>;
  handler: (args: Record<string, unknown>, context: ConversationContext) => Promise<unknown>;
}

export interface ToolCallLog {
  name: string;
  input: Record<string, unknown>;
  output: unknown;
  duration: number;
  error?: string;
}

// ============================================
// Logging
// ============================================

export interface AgentLog {
  id: string;
  userId: string;
  threadId: string;
  platform: string;
  input: AgentInput;
  output: AgentOutput;
  toolCalls: ToolCallLog[];
  startedAt: Date;
  completedAt: Date;
  success: boolean;
  error?: string;
}

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug(message: string, data?: Record<string, unknown>): void;
  info(message: string, data?: Record<string, unknown>): void;
  warn(message: string, data?: Record<string, unknown>): void;
  error(message: string, data?: Record<string, unknown>): void;
}

// ============================================
// State
// ============================================

export interface AgentState {
  messages: ChatMessage[];
  context: ConversationContext;
  toolCalls: ToolCallLog[];
  llmCalls: number;
  startTime: number;
}
